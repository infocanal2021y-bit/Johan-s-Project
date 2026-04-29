"""On-demand demo data bootstrap for /community.

Seeds the social-proof demo pools so the deployed environment has the same
visual richness as the preview. Both pools are idempotent — running the
bootstrap twice never duplicates users (matched by email).

Pools:
  • community_completed_v1 (80 users, all at step 5 / Retirado)
  • community_in_process_v1 (35 users distributed across steps 1-4)

Triggered from POST /api/admin/community/bootstrap-demo.
"""
import logging
import random
import uuid
from datetime import datetime, timezone, timedelta

from config import db
from services.accounts_lifecycle import provision_full_user_finance

logger = logging.getLogger(__name__)


# ============================ POOL 1: COMPLETED (80) ============================

COMPLETED_NAMES = [
    "Carlos Mendoza", "José Ramírez", "Antonio García", "Luis Fernández",
    "Manuel Ortega", "Javier Navarro", "Miguel Herrera", "Francisco López",
    "Daniel Torres", "Rafael Castro", "Andrés Molina", "Sergio Ruiz",
    "Pedro Sánchez", "Juan Martínez", "Alejandro Romero", "Ricardo Vega",
    "Fernando Díaz", "Alberto Moreno", "Diego Vargas", "Cristian Reyes",
    "Víctor Herrera", "Ángel Cabrera", "Eduardo Silva", "Marco Pérez",
    "Tomás Castillo", "Roberto Jiménez", "César Fuentes", "Héctor Delgado",
    "Pablo Núñez", "Iván Rojas", "Joaquín Medina", "Emilio Santana",
    "Rubén Flores", "Esteban Campos", "Óscar Valdez", "Martín Cruz",
    "Adrián Guerrero", "Samuel Benítez", "Leonardo Paredes", "Nicolás Salazar",
    "David León", "Guillermo Soto", "Sebastián Prieto", "Álvaro Iglesias",
    "Felipe Mendoza", "Germán Castillo", "Bruno Cabrera", "Raúl Peña",
    "Ismael Vargas", "Julián Herrera", "Mateo Silva", "Rodrigo Torres",
    "Camilo Navarro", "Cristian Soto", "Alexis Fuentes", "Kevin Morales",
    "Jonathan Rivas", "Edwin Salinas", "Mauricio Ortega", "Franklin Medina",
    "Orlando Peña", "Joel Castillo", "Nelson Cabrera", "Wilmer Sánchez",
    "Yonatan Reyes", "Braulio Jiménez", "Héctor Ramírez", "Víctor Manuel Cruz",
    "Armando López", "Enrique Salazar", "Lorenzo Vega", "Vicente Molina",
    "Agustín Fernández", "Sergio Domínguez", "Hugo Santana", "Ramón Delgado",
    "Julián Ponce", "Cristian Mendoza", "Alonso Prieto", "Damián Rojas",
]
MIN_AMOUNT = 25000.0
MAX_AMOUNT = 80526.0


# ============================ POOL 2: IN-PROCESS (35) ============================

IN_PROCESS_NAMES = [
    'Alejandro Fernández', 'Sergio Martínez', 'Javier Gómez', 'David Moreno',
    'Álvaro Sánchez', 'Pablo Rodríguez', 'Iván López', 'Daniel Ruiz',
    'Rubén Navarro', 'Adrián Castro',
    'Miguel Ángel Torres', 'Francisco Javier León', 'Antonio Ruiz', 'José Manuel Ortega',
    'Luis Alberto Romero', 'Fernando Gil', 'Víctor Manuel Pérez', 'Ángel Martín',
    'Raúl Hernández',
    'Guillermo Alonso', 'Emilio Serrano', 'Manuel Domínguez', 'Ricardo Molina',
    'Tomás Aguilar', 'Alberto Vega', 'Juan Carlos Prieto', 'César Morales',
    'Joaquín Herrera',
    'Eduardo Campos', 'Ramón Fuentes', 'Vicente Romero', 'Óscar Delgado',
    'Enrique Cabrera', 'Hugo Martínez', 'Gonzalo Navarro',
]
IN_PROCESS_DISTRIBUTION = [1] * 9 + [2] * 9 + [3] * 9 + [4] * 8
assert len(IN_PROCESS_DISTRIBUTION) == len(IN_PROCESS_NAMES)


