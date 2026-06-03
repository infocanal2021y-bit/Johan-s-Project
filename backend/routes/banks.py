"""Spanish-bank tips for the withdrawal wizard.

Curated facts about the 5 main Spanish banks our users send transfers to.
Static data — no PII, no live API calls. Used to enrich the wizard with
warnings like "este banco rechaza IBANs sin BIC" or "tarda 1 día hábil".
"""
from fastapi import APIRouter, Depends, HTTPException

from services.auth import get_current_user


router = APIRouter()


BANK_TIPS = {
    'CaixaBank': {
        'id': 'CaixaBank',
        'name': 'CaixaBank',
        'logo_color': '#0085CA',
        'iban_prefix': 'ES21 0182',
        'swift': 'CAIXESBBXXX',
        'avg_processing_hours': 2,
        'avg_processing_label': '~2 horas hábiles',
        'fee_incoming_eur': 0,
        'reliability_score': 95,
        'tips': [
            'Acepta transferencias SEPA sin costes adicionales para el receptor.',
            'Si el monto supera €15.000, el banco puede solicitar justificación del origen.',
            'Tu IBAN debe tener formato ES21 seguido de 22 dígitos.',
        ],
        'warnings': [
            'Si tu cuenta es del tipo "imagin", los abonos pueden tardar 1 día hábil extra.',
        ],
    },
    'BBVA': {
        'id': 'BBVA',
        'name': 'BBVA',
        'logo_color': '#004481',
        'iban_prefix': 'ES16 0182',
        'swift': 'BBVAESMMXXX',
        'avg_processing_hours': 3,
        'avg_processing_label': '~3 horas hábiles',
        'fee_incoming_eur': 0,
        'reliability_score': 97,
        'tips': [
            'BBVA es uno de los bancos más rápidos para abonos SEPA en España.',
            'El concepto de la transferencia debe incluir tu nombre completo.',
            'Si es tu primera transferencia, podrían pedir confirmación adicional.',
        ],
        'warnings': [
            'IMPORTANTE: verifica que el IBAN coincide con el titular registrado, BBVA es muy estricto con titulares no coincidentes.',
        ],
    },
    'Santander': {
        'id': 'Santander',
        'name': 'Banco Santander',
        'logo_color': '#EC0000',
        'iban_prefix': 'ES72 0049',
        'swift': 'BSCHESMMXXX',
        'avg_processing_hours': 4,
        'avg_processing_label': '~4 horas hábiles',
        'fee_incoming_eur': 0,
        'reliability_score': 94,
        'tips': [
            'Acepta SEPA standard sin comisión para el destinatario.',
            'Para transferencias internacionales (no SEPA), añade siempre el SWIFT/BIC.',
            'Compatible con todas las cuentas tipo 1|2|3 y Cuenta Inteligente.',
        ],
        'warnings': [
            'Las transferencias recibidas después de las 14:00 se acreditan al día siguiente hábil.',
        ],
    },
    'Banco Sabadell': {
        'id': 'Banco Sabadell',
        'name': 'Banco Sabadell',
        'logo_color': '#0073A8',
        'iban_prefix': 'ES23 0081',
        'swift': 'BSABESBBXXX',
        'avg_processing_hours': 5,
        'avg_processing_label': '~5 horas hábiles',
        'fee_incoming_eur': 0,
        'reliability_score': 91,
        'tips': [
            'Sabadell admite SEPA sin comisión para particulares.',
            'Para clientes "Cuenta Expansión", los abonos pueden ser instantáneos.',
            'El IBAN comienza con ES23 si tu sucursal es la principal.',
        ],
        'warnings': [
            'Si el importe supera €10.000, Sabadell puede solicitar documentación KYC adicional.',
        ],
    },
    'ING': {
        'id': 'ING',
        'name': 'ING España',
        'logo_color': '#FF6200',
        'iban_prefix': 'ES65 1465',
        'swift': 'INGDESMMXXX',
        'avg_processing_hours': 1,
        'avg_processing_label': '~1 hora hábil',
        'fee_incoming_eur': 0,
        'reliability_score': 96,
        'tips': [
            'ING ofrece abonos SEPA instantáneos (Instant SEPA) en menos de 1 hora.',
            'No cobra comisión por recepción de transferencias nacionales ni europeas.',
            'Es 100% online — confirma desde la app que el abono llegó.',
        ],
        'warnings': [
            'Para clientes ING Direct anteriores a 2017, el IBAN puede tener prefijo distinto (revísalo en tu cuenta).',
        ],
    },
    'Bankinter': {
        'id': 'Bankinter',
        'name': 'Bankinter',
        'logo_color': '#FF6900',
        'iban_prefix': 'ES50 0128',
        'swift': 'BKBKESMMXXX',
        'avg_processing_hours': 4,
        'avg_processing_label': '~4 horas hábiles',
        'fee_incoming_eur': 0,
        'reliability_score': 93,
        'tips': [
            'Bankinter procesa SEPA en franja horaria de banco (9:00 a 14:00).',
            'Soporta SEPA Instant para clientes Bankinter Móvil.',
        ],
        'warnings': [
            'Las transferencias internacionales fuera de SEPA requieren SWIFT obligatorio.',
        ],
    },
}


@router.get("/banks/tips")
async def list_bank_tips(user: dict = Depends(get_current_user)):
    """Returns the full catalogue for the wizard to show on bank selection."""
    return {'banks': BANK_TIPS, 'count': len(BANK_TIPS)}


@router.get("/banks/tips/{bank_id:path}")
async def get_bank_tips(bank_id: str, user: dict = Depends(get_current_user)):
    """Returns tips for a single bank. `bank_id` is the bank `name`
    (URL-encoded if it contains spaces)."""
    info = BANK_TIPS.get(bank_id)
    if not info:
        raise HTTPException(404, f'Banco no soportado: {bank_id}')
    return info
