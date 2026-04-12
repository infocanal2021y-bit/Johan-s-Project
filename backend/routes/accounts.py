"""Account & user routes"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
import uuid, logging
from config import db, strip_id
from services.auth import get_current_user
from services.notifications import create_notification

router = APIRouter()

# Import gamification functions from server (they remain there for now)
def _get_gamification():
    import server
    return server.calculate_user_level, server.get_next_level_info, server.check_and_unlock_achievements

# ==================== ACCOUNT ROUTES ====================

@router.get("/accounts", response_model=List[AccountResponse])
async def get_accounts(current_user: dict = Depends(get_current_user)):
    accounts = await db.accounts.find({'user_id': current_user['id']}, {'_id': 0}).to_list(100)
    return [AccountResponse(**acc) for acc in accounts]

@router.get("/accounts/summary/total")
async def get_account_summary(current_user: dict = Depends(get_current_user)):
    accounts = await db.accounts.find({'user_id': current_user['id']}, {'_id': 0}).to_list(100)
    
    total_usd = sum(acc['balance_usd'] for acc in accounts)
    total_eur = sum(acc['balance_eur'] for acc in accounts)
    
    savings = next((acc for acc in accounts if acc['account_type'] == 'savings'), None)
    invested_usd = savings['balance_usd'] if savings else 0
    invested_eur = savings['balance_eur'] if savings else 0
    
    checking = next((acc for acc in accounts if acc['account_type'] == 'checking'), None)
    available_usd = checking['balance_usd'] if checking else 0
    available_eur = checking['balance_eur'] if checking else 0
    
    return {
        'total': {'usd': total_usd, 'eur': total_eur},
        'available': {'usd': available_usd, 'eur': available_eur},
        'invested': {'usd': invested_usd, 'eur': invested_eur},
        'accounts': accounts
    }

@router.get("/accounts/investment-history")
async def get_investment_history(current_user: dict = Depends(get_current_user)):
    """Get investment reservation history for current user"""
    investments = await db.transactions.find(
        {'user_id': current_user['id'], 'transaction_type': 'investment_reserve'},
        {'_id': 0}
    ).sort('created_at', -1).to_list(100)

    savings = await db.accounts.find_one(
        {'user_id': current_user['id'], 'account_type': 'savings'}, {'_id': 0}
    )
    total_invested_eur = savings.get('balance_eur', 0) if savings else 0
    total_invested_usd = savings.get('balance_usd', 0) if savings else 0

    return {
        'total_invested_eur': round(total_invested_eur, 2),
        'total_invested_usd': round(total_invested_usd, 0),
        'status': 'Fondos reservados' if (total_invested_eur > 0 or total_invested_usd > 0) else 'Sin inversiones',
        'count': len(investments),
        'history': [{
            'id': inv.get('id'),
            'amount': inv.get('amount', 0),
            'currency': inv.get('currency', 'EUR'),
            'status': inv.get('status', 'completed'),
            'description': inv.get('description', ''),
            'type': 'Reserva para inversion',
            'created_at': inv.get('created_at'),
        } for inv in investments],
    }

@router.get("/accounts/{account_id}", response_model=AccountResponse)
async def get_account(account_id: str, current_user: dict = Depends(get_current_user)):
    account = await db.accounts.find_one({'id': account_id, 'user_id': current_user['id']}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    return AccountResponse(**account)

# ==================== INVESTMENT RESERVATION ====================

@router.post("/accounts/invest")
async def reserve_investment(req: InvestmentRequest, current_user: dict = Depends(get_current_user)):
    """Reserve funds from checking to savings as 'investment reservation'"""
    if req.amount < 300:
        raise HTTPException(status_code=400, detail='El monto minimo de inversion es €300')
    
    account = await db.accounts.find_one({'id': req.account_id, 'user_id': current_user['id'], 'account_type': 'checking'}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Cuenta corriente no encontrada')
    
    balance_field = 'balance_eur' if req.currency == 'EUR' else 'balance_usd'
    if account[balance_field] < req.amount:
        raise HTTPException(status_code=400, detail='Saldo insuficiente')
    
    # Deduct from checking
    await db.accounts.update_one(
        {'id': req.account_id},
        {'$inc': {balance_field: -req.amount}}
    )
    
    # Add to savings
    savings = await db.accounts.find_one({'user_id': current_user['id'], 'account_type': 'savings'}, {'_id': 0})
    if savings:
        await db.accounts.update_one(
            {'id': savings['id']},
            {'$inc': {balance_field: req.amount}}
        )
    
    # Log transaction
    tx_id = str(uuid.uuid4())
    await db.transactions.insert_one({
        'id': tx_id,
        'user_id': current_user['id'],
        'account_id': req.account_id,
        'transaction_type': 'investment_reserve',
        'amount': req.amount,
        'currency': req.currency,
        'status': 'completed',
        'description': f'Reserva de inversion: {req.amount} {req.currency}',
        'created_at': datetime.now(timezone.utc).isoformat(),
    })
    
    await create_notification(current_user['id'], 'Inversion Reservada',
        f'Ha reservado {req.amount} {req.currency} para la seccion de inversion futura.')
    
    return {'message': 'Fondos reservados para inversion', 'amount': req.amount, 'currency': req.currency}

# ==================== USER ACTIVITY TRACKING ====================

# ==================== ACHIEVEMENTS SYSTEM ====================

ACHIEVEMENTS_DEF = [
    {'id': 'first_login', 'name': 'Primer Acceso', 'desc': 'Iniciar sesion por primera vez', 'icon': '🏆', 'category': 'basico'},
    {'id': 'kyc_verified', 'name': 'Identidad Verificada', 'desc': 'Completar verificacion KYC', 'icon': '🔐', 'category': 'basico'},
    {'id': 'first_investment', 'name': 'Primera Inversion', 'desc': 'Reservar fondos por primera vez', 'icon': '💰', 'category': 'inversion'},
    {'id': 'first_withdrawal', 'name': 'Primer Retiro', 'desc': 'Solicitar primer retiro', 'icon': '📤', 'category': 'transacciones'},
    {'id': 'streak_5', 'name': 'Racha de 5 Dias', 'desc': 'Acceder 5 dias consecutivos', 'icon': '🔥', 'category': 'actividad'},
    {'id': 'active_user', 'name': 'Usuario Activo', 'desc': '10+ accesos en un mes', 'icon': '⭐', 'category': 'actividad'},
    {'id': 'committed_investor', 'name': 'Inversor Comprometido', 'desc': 'Mantener inversion por 7+ dias', 'icon': '💎', 'category': 'inversion'},
    {'id': 'level_plata', 'name': 'Nivel Plata', 'desc': 'Alcanzar nivel Plata', 'icon': '🥈', 'category': 'niveles'},
    {'id': 'level_oro', 'name': 'Nivel Oro', 'desc': 'Alcanzar nivel Oro', 'icon': '🥇', 'category': 'niveles'},
    {'id': 'level_platino', 'name': 'Nivel Platino', 'desc': 'Alcanzar nivel Platino', 'icon': '💠', 'category': 'niveles'},
]

async def check_and_unlock_achievements(user_id: str):
    """Check all achievement conditions and unlock new ones. Returns list of newly unlocked."""
    existing = await db.achievements.find({'user_id': user_id}, {'_id': 0}).to_list(100)
    unlocked_ids = {a['achievement_id'] for a in existing}
    newly_unlocked = []
    
    user = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not user:
        return []
    
    async def unlock(ach_id):
        if ach_id not in unlocked_ids:
            await db.achievements.insert_one({
                'user_id': user_id,
                'achievement_id': ach_id,
                'unlocked_at': datetime.now(timezone.utc).isoformat(),
            })
            ach_def = next((a for a in ACHIEVEMENTS_DEF if a['id'] == ach_id), None)
            if ach_def:
                newly_unlocked.append(ach_def)
                await create_notification(user_id, f'Logro desbloqueado: {ach_def["name"]}!',
                    f'{ach_def["icon"]} {ach_def["desc"]}')
    
    # 1. first_login - always true if user exists
    await unlock('first_login')
    
    # 2. kyc_verified
    if user.get('verification_status') == 'verified':
        await unlock('kyc_verified')
    
    # 3. first_investment
    inv_tx = await db.transactions.find_one({'user_id': user_id, 'transaction_type': 'investment_reserve'})
    if inv_tx:
        await unlock('first_investment')
    
    # 4. first_withdrawal
    wd_tx = await db.transactions.find_one({'user_id': user_id, 'transaction_type': 'withdraw'})
    if wd_tx:
        await unlock('first_withdrawal')
    
    # 5. streak_5 - 5 consecutive days with login
    since_7d = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    logins = await db.login_history.find(
        {'user_id': user_id, 'timestamp': {'$gte': since_7d}},
        {'_id': 0, 'timestamp': 1}
    ).to_list(200)
    if logins:
        login_days = sorted(set(l['timestamp'][:10] for l in logins if isinstance(l.get('timestamp'), str)))
        max_streak = 1
        current_streak = 1
        for i in range(1, len(login_days)):
            try:
                d1 = datetime.fromisoformat(login_days[i-1])
                d2 = datetime.fromisoformat(login_days[i])
                if (d2 - d1).days == 1:
                    current_streak += 1
                    max_streak = max(max_streak, current_streak)
                else:
                    current_streak = 1
            except Exception:
                pass
        if max_streak >= 5:
            await unlock('streak_5')
    
    # 6. active_user - 10+ logins in 30 days
    since_30d = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    login_count = await db.login_history.count_documents({
        'user_id': user_id, 'timestamp': {'$gte': since_30d}
    })
    if login_count >= 10:
        await unlock('active_user')
    
    # 7. committed_investor - investment for 7+ days
    first_inv = await db.transactions.find_one(
        {'user_id': user_id, 'transaction_type': 'investment_reserve'},
        sort=[('created_at', 1)]
    )
    if first_inv and first_inv.get('created_at'):
        try:
            inv_date = datetime.fromisoformat(first_inv['created_at'].replace('Z', '+00:00'))
            if (datetime.now(timezone.utc) - inv_date).days >= 7:
                await unlock('committed_investor')
        except Exception:
            pass
    
    # 8-10. Level achievements
    level = user.get('gamification_level', 'bronce')
    level_order = LEVEL_CONFIG.get(level, {}).get('order', 0)
    if level_order >= 1:
        await unlock('level_plata')
    if level_order >= 2:
        await unlock('level_oro')
    if level_order >= 3:
        await unlock('level_platino')
    
    return newly_unlocked

@router.get("/user/achievements")
async def get_user_achievements(current_user: dict = Depends(get_current_user)):
    """Get all achievements with unlocked status"""
    # Check and potentially unlock new ones
    newly_unlocked = await check_and_unlock_achievements(current_user['id'])
    
    unlocked = await db.achievements.find({'user_id': current_user['id']}, {'_id': 0}).to_list(100)
    unlocked_map = {a['achievement_id']: a['unlocked_at'] for a in unlocked}
    
    result = []
    for ach in ACHIEVEMENTS_DEF:
        result.append({
            'id': ach['id'],
            'name': ach['name'],
            'desc': ach['desc'],
            'icon': ach['icon'],
            'category': ach['category'],
            'unlocked': ach['id'] in unlocked_map,
            'unlocked_at': unlocked_map.get(ach['id']),
        })
    
    total = len(ACHIEVEMENTS_DEF)
    completed = sum(1 for a in result if a['unlocked'])
    
    return {
        'achievements': result,
        'total': total,
        'completed': completed,
        'progress': round((completed / total) * 100) if total > 0 else 0,
        'newly_unlocked': newly_unlocked,
    }

# ==================== GAMIFICATION / USER LEVELS ====================

LEVEL_CONFIG = {
    'bronce': {'min_balance': 0, 'min_logins': 0, 'label': 'Bronce', 'icon': '🥉', 'order': 0,
               'benefits': ['Acceso basico a la plataforma', 'Tiempo de procesamiento estandar']},
    'plata': {'min_balance': 2500, 'min_logins': 5, 'label': 'Plata', 'icon': '🥈', 'order': 1,
              'benefits': ['Procesamiento prioritario', 'Limites de retiro mas altos', 'Soporte preferente']},
    'oro': {'min_balance': 10000, 'min_logins': 15, 'label': 'Oro', 'icon': '🥇', 'order': 2,
            'benefits': ['Procesamiento express', 'Sin limites de retiro', 'Badge visible en perfil', 'Alertas avanzadas']},
    'platino': {'min_balance': 25000, 'min_logins': 0, 'label': 'Platino', 'icon': '💎', 'order': 3,
                'benefits': ['Maxima prioridad', 'Acceso anticipado a nuevas funciones', 'Soporte dedicado', 'Beneficios exclusivos']},
}

def calculate_user_level(total_balance_eur: float, login_count: int, has_investment: bool):
    """Calculate user level based on balance + logins + investment"""
    # Platino: balance >= 25000 OR active investment with balance >= 25000
    if total_balance_eur >= 25000 or (has_investment and total_balance_eur >= 25000):
        return 'platino'
    # Oro: balance >= 10000 OR 15+ logins
    if total_balance_eur >= 10000 or login_count >= 15:
        return 'oro'
    # Plata: balance >= 2500 OR 5+ logins
    if total_balance_eur >= 2500 or login_count >= 5:
        return 'plata'
    return 'bronce'

def get_next_level_info(current_level: str, total_balance_eur: float, login_count: int):
    """Get progress toward next level"""
    levels = ['bronce', 'plata', 'oro', 'platino']
    idx = levels.index(current_level)
    if idx >= len(levels) - 1:
        return None  # Already max level
    
    next_lvl = levels[idx + 1]
    cfg = LEVEL_CONFIG[next_lvl]
    
    balance_needed = max(0, cfg['min_balance'] - total_balance_eur)
    logins_needed = max(0, cfg['min_logins'] - login_count) if cfg['min_logins'] > 0 else None
    
    # Progress percentage (based on balance toward next level)
    if cfg['min_balance'] > 0:
        prev_min = LEVEL_CONFIG[current_level]['min_balance']
        range_total = cfg['min_balance'] - prev_min
        progress_amount = total_balance_eur - prev_min
        balance_progress = min(100, max(0, (progress_amount / range_total) * 100)) if range_total > 0 else 0
    else:
        balance_progress = 0
    
    # Login progress
    if cfg['min_logins'] > 0:
        prev_logins = LEVEL_CONFIG[current_level].get('min_logins', 0)
        range_logins = cfg['min_logins'] - prev_logins
        login_progress = min(100, max(0, ((login_count - prev_logins) / range_logins) * 100)) if range_logins > 0 else 0
    else:
        login_progress = 0
    
    overall_progress = max(balance_progress, login_progress)
    
    return {
        'next_level': next_lvl,
        'next_label': cfg['label'],
        'next_icon': cfg['icon'],
        'balance_needed': round(balance_needed, 2),
        'logins_needed': logins_needed,
        'progress': round(overall_progress, 1),
        'next_benefits': cfg['benefits'],
    }

@router.get("/user/level")
async def get_user_level(current_user: dict = Depends(get_current_user)):
    """Get user's gamification level, progress, and dynamic messages"""
    # Calculate total balance (checking + savings)
    accounts = await db.accounts.find({'user_id': current_user['id']}, {'_id': 0}).to_list(100)
    total_eur = sum(acc.get('balance_eur', 0) for acc in accounts)
    total_usd = sum(acc.get('balance_usd', 0) for acc in accounts)
    
    savings = next((acc for acc in accounts if acc['account_type'] == 'savings'), None)
    has_investment = (savings and (savings.get('balance_eur', 0) > 0 or savings.get('balance_usd', 0) > 0))
    investment_eur = savings.get('balance_eur', 0) if savings else 0
    
    # Count logins in last 30 days
    since_30d = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    login_count = await db.login_history.count_documents({
        'user_id': current_user['id'],
        'timestamp': {'$gte': since_30d}
    })
    
    current_level = calculate_user_level(total_eur, login_count, has_investment)
    next_info = get_next_level_info(current_level, total_eur, login_count)
    cfg = LEVEL_CONFIG[current_level]
    
    # Check for level-up
    stored_level = current_user.get('gamification_level', 'bronce')
    leveled_up = False
    if LEVEL_CONFIG[current_level]['order'] > LEVEL_CONFIG.get(stored_level, LEVEL_CONFIG['bronce'])['order']:
        leveled_up = True
        await db.users.update_one(
            {'id': current_user['id']},
            {'$set': {'gamification_level': current_level}}
        )
        await create_notification(
            current_user['id'],
            f'Has subido a nivel {cfg["label"]}!',
            f'Felicidades! Ahora eres nivel {cfg["label"]} {cfg["icon"]}. Disfruta de tus nuevos beneficios.'
        )
    elif stored_level != current_level:
        await db.users.update_one(
            {'id': current_user['id']},
            {'$set': {'gamification_level': current_level}}
        )
    
    # Dynamic message
    message = None
    if next_info:
        if next_info['progress'] >= 80:
            message = f'Estas muy cerca de subir a {next_info["next_label"]}!'
        elif next_info['progress'] >= 50:
            message = f'Te faltan €{next_info["balance_needed"]:,.0f} para alcanzar {next_info["next_label"]}'
        elif next_info['progress'] < 20:
            message = 'Completa tu proceso para mejorar tus beneficios'
    
    return {
        'level': current_level,
        'label': cfg['label'],
        'icon': cfg['icon'],
        'benefits': cfg['benefits'],
        'order': cfg['order'],
        'total_balance_eur': round(total_eur, 2),
        'investment_eur': round(investment_eur, 2),
        'login_count_30d': login_count,
        'has_investment': bool(has_investment),
        'next': next_info,
        'leveled_up': leveled_up,
        'message': message,
    }

