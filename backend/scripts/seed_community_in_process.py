"""Seed 35 Spanish users distributed across community progress steps 1-4
(none at step 5 — they're "in process" so admin can manually advance them).

Distribution:
  - 9 at step 1 (Verificación)
  - 9 at step 2 (Impuesto)
  - 9 at step 3 (Revisión)
  - 8 at step 4 (Transferencia)

Each user has:
  - España flag · phone +34
  - verification_status='verified' (so progress_step >= 1 is meaningful)
  - is_demo=true · demo_seed_batch='community_in_process_v1'
  - deposit transaction (admin_credit completed) for €15.000 - €68.000
  - community_step_override = step assigned (so the bar shows the right state)
  - account_status='active'
  - kyc_status='approved'
"""
import asyncio
import os
import random
import sys
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv(str(Path(__file__).resolve().parents[1] / '.env'))

from services.accounts_lifecycle import provision_full_user_finance


NAMES = [
    'Alejandro Fernández', 'Sergio Martínez', 'Javier Gómez', 'David Moreno',
    'Álvaro Sánchez', 'Pablo Rodríguez', 'Iván López', 'Daniel Ruiz',
    'Rubén Navarro', 'Adrián Castro',                                    # → step 1 x 10 (we'll distribute)
    'Miguel Ángel Torres', 'Francisco Javier León', 'Antonio Ruiz', 'José Manuel Ortega',
    'Luis Alberto Romero', 'Fernando Gil', 'Víctor Manuel Pérez', 'Ángel Martín',
    'Raúl Hernández',
    'Guillermo Alonso', 'Emilio Serrano', 'Manuel Domínguez', 'Ricardo Molina',
    'Tomás Aguilar', 'Alberto Vega', 'Juan Carlos Prieto', 'César Morales',
    'Joaquín Herrera',
    'Eduardo Campos', 'Ramón Fuentes', 'Vicente Romero', 'Óscar Delgado',
    'Enrique Cabrera', 'Hugo Martínez', 'Gonzalo Navarro',
]

# Distribution per step
STEP_DISTRIBUTION = (
    [1] * 9 +
    [2] * 9 +
    [3] * 9 +
    [4] * 8
)
assert len(STEP_DISTRIBUTION) == len(NAMES)


def _slug_email(name: str, idx: int) -> str:
    s = name.lower()
    repl = {'á':'a','é':'e','í':'i','ó':'o','ú':'u','ñ':'n','ü':'u'}
    for k, v in repl.items():
        s = s.replace(k, v)
    parts = [p for p in s.split() if p]
    base = '.'.join(parts[:2]) if len(parts) >= 2 else parts[0]
    return f"{base}{idx:02d}@lionsbit-community.com"


async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]
    random.seed(2026)
    print(f'Seeding {len(NAMES)} in-process users…')

    created = 0
    skipped = 0
    for idx, (name, step) in enumerate(zip(NAMES, STEP_DISTRIBUTION)):
        email = _slug_email(name, idx + 1)
        existing = await db.users.find_one({'email': email}, {'_id': 0, 'id': 1})
        if existing:
            print(f'  · [{idx+1:2d}] step {step} | {name:<30} SKIPPED (exists)')
            skipped += 1
            continue

        user_id = str(uuid.uuid4())
        # Past creation date so the recent-feed/hall doesn't pollute
        base_dt = datetime.now(timezone.utc) - timedelta(days=random.randint(3, 25))
        dep_dt = base_dt + timedelta(days=random.randint(1, 5))
        deposit_eur = round(random.uniform(15000, 68000), 2)

        await db.users.insert_one({
            'id': user_id,
            'name': name,
            'email': email,
            'password': '$2b$12$placeholder.no.login.in.process.demo.AAAAAAAAAAAAAAAAAA',
            'phone': f"+346{random.randint(10000000, 99999999)}",
            'country': 'España',
            'country_name': 'España',
            'country_code': '+34',
            'role': 'user',
            'verification_status': 'verified',
            'kyc_status': 'approved',
            'account_status': 'active',
            'kyc_verified_at': base_dt.isoformat(),
            'first_login_at': base_dt.isoformat(),
            'last_active': dep_dt.isoformat(),
            'must_change_password': False,
            'is_demo': True,
            'demo_seed_batch': 'community_in_process_v1',
            'created_at': base_dt.isoformat(),
            # The key: pin the user to a specific step
            'community_step_override': step,
            'community_step_updated_at': dep_dt.isoformat(),
            'community_step_updated_by': 'seed_script',
        })

        await provision_full_user_finance(user_id)
        checking = await db.accounts.find_one({'user_id': user_id, 'account_type': 'checking'}, {'_id': 0})

        # Insert deposit
        await db.transactions.insert_one({
            'id': str(uuid.uuid4()),
            'account_id': checking['id'],
            'user_id': user_id,
            'transaction_type': 'admin_credit',
            'amount': deposit_eur,
            'currency': 'EUR',
            'status': 'completed',
            'description': 'Depósito inicial verificado',
            'transaction_reference': f"IPDEP-{uuid.uuid4().hex[:8].upper()}",
            'created_at': dep_dt.isoformat(),
            'completed_at': dep_dt.isoformat(),
            'is_demo': True,
        })
        # Set checking balance equal to the deposit (full available)
        await db.accounts.update_one(
            {'id': checking['id']},
            {'$set': {'balance_eur': deposit_eur}},
        )

        created += 1
        labels = ['Verificación','Impuesto','Revisión','Transferencia','Retirado']
        print(f'  · [{idx+1:2d}] step {step} ({labels[step-1]:<14}) | {name:<30} dep=€{deposit_eur:>9,.2f}')

    print()
    print(f'━━━━━ DONE ━━━━━ created={created} · skipped={skipped}')


if __name__ == '__main__':
    asyncio.run(main())
