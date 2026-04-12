"""Gamification: levels, achievements, and scoring functions."""
import logging
from datetime import datetime, timezone, timedelta
from config import db
from services.notifications import create_notification


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


def calculate_user_level(total_balance_eur: float, login_count: int, has_investment: bool):
    """Calculate user level based on balance + logins + investment"""
    if total_balance_eur >= 25000 or (has_investment and total_balance_eur >= 25000):
        return 'platino'
    if total_balance_eur >= 10000 or login_count >= 15:
        return 'oro'
    if total_balance_eur >= 2500 or login_count >= 5:
        return 'plata'
    return 'bronce'


def get_next_level_info(current_level: str, total_balance_eur: float, login_count: int):
    """Get progress toward next level"""
    levels = ['bronce', 'plata', 'oro', 'platino']
    idx = levels.index(current_level)
    if idx >= len(levels) - 1:
        return None

    next_lvl = levels[idx + 1]
    cfg = LEVEL_CONFIG[next_lvl]

    balance_needed = max(0, cfg['min_balance'] - total_balance_eur)
    logins_needed = max(0, cfg['min_logins'] - login_count) if cfg['min_logins'] > 0 else None

    if cfg['min_balance'] > 0:
        prev_min = LEVEL_CONFIG[current_level]['min_balance']
        range_total = cfg['min_balance'] - prev_min
        progress_amount = total_balance_eur - prev_min
        balance_progress = min(100, max(0, (progress_amount / range_total) * 100)) if range_total > 0 else 0
    else:
        balance_progress = 0

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

    await unlock('first_login')

    if user.get('verification_status') == 'verified':
        await unlock('kyc_verified')

    inv_tx = await db.transactions.find_one({'user_id': user_id, 'transaction_type': 'investment_reserve'})
    if inv_tx:
        await unlock('first_investment')

    wd_tx = await db.transactions.find_one({'user_id': user_id, 'transaction_type': 'withdraw'})
    if wd_tx:
        await unlock('first_withdrawal')

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

    since_30d = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    login_count = await db.login_history.count_documents({
        'user_id': user_id, 'timestamp': {'$gte': since_30d}
    })
    if login_count >= 10:
        await unlock('active_user')

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

    level = user.get('gamification_level', 'bronce')
    level_order = LEVEL_CONFIG.get(level, {}).get('order', 0)
    if level_order >= 1:
        await unlock('level_plata')
    if level_order >= 2:
        await unlock('level_oro')
    if level_order >= 3:
        await unlock('level_platino')

    return newly_unlocked