# ============================ HELPERS ============================

def _slug_email(name: str, idx: int, suffix: str = 'lionsbit-community.com') -> str:
    s = name.lower()
    repl = {'á':'a','é':'e','í':'i','ó':'o','ú':'u','ñ':'n','ü':'u'}
    for k, v in repl.items():
        s = s.replace(k, v)
    parts = [p for p in s.split() if p]
    base = '.'.join(parts[:2]) if len(parts) >= 2 else parts[0]
    return f"{base}{idx:02d}@{suffix}"


# ============================ SEEDERS ============================

async def _seed_completed_one(name: str, idx: int, amount_eur: float) -> dict:
    email = _slug_email(name, idx)
    existing = await db.users.find_one({'email': email}, {'_id': 0, 'id': 1})
    if existing:
        return {'skipped': True}

    user_id = str(uuid.uuid4())
    base_dt = datetime.now(timezone.utc) - timedelta(days=random.randint(60, 180))
    deposit_dt = base_dt + timedelta(days=random.randint(2, 8))
    withdraw_dt = deposit_dt + timedelta(days=random.randint(15, 45))
    completed_dt = withdraw_dt + timedelta(hours=random.randint(8, 48))

    await db.users.insert_one({
        'id': user_id, 'name': name, 'email': email,
        'password': '$2b$12$E5P3F2X.5dummyhashfordemoaccountsK4Y6D6Vxzl8uH0/lQTPXXXX',
        'phone': f"+346{random.randint(10000000, 99999999)}",
        'country': 'España', 'country_name': 'España', 'country_code': '+34',
        'role': 'user',
        'verification_status': 'verified', 'account_status': 'active', 'kyc_status': 'approved',
        'kyc_documents': None, 'kyc_verified_at': base_dt.isoformat(),
        'first_login_at': base_dt.isoformat(), 'last_active': completed_dt.isoformat(),
        'must_change_password': False,
        'is_demo': True, 'demo_seed_batch': 'community_completed_v1',
        'created_at': base_dt.isoformat(),
        'partial_withdraw_unlocked': True, 'partial_withdraw_max_eur': float(amount_eur),
    })

    await provision_full_user_finance(user_id, seed_balance_eur=0.0, seed_balance_usd=0.0)
    checking = await db.accounts.find_one({'user_id': user_id, 'account_type': 'checking'}, {'_id': 0})

    await db.transactions.insert_one({
        'id': str(uuid.uuid4()), 'account_id': checking['id'], 'user_id': user_id,
        'transaction_type': 'admin_credit', 'amount': float(amount_eur), 'currency': 'EUR',
        'status': 'completed', 'description': 'Depósito inicial verificado',
        'transaction_reference': f"DEP-{idx:03d}-{user_id[:8].upper()}",
        'created_at': deposit_dt.isoformat(), 'completed_at': deposit_dt.isoformat(),
        'is_demo': True,
    })
    withdraw_amount = float(amount_eur) * round(random.uniform(0.4, 0.9), 2)
    await db.transactions.insert_one({
        'id': str(uuid.uuid4()), 'account_id': checking['id'], 'user_id': user_id,
        'transaction_type': 'withdraw', 'amount': round(withdraw_amount, 2), 'currency': 'EUR',
        'status': 'completed', 'description': 'Retiro completado · transferencia bancaria',
        'transaction_reference': f"WD-{idx:03d}-{user_id[:8].upper()}",
        'created_at': withdraw_dt.isoformat(), 'completed_at': completed_dt.isoformat(),
        'is_demo': True,
    })
    available_eur = round(float(amount_eur) - withdraw_amount, 2)
    await db.accounts.update_one(
        {'id': checking['id']},
        {'$set': {'balance_eur': max(available_eur, 0.0)}},
    )
    return {'created': True}


