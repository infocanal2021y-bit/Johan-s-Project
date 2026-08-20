"""One-off bulk import of users from Todos_Nombres_Correos_Telefonos.xlsx.

- Name/email/phone from the Excel (exact).
- Country: España (ES).
- Password: FX2026 (bcrypt hashed, same as platform).
- Idempotent: skips emails already in DB (case-insensitive), no overwrites.
- Provisions full finance structure + internal welcome notification, exactly
  like the /auth/register flow, so their email is linked to the same
  notification system as every other user.
"""
import asyncio
import sys
import uuid
import re
from datetime import datetime, timezone

import openpyxl

sys.path.insert(0, '/app/backend')
from config import db  # noqa: E402
from services.auth import hash_password  # noqa: E402
from services.accounts_lifecycle import provision_full_user_finance  # noqa: E402
from services.notifications import create_notification  # noqa: E402

XLSX_PATH = '/tmp/users.xlsx'
PASSWORD = 'FX2026'
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def parse_rows():
    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True)
    ws = wb['Contactos']
    seen = set()
    rows = []
    stats = {'empty': 0, 'invalid': 0, 'dup_in_file': 0}
    for row in ws.iter_rows(min_row=2, values_only=True):
        n, name, email, phone = (row + (None, None, None, None))[:4]
        if not email or not str(email).strip():
            stats['empty'] += 1
            continue
        raw = str(email).strip()
        # rows with two emails "a@x / b@y" -> take the first
        if '/' in raw:
            raw = raw.split('/')[0].strip()
        e = raw.lower()
        if not EMAIL_RE.match(e):
            stats['invalid'] += 1
            continue
        if e in seen:
            stats['dup_in_file'] += 1
            continue
        seen.add(e)
        phone_str = None
        if phone is not None and str(phone).strip():
            phone_str = str(phone).strip().replace('.0', '')
        rows.append({'name': str(name).strip() if name else e, 'email': e, 'phone': phone_str})
    return rows, stats


async def main():
    rows, stats = parse_rows()
    print(f'Parsed rows: {len(rows)} valid unique | skipped {stats}')

    created = 0
    skipped_existing = 0
    now = datetime.now(timezone.utc).isoformat()
    hashed = hash_password(PASSWORD)  # same hash for all (bcrypt, per-call salt)

    for i, r in enumerate(rows, 1):
        # case-insensitive existence check
        existing = await db.users.find_one(
            {'email': {'$regex': f'^{re.escape(r["email"])}$', '$options': 'i'}},
            {'_id': 0, 'id': 1}
        )
        if existing:
            skipped_existing += 1
            continue

        user_id = str(uuid.uuid4())
        user = {
            'id': user_id,
            'name': r['name'],
            'email': r['email'],
            'password': hash_password(PASSWORD),
            'phone': r['phone'],
            'country_code': 'ES',
            'country_name': 'España',
            'investment_year': None,
            'owner_deceased': False,
            'relationship': None,
            'role': 'user',
            'verification_status': 'unverified',
            'account_status': 'active',
            'kyc_documents': None,
            'registration_ip': 'bulk-import',
            'registration_country': 'España',
            'import_source': 'fx2026_xlsx',
            'created_at': now,
        }
        await db.users.insert_one(user)
        await provision_full_user_finance(user_id)
        await create_notification(
            user_id,
            'Bienvenido a LIONSBIT VERIFICACION!',
            'Su cuenta ha sido creada. Por favor complete la verificacion KYC para desbloquear todas las funciones.'
        )
        created += 1
        if i % 100 == 0:
            print(f'  ...processed {i}/{len(rows)} (created {created}, skipped {skipped_existing})')

    total_users = await db.users.count_documents({})
    imported_total = await db.users.count_documents({'import_source': 'fx2026_xlsx'})
    print('=' * 50)
    print(f'DONE. created={created} skipped_existing={skipped_existing}')
    print(f'Total users in DB: {total_users} | fx2026 import tagged: {imported_total}')


if __name__ == '__main__':
    asyncio.run(main())