# ==================== USER ACTIVITY TRACKING ====================

@router.post("/user/activity")
async def track_activity(event: ActivityEvent, current_user: dict = Depends(get_current_user)):
    """Track user activity events for dynamic messaging"""
    await db.user_activity.insert_one({
        'user_id': current_user['id'],
        'event_type': event.event_type,
        'page': event.page,
        'details': event.details,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    })
    return {'status': 'ok'}

@router.get("/user/activity-score")
async def get_activity_score(current_user: dict = Depends(get_current_user)):
    """Calculate user engagement score based on recent activity"""
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    
    events = await db.user_activity.find({
        'user_id': current_user['id'],
        'timestamp': {'$gte': since}
    }, {'_id': 0}).to_list(500)
    
    login_count = await db.login_history.count_documents({
        'user_id': current_user['id'],
        'timestamp': {'$gte': since}
    })
    
    withdraw_visits = sum(1 for e in events if e.get('page') == '/withdraw')
    total_interactions = len(events)
    
    # Score: low (<5 interactions), medium (5-15), high (>15)
    score = 'low'
    if total_interactions > 15 or login_count > 5:
        score = 'high'
    elif total_interactions > 5 or login_count > 2:
        score = 'medium'
    
    return {
        'score': score,
        'login_count': login_count,
        'withdraw_visits': withdraw_visits,
        'total_interactions': total_interactions,
    }