async def _seed_in_process_one(name: str, idx: int, step: int) -> dict:
    email = _slug_email(name, idx)
    existing = await db.users.find_one({'email': email}, {'_id': 0, 'id': 1})
    if existing:
        return {'skipped': True}

    user_id = str(uuid.uuid4())
    base_dt = datetime.now(timezone.utc) - timedelta(days=random.randint(3, 25))
    dep_dt = base_dt + timedelta(days=random.randint(1, 5))
    deposit_eur = round(random.uniform(15000, 68000), 2)

    await db.users.insert_one({
        'id': user_id, 'name': name, 'email': email,
        'password': '$2b$12$placeholder.no.login.in.process.demo.AAAAAAAAAAAAAAAAAA',
        'phone': f"+346{random.randint(10000000, 99999999)}",
        'country': 'España', 'country_name': 'España', 'country_code': '+34',
        'role': 'user',
        'verification_status': 'verified', 'kyc_status': 'approved', 'account_status': 'active',
        'kyc_verified_at': base_dt.isoformat(),
        'first_login_at': base_dt.isoformat(), 'last_active': dep_dt.isoformat(),
        'must_change_password': False,
        'is_demo': True, 'demo_seed_batch': 'community_in_process_v1',
        'created_at': base_dt.isoformat(),
        'community_step_override': step,
        'community_step_updated_at': dep_dt.isoformat(),
        'community_step_updated_by': 'bootstrap_endpoint',
    })

    await provision_full_user_finance(user_id)
    checking = await db.accounts.find_one({'user_id': user_id, 'account_type': 'checking'}, {'_id': 0})

    await db.transactions.insert_one({
        'id': str(uuid.uuid4()), 'account_id': checking['id'], 'user_id': user_id,
        'transaction_type': 'admin_credit', 'amount': deposit_eur, 'currency': 'EUR',
        'status': 'completed', 'description': 'Depósito inicial verificado',
        'transaction_reference': f"IPDEP-{uuid.uuid4().hex[:8].upper()}",
        'created_at': dep_dt.isoformat(), 'completed_at': dep_dt.isoformat(),
        'is_demo': True,
    })
    await db.accounts.update_one(
        {'id': checking['id']},
        {'$set': {'balance_eur': deposit_eur}},
    )
    return {'created': True}


# ============================ PUBLIC ENTRY ============================

async def bootstrap_community_demo() -> dict:
    """Run both pools idempotently. Returns counts of created vs skipped."""
    random.seed(42)  # deterministic for completed pool

    completed_created = 0
    completed_skipped = 0
    # Generate amount distribution
    amounts = [MAX_AMOUNT] + [
        round(random.uniform(MIN_AMOUNT, MAX_AMOUNT - 200), 2)
        for _ in range(len(COMPLETED_NAMES) - 1)
    ]
    amounts.sort(reverse=True)
    for idx, (name, amount) in enumerate(zip(COMPLETED_NAMES, amounts)):
        try:
            r = await _seed_completed_one(name, idx + 1, amount)
            if r.get('created'):
                completed_created += 1
            else:
                completed_skipped += 1
        except Exception as exc:  # pragma: no cover
            logger.exception('[bootstrap-demo] failed completed user %s: %s', name, exc)

    random.seed(2026)  # deterministic for in-process pool
    in_process_created = 0
    in_process_skipped = 0
    for idx, (name, step) in enumerate(zip(IN_PROCESS_NAMES, IN_PROCESS_DISTRIBUTION)):
        try:
            r = await _seed_in_process_one(name, idx + 1, step)
            if r.get('created'):
                in_process_created += 1
            else:
                in_process_skipped += 1
        except Exception as exc:  # pragma: no cover
            logger.exception('[bootstrap-demo] failed in-process user %s: %s', name, exc)

    total_in_db = await db.users.count_documents({'role': {'$ne': 'admin'}})
    return {
        'completed_pool': {
            'created': completed_created,
            'skipped_existing': completed_skipped,
            'target': len(COMPLETED_NAMES),
        },
        'in_process_pool': {
            'created': in_process_created,
            'skipped_existing': in_process_skipped,
            'target': len(IN_PROCESS_NAMES),
        },
        'total_users_in_db': total_in_db,
    }
