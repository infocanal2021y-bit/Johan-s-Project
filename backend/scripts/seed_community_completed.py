"""Seed 80 'completed' demo profiles for /community social proof.

Each user:
  • verification_status='verified', account_status='active', kyc_status='approved'
  • full financial structure (checking + savings + crypto wallet) via provision_full_user_finance
  • deposit transaction (admin_credit, completed) for €amount
  • withdrawal transaction (status='completed') so progress_step computes to 5
  • is_demo=true flag for clean audit
  • country='España', phone with +34 prefix → 🇪🇸 flag in /community
"""
import asyncio
import random
import sys
import uuid
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv(str(Path(__file__).resolve().parents[1] / '.env'))

from services.accounts_lifecycle import provision_full_user_finance  # noqa: E402

DB_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']

NAMES = [
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


def _slug_email(name: str, idx: int) -> str:
    s = name.lower()
    repl = {'á':'a','é':'e','í':'i','ó':'o','ú':'u','ñ':'n','ü':'u'}
    for k, v in repl.items():
        s = s.replace(k, v)
    parts = [p for p in s.split() if p]
    base = '.'.join(parts[:2]) if len(parts) >= 2 else parts[0]
    return f"{base}{idx:02d}@lionsbit-community.com"


async def seed_profile(db, name: str, idx: int, amount_eur: float) -> dict:
    """Create one full 'completed' profile."""
    existing = await db.users.find_one({'email': _slug_email(name, idx)}, {'_id': 0, 'id': 1})
    if existing:
        return {'skipped': True, 'reason': 'already exists', 'email': _slug_email(name, idx)}

    user_id = str(uuid.uuid4())
    base_dt = datetime.now(timezone.utc) - timedelta(days=random.randint(60, 180))
    deposit_dt = base_dt + timedelta(days=random.randint(2, 8))
    withdraw_dt = deposit_dt + timedelta(days=random.randint(15, 45))
    completed_dt = withdraw_dt + timedelta(hours=random.randint(8, 48))

    user_doc = {
        'id': user_id,
        'name': name,
        'email': _slug_email(name, idx),
        # password = "lionsbit-demo-2026" hashed; demo accounts can't actually log in for real ops
        'password': '$2b$12$E5P3F2X.5dummyhashfordemoaccountsK4Y6D6Vxzl8uH0/lQTPXXXX',
        'phone': f"+346{random.randint(10000000, 99999999)}",
        'country': 'España',
        'country_name': 'España',
        'country_code': '+34',
        'role': 'user',
        'verification_status': 'verified',
        'account_status': 'active',
        'kyc_status': 'approved',
        'kyc_documents': None,
        'kyc_verified_at': base_dt.isoformat(),
        'first_login_at': base_dt.isoformat(),
        'last_active': completed_dt.isoformat(),
        'must_change_password': False,
        'is_demo': True,
        'demo_seed_batch': 'community_completed_v1',
        'created_at': base_dt.isoformat(),
        'partial_withdraw_unlocked': True,
        'partial_withdraw_max_eur': float(amount_eur),
    }
    await db.users.insert_one(user_doc)

    # Full financial structure (checking + savings + wallet + history)
    await provision_full_user_finance(user_id, seed_balance_eur=0.0, seed_balance_usd=0.0)

    # Find the user's checking account
    checking = await db.accounts.find_one({'user_id': user_id, 'account_type': 'checking'}, {'_id': 0})

    # Deposit transaction (admin_credit, completed) — drives "Depositado" column
    await db.transactions.insert_one({
        'id': str(uuid.uuid4()),
        'account_id': checking['id'],
        'user_id': user_id,
        'transaction_type': 'admin_credit',
        'amount': float(amount_eur),
        'currency': 'EUR',
        'status': 'completed',
        'description': 'Depósito inicial verificado',
        'transaction_reference': f"DEP-{idx:03d}-{user_id[:8].upper()}",
        'created_at': deposit_dt.isoformat(),
        'completed_at': deposit_dt.isoformat(),
        'is_demo': True,
    })

    # Withdrawal transaction (completed) — drives progress_step=5 + "Retiro Procesado" badge
    withdraw_amount = float(amount_eur) * round(random.uniform(0.4, 0.9), 2)
    await db.transactions.insert_one({
        'id': str(uuid.uuid4()),
        'account_id': checking['id'],
        'user_id': user_id,
        'transaction_type': 'withdraw',
        'amount': round(withdraw_amount, 2),
        'currency': 'EUR',
        'status': 'completed',
        'description': 'Retiro completado · transferencia bancaria',
        'transaction_reference': f"WD-{idx:03d}-{user_id[:8].upper()}",
        'created_at': withdraw_dt.isoformat(),
        'completed_at': completed_dt.isoformat(),
        'is_demo': True,
    })

    # Update checking balance to reflect available funds (deposit - withdraw)
    available_eur = round(float(amount_eur) - withdraw_amount, 2)
    await db.accounts.update_one(
        {'id': checking['id']},
        {'$set': {'balance_eur': max(available_eur, 0.0)}},
    )

    return {
        'user_id': user_id,
        'name': name,
        'amount': amount_eur,
        'withdraw': round(withdraw_amount, 2),
        'available': available_eur,
    }


async def main():
    c = AsyncIOMotorClient(DB_URL)
    db = c[DB_NAME]
    random.seed(42)  # deterministic

    print(f'Seeding {len(NAMES)} completed-profile users…')
    print()

    # Distribute amounts: spread across the range with some at MAX
    # Sort names randomly so amounts aren't tied to alphabetical order
    indexed_names = list(enumerate(NAMES))
    # Generate amounts: 1 at exactly MAX (the top one), rest randomly distributed
    amounts = []
    for i in range(len(NAMES)):
        if i == 0:
            amounts.append(MAX_AMOUNT)  # top = exact 80526
        else:
            amounts.append(round(random.uniform(MIN_AMOUNT, MAX_AMOUNT - 200), 2))
    # Sort amounts descending so highest goes first
    amounts.sort(reverse=True)

    results = []
    for (idx, name), amount in zip(indexed_names, amounts):
        r = await seed_profile(db, name, idx + 1, amount)
        results.append(r)
        if r.get('skipped'):
            print(f'  · [{idx+1:2d}] {name:<28} SKIPPED ({r["reason"]})')
        else:
            print(f'  · [{idx+1:2d}] {name:<28} dep=€{r["amount"]:>10,.2f}  ret=€{r["withdraw"]:>10,.2f}  avail=€{r["available"]:>9,.2f}')

    created = [r for r in results if not r.get('skipped')]
    print()
    print(f'━━━━━ DONE ━━━━━ {len(created)} created · {len(results)-len(created)} skipped')
    print(f'Top deposit: €{max(r["amount"] for r in created):,.2f}')
    print(f'Min deposit: €{min(r["amount"] for r in created):,.2f}')


if __name__ == '__main__':
    asyncio.run(main())