# ==================== INCOMPLETE PROCESS TRACKING ====================

@router.post("/user/mark-incomplete-process")
async def mark_incomplete_process(current_user: dict = Depends(get_current_user)):
    """Mark that user started withdrawal but didn't complete"""
    existing = await db.incomplete_processes.find_one({
        'user_id': current_user['id'],
        'resolved': False
    })
    if existing:
        await db.incomplete_processes.update_one(
            {'user_id': current_user['id'], 'resolved': False},
            {'$set': {'last_seen': datetime.now(timezone.utc).isoformat()}}
        )
    else:
        await db.incomplete_processes.insert_one({
            'user_id': current_user['id'],
            'email': current_user['email'],
            'name': current_user.get('name', ''),
            'resolved': False,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'last_seen': datetime.now(timezone.utc).isoformat(),
            'email_sent': False,
            'notification_sent': False,
        })
    return {'status': 'ok'}

@router.post("/user/resolve-incomplete-process")
async def resolve_incomplete_process(current_user: dict = Depends(get_current_user)):
    """Mark incomplete process as resolved (user completed withdrawal)"""
    await db.incomplete_processes.update_many(
        {'user_id': current_user['id'], 'resolved': False},
        {'$set': {'resolved': True, 'resolved_at': datetime.now(timezone.utc).isoformat()}}
    )
    return {'status': 'ok'}

