"""Seed 70 verified users at step 3 (Revisión) AND promote self-registered
verified users to step 2 (Impuesto) so they show the active clock animation.

Two operations in one shot:

  (A) Create 70 named profiles in `revision` state:
        - account_status = 'en_revision'  → counted under the "En revisión" filter
        - community_step_override = 3
        - estado_actual = 'revision'
        - kyc_status = 'approved' / verification_status = 'verified'
        - is_demo = true · demo_seed_batch = 'community_revision_v1'

  (B) Promote real self-registered & verified users to `impuesto` (step 2):
        Selection criteria:
          • role = 'user'
          • verification_status = 'verified'
          • is_demo != true        (skip demo seeds)
          • is_reactivated != true (skip legacy import)
          • created_by_admin != true (skip admin-manual creations)
          • current step < 2 OR no estado_actual set (don't downgrade)

The frontend ProgressBar already renders an animated Clock on the *current*
stage, so simply setting `estado_actual = 'impuesto'` activates the animation.
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


# ════════════════════════════════════════════════════════════════════
# Pool A — 70 named profiles to seed at "Revisión" stage
# ════════════════════════════════════════════════════════════════════
NAMES_REVISION = [
    'Carlos Mendoza',     'José Ramírez',       'Antonio López',     'Manuel Torres',
    'Luis Fernández',     'Javier Gómez',       'David Martínez',    'Daniel Herrera',
    'Sergio Navarro',     'Alejandro Ruiz',     'Miguel Sánchez',    'Francisco Vega',
    'Rafael Castro',      'Pedro Morales',      'Juan Romero',       'Álvaro Delgado',
    'Marcos Ortega',      'Fernando Cabrera',   'Rubén Domínguez',   'Víctor Paredes',
    'Andrés Cortés',      'Pablo León',         'Diego Molina',      'Adrián Guerrero',
    'Iván Santos',        'Óscar Vidal',        'Joaquín Fuentes',   'Ricardo Núñez',
    'Emilio Salazar',     'Gonzalo Prieto',     'Hugo Castillo',     'Tomás Ríos',
    'Esteban Vargas',     'Mario Aguilar',      'Alberto Silva',     'Lucas Serrano',
    'Cristian Blanco',    'Nicolás Bravo',      'Samuel Peña',       'Raúl Méndez',
    'César Campos',       'Enrique Soler',      'Mateo Ferrer',      'Bruno Valero',
    'Ignacio Lozano',     'Karim Benítez',      'Youssef García',    'Ahmed Navarro',
    'Samir Torres',       'Omar Fernández',     'Nabil Ramírez',     'Hassan López',
    'Khalid Morales',     'Ibrahim Sánchez',    'Tariq Gómez',       'Zaid Herrera',
    'Farid Ruiz',         'Amine Castro',       'Bilal Ortega',      'Rachid Delgado',
    'Hamza Vega',         'Adil Cabrera',       'Mourad León',       'Ismael Cortés',
    'Jalil Domínguez',    'Said Molina',        'Anwar Serrano',     'Yasin Núñez',
    'Walid Prieto',       'Zakaria Paredes',
]
assert len(NAMES_REVISION) == 70, f"Expected 70 names, got {len(NAMES_REVISION)}"


def _slug_email(name: str, idx: int) -> str:
    s = name.lower()
    repl = {'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n', 'ü': 'u'}
    for k, v in repl.items():
        s = s.replace(k, v)
    parts = [p for p in s.split() if p]
    base = '.'.join(parts[:2]) if len(parts) >= 2 else parts[0]
    # Strip non-ascii safely
    base = ''.join(ch for ch in base if ch.isalnum() or ch == '.')
    return f"{base}{idx:02d}@lionsbit-community.com"


# ════════════════════════════════════════════════════════════════════
# Operation A — seed 70 profiles in "Revisión"
# ════════════════════════════════════════════════════════════════════
async def seed_revision_pool(db) -> dict:
    random.seed(1492)
    print(f'\n━━━━━ POOL A · seeding {len(NAMES_REVISION)} users at REVISIÓN ━━━━━')
    created = 0
    skipped = 0
    now = datetime.now(timezone.utc)

    for idx, name in enumerate(NAMES_REVISION):
        email = _slug_email(name, idx + 1)
        existing = await db.users.find_one({'email': email}, {'_id': 0, 'id': 1})
        if existing:
            print(f'  · [{idx+1:2d}] {name:<28} SKIPPED (exists)')
            skipped += 1
            continue

        user_id = str(uuid.uuid4())
        # Created 5-30 days ago, deposited 1-7 days after that
        base_dt = now - timedelta(days=random.randint(5, 30))
        dep_dt = base_dt + timedelta(days=random.randint(1, 7))
        review_dt = dep_dt + timedelta(days=random.randint(1, 5))
        deposit_eur = round(random.uniform(18000, 75000), 2)

        await db.users.insert_one({
            'id': user_id,
            'name': name,
            'email': email,
            'password': '$2b$12$placeholder.no.login.revision.demo.AAAAAAAAAAAAAAAAAA',
            'phone': f"+346{random.randint(10000000, 99999999)}",
            'country': 'España',
            'country_name': 'España',
            'country_code': '+34',
            'role': 'user',
            'verification_status': 'verified',
            'kyc_status': 'approved',
            'account_status': 'en_revision',
            'kyc_verified_at': dep_dt.isoformat(),
            'first_login_at': base_dt.isoformat(),
            'last_active': review_dt.isoformat(),
            'must_change_password': False,
            'is_demo': True,
            'demo_seed_batch': 'community_revision_v1',
            'created_at': base_dt.isoformat(),
            # Pin to step 3 (Revisión) — the bar will render Verificación + Impuesto
            # as completed (blue) and Revisión as the current animated stage.
            'community_step_override': 3,
            'estado_actual': 'revision',
            'community_step_updated_at': review_dt.isoformat(),
            'community_step_updated_by': 'seed_revision_pool',
        })

        # Provision financial structure (idempotent helpers)
        await provision_full_user_finance(user_id)
        checking = await db.accounts.find_one(
            {'user_id': user_id, 'account_type': 'checking'}, {'_id': 0}
        )

        # One completed deposit transaction so the card shows real numbers
        await db.transactions.insert_one({
            'id': str(uuid.uuid4()),
            'account_id': checking['id'],
            'user_id': user_id,
            'transaction_type': 'admin_credit',
            'amount': deposit_eur,
            'currency': 'EUR',
            'status': 'completed',
            'description': 'Depósito inicial verificado',
            'transaction_reference': f"REVDEP-{uuid.uuid4().hex[:8].upper()}",
            'created_at': dep_dt.isoformat(),
            'completed_at': dep_dt.isoformat(),
            'is_demo': True,
        })
        await db.accounts.update_one(
            {'id': checking['id']},
            {'$set': {'balance_eur': deposit_eur}},
        )

        created += 1
        print(f'  · [{idx+1:2d}] {name:<28} dep=€{deposit_eur:>9,.2f}')

    print(f'━━━━━ POOL A DONE · created={created} · skipped={skipped}')
    return {'created': created, 'skipped_existing': skipped, 'target': len(NAMES_REVISION)}


# ════════════════════════════════════════════════════════════════════
# Operation B — promote real verified users to "Impuesto"
# ════════════════════════════════════════════════════════════════════
async def promote_verified_to_impuesto(db) -> dict:
    """Move every self-registered & verified user up to step 2 (impuesto)."""
    print('\n━━━━━ POOL B · promoting self-registered + verified → IMPUESTO ━━━━━')

    # Selection: real users only — exclude admins, demo seeds, legacy reactivations,
    # and admin-manual creations.
    query = {
        'role': 'user',
        'verification_status': 'verified',
        'is_demo': {'$ne': True},
        'is_reactivated': {'$ne': True},
        'created_by_admin': {'$ne': True},
        # Don't downgrade anyone already past impuesto
        '$or': [
            {'community_step_override': {'$exists': False}},
            {'community_step_override': {'$lt': 2}},
            {'community_step_override': None},
        ],
    }

    cursor = db.users.find(
        query,
        {'_id': 0, 'id': 1, 'name': 1, 'email': 1, 'community_step_override': 1, 'estado_actual': 1},
    )
    targets = await cursor.to_list(length=10000)

    if not targets:
        print('  (no eligible users found — nothing to promote)')
        return {'promoted': 0, 'targets': []}

    now_iso = datetime.now(timezone.utc).isoformat()
    promoted = []
    for u in targets:
        await db.users.update_one(
            {'id': u['id']},
            {
                '$set': {
                    'community_step_override': 2,
                    'estado_actual': 'impuesto',
                    'has_pending_tax': True,
                    'community_step_updated_at': now_iso,
                    'community_step_updated_by': 'promote_verified_to_impuesto',
                }
            },
        )
        promoted.append({'id': u['id'], 'name': u.get('name'), 'email': u.get('email')})
        print(f"  · {u.get('name', '?'):<30}  {u.get('email', '?')}")

    print(f'━━━━━ POOL B DONE · promoted={len(promoted)}')
    return {'promoted': len(promoted), 'targets': promoted}


async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]

    summary_a = await seed_revision_pool(db)
    summary_b = await promote_verified_to_impuesto(db)

    print()
    print('═══════════════ FINAL SUMMARY ═══════════════')
    print(f"  Pool A (Revisión)  · created={summary_a['created']}  skipped={summary_a['skipped_existing']}  target={summary_a['target']}")
    print(f"  Pool B (Impuesto)  · promoted={summary_b['promoted']}")
    total_users = await db.users.count_documents({'role': 'user'})
    print(f"  Total users in DB · {total_users}")
    print('═════════════════════════════════════════════')


if __name__ == '__main__':
    asyncio.run(main())
