"""Apply REAL deposit history from admin activity log to specific users.

Source: list provided by the platform owner showing actual admin_credit
operations done historically. We replace any prior 'random backfill' admin
credits I may have inserted, then re-create the exact ones with the right
amounts, currencies and dates.

DO NOT TOUCH the admin (admi@paylionsbit.es). Its 75.485€ balance stays.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv(str(Path(__file__).resolve().parents[1] / '.env'))

from services.accounts_lifecycle import ensure_user_accounts, provision_full_user_finance


# (email → display name) for users that may NOT exist yet in DB so we can create them
DISPLAY_NAMES = {
    'geralkr@gmail.com':                'Rene Gerardo Sosa Gonzalez',
    'paqui.corbalan@yahoo.es':          'Paqui Corbalan',
    'juanantoniobernet49@gmail.com':    'Juan Antonio Gomez Bernet',
    'vergimu@hotmail.com':              'Veronica Giraldez Muñoz',
    'nilnil2014@gmail.com':             'Nilda Robles',
    'alex.dav.902@gmail.com':           'alexi david rodriguez medrano',
    'vmartiqu@gmail.com':               'Viderman Martinez Quintero',
    'lilicuellar70@yahoo.es':           'Lidya M Alvarez',
    'johancompras2021@gmail.com':       'johan',
    'cgaleruiz5@gmail.com':             'Claudia Galeano Ruiz',
    'guillermoporras0857@gmail.com':    'Guillermo Porras',
}


# (email, amount, currency, iso_date)  — admi@paylionsbit.es is intentionally EXCLUDED
DEPOSITS = [
    ('icaballero25@yahoo.com',          29560.00, 'USD', '2026-04-28T13:00:00+00:00'),
    ('agodi90@gmail.com',                29865.00, 'USD', '2026-04-28T12:00:00+00:00'),
    ('robertocastro791@gmail.com',       29869.00, 'USD', '2026-04-28T12:00:00+00:00'),
    ('geralkr@gmail.com',                28565.00, 'USD', '2026-04-28T12:00:00+00:00'),
    ('esthermichael1976@gmail.com',      26589.00, 'EUR', '2026-04-28T12:00:00+00:00'),
    ('paqui.corbalan@yahoo.es',          26548.00, 'EUR', '2026-04-23T04:42:00+00:00'),
    ('jlamberti.carso.cr@gmail.com',      1250.00, 'EUR', '2026-04-20T11:11:00+00:00'),
    ('juanantoniobernet49@gmail.com',  2000000.00, 'EUR', '2026-04-20T08:42:00+00:00'),
    ('vergimu@hotmail.com',              12326.00, 'USD', '2026-04-16T04:24:00+00:00'),
    ('jlamberti.carso.cr@gmail.com',     45325.00, 'USD', '2026-04-16T04:08:00+00:00'),
    ('nilnil2014@gmail.com',              5620.00, 'USD', '2026-04-14T06:01:00+00:00'),
    ('marinini28@gmail.com',              1250.00, 'USD', '2026-04-14T06:01:00+00:00'),
    ('cimirojo@gmail.com',                1250.00, 'USD', '2026-04-14T06:01:00+00:00'),
    ('alex.dav.902@gmail.com',           36524.00, 'EUR', '2026-04-14T06:00:00+00:00'),
    ('frojasuzcategui@gmail.com',         4650.00, 'USD', '2026-04-14T06:00:00+00:00'),
    ('ffalcongonzalez@gmail.com',         6890.00, 'EUR', '2026-04-14T05:59:00+00:00'),
    ('joseangelcondeblanco@yahoo.es',     2564.00, 'EUR', '2026-04-14T05:59:00+00:00'),
    ('geralkr@gmail.com',                36548.00, 'EUR', '2026-04-14T05:58:00+00:00'),
    ('juanantoniobernet49@gmail.com',   100000.00, 'EUR', '2026-04-14T05:56:00+00:00'),
    ('beatrizga2621@gmail.com',          29836.00, 'EUR', '2026-04-12T06:04:00+00:00'),
    ('nilnil2014@gmail.com',              2500.00, 'EUR', '2026-04-12T06:04:00+00:00'),
    ('berroeta2954@gmail.com',           38069.00, 'EUR', '2026-04-12T06:02:00+00:00'),
    ('berroeta2954@gmail.com',           26742.00, 'EUR', '2026-04-12T05:58:00+00:00'),
    ('davidmarcosdiaz1962@gmail.com',    36254.00, 'EUR', '2026-04-10T14:57:00+00:00'),
    ('cimirojo@gmail.com',                2653.00, 'EUR', '2026-04-09T12:12:00+00:00'),
    ('vmartiqu@gmail.com',                1526.00, 'EUR', '2026-04-09T12:12:00+00:00'),
    ('marianobeasmoratalla@gmail.com',    1852.00, 'USD', '2026-04-09T12:11:00+00:00'),
    ('josevacas35@gmail.com',             2500.00, 'EUR', '2026-04-03T08:34:00+00:00'),
    ('josevacas35@gmail.com',            39586.00, 'EUR', '2026-04-03T06:45:00+00:00'),
    ('alex.dav.902@gmail.com',           36520.00, 'USD', '2026-03-30T09:37:00+00:00'),
    ('adanor2011@icloud.com',            32015.00, 'USD', '2026-03-30T09:37:00+00:00'),
    ('vergimu@hotmail.com',              29856.00, 'USD', '2026-03-30T09:32:00+00:00'),
    ('marianobeasmoratalla@gmail.com',   43254.00, 'USD', '2026-03-30T09:26:00+00:00'),
    ('nilnil2014@gmail.com',             48365.00, 'USD', '2026-03-30T06:32:00+00:00'),
    ('beatrizga2621@gmail.com',           4598.00, 'EUR', '2026-03-28T03:01:00+00:00'),
    ('marinini28@gmail.com',              3650.00, 'EUR', '2026-03-28T03:01:00+00:00'),
    ('litoscpc@gmail.com',                3950.00, 'EUR', '2026-03-28T03:00:00+00:00'),
    ('ffalcongonzalez@gmail.com',        18365.00, 'EUR', '2026-03-26T17:16:00+00:00'),
    ('frojasuzcategui@gmail.com',        65236.00, 'EUR', '2026-03-26T15:04:00+00:00'),
    ('vmartiqu@gmail.com',               36856.00, 'EUR', '2026-03-24T11:03:00+00:00'),
    ('adanor2011@icloud.com',            45896.00, 'EUR', '2026-03-24T11:03:00+00:00'),
    ('luizhenriquegaliza@gmail.com',     46257.00, 'EUR', '2026-03-24T10:35:00+00:00'),
    ('lilicuellar70@yahoo.es',           41250.00, 'EUR', '2026-03-24T10:30:00+00:00'),
    ('johancompras2021@gmail.com',        2000.00, 'EUR', '2026-03-24T10:23:00+00:00'),
    ('juanantoniobernet49@gmail.com',     1000.00, 'EUR', '2026-03-23T07:45:00+00:00'),
    ('joseangelcondeblanco@yahoo.es',    39215.00, 'EUR', '2026-03-23T07:45:00+00:00'),
    ('juanantoniobernet49@gmail.com',    85000.00, 'EUR', '2026-03-20T17:07:00+00:00'),
    ('johancompras2021@gmail.com',       19850.00, 'EUR', '2026-03-20T04:43:00+00:00'),
    ('davidmarcosdiaz1962@gmail.com',    38256.00, 'EUR', '2026-03-19T09:06:00+00:00'),
    ('alconcayejeroo@gmail.com',         46223.00, 'EUR', '2026-03-19T09:06:00+00:00'),
    ('cgaleruiz5@gmail.com',             34000.00, 'EUR', '2026-03-19T08:59:00+00:00'),
    ('beatrizga2621@gmail.com',          43215.00, 'EUR', '2026-03-18T10:21:00+00:00'),
    ('cimirojo@gmail.com',               37655.00, 'EUR', '2026-03-18T10:21:00+00:00'),
    ('ffalcongonzalez@gmail.com',        34451.00, 'EUR', '2026-03-18T10:17:00+00:00'),
    ('johancompras2021@gmail.com',        2000.00, 'EUR', '2026-03-18T05:41:00+00:00'),
    ('marianobeasmoratalla@gmail.com',   42128.00, 'EUR', '2026-03-18T05:41:00+00:00'),
    ('guillermoporras0857@gmail.com',    37710.00, 'EUR', '2026-03-18T05:40:00+00:00'),
    ('marinini28@gmail.com',             31024.00, 'EUR', '2026-03-18T05:40:00+00:00'),
    ('geralkr@gmail.com',                47000.00, 'EUR', '2026-03-18T05:38:00+00:00'),
    ('beatrizga2621@gmail.com',          45000.00, 'EUR', '2026-03-18T05:37:00+00:00'),
    ('marinini28@gmail.com',             31024.00, 'EUR', '2026-03-17T04:57:00+00:00'),
    ('johancompras2021@gmail.com',       33000.00, 'EUR', '2026-03-17T04:08:00+00:00'),
    ('litoscpc@gmail.com',               33392.00, 'EUR', '2026-03-17T04:06:00+00:00'),
    ('johancompras2021@gmail.com',        2555.00, 'EUR', '2026-03-16T14:20:00+00:00'),
    ('johancompras2021@gmail.com',       62000.00, 'EUR', '2026-03-16T13:41:00+00:00'),
]


async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]

    # Group deposits per email
    by_email: dict = {}
    for email, amount, currency, dt in DEPOSITS:
        by_email.setdefault(email, []).append((amount, currency, dt))

    print(f'━━━ Real deposits to apply across {len(by_email)} users ━━━')
    print()

    not_found = []
    created = 0
    applied = 0
    for email, deposits in by_email.items():
        if email == 'admi@paylionsbit.es':
            continue
        user = await db.users.find_one({'email': email}, {'_id': 0, 'id': 1, 'name': 1})
        if not user:
            # Auto-create the user with the display name from the activity log
            display_name = DISPLAY_NAMES.get(email, email.split('@')[0].title())
            user_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            await db.users.insert_one({
                'id': user_id,
                'name': display_name,
                'email': email,
                # bcrypt placeholder — these accounts need password-reset to log in
                'password': '$2b$12$placeholder.no.login.until.password.reset.AAAAAAAAAAAAAAAAAA',
                'role': 'user',
                'country': 'España',
                'country_name': 'España',
                'country_code': '+34',
                'verification_status': 'verified',
                'kyc_status': 'approved',
                'account_status': 'active',
                'must_change_password': True,
                'created_at': now,
                'created_by_admin': 'real-deposits-backfill',
                'is_legacy_real': True,
            })
            await provision_full_user_finance(user_id)
            user = {'id': user_id, 'name': display_name}
            created += 1

        # Wipe ANY prior admin_credit transactions for this user (so we can re-create cleanly).
        # This removes both the random backfill and any duplicate runs of this script.
        await db.transactions.delete_many({
            'user_id': user['id'],
            'transaction_type': 'admin_credit',
        })

        # Ensure checking exists
        accounts = await ensure_user_accounts(user['id'])
        checking_id = accounts['checking']['id']

        eur_total = 0.0
        usd_total = 0.0
        for amount, currency, dt in deposits:
            await db.transactions.insert_one({
                'id': str(uuid.uuid4()),
                'account_id': checking_id,
                'user_id': user['id'],
                'transaction_type': 'admin_credit',
                'amount': amount,
                'currency': currency,
                'status': 'completed',
                'description': f'Saldo agregado por admin: ${amount:,.2f} {currency} a {user["name"]}',
                'transaction_reference': f"ADM-{uuid.uuid4().hex[:8].upper()}",
                'created_at': dt,
                'completed_at': dt,
            })
            if currency == 'EUR':
                eur_total += amount
            elif currency == 'USD':
                usd_total += amount

        # Set the checking balances to reflect the totals
        await db.accounts.update_one(
            {'id': checking_id},
            {'$set': {'balance_eur': round(eur_total, 2), 'balance_usd': round(usd_total, 2)}},
        )

        applied += 1
        eur_str = f'€{eur_total:>11,.2f}' if eur_total else '          '
        usd_str = f'${usd_total:>10,.2f}' if usd_total else '          '
        print(f'  · {user["name"][:36]:<36} ({len(deposits)} tx) {eur_str}   {usd_str}')

    print()
    print(f'━━━ DONE ━━━ applied={applied} · created_new={created} · not_found={len(not_found)}')
    if not_found:
        print(f'Not found in DB: {not_found}')


if __name__ == '__main__':
    asyncio.run(main())
