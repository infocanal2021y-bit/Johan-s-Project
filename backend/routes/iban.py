"""Validación profesional de IBAN (MOD-97 + longitud por país) y detección de
entidad bancaria/BIC mediante openiban.com (API pública, sin clave)."""
import logging
import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from services.auth import get_current_user

router = APIRouter()

# Longitud exacta del IBAN por país (ISO 13616).
IBAN_LENGTHS = {
    'AD': 24, 'AE': 23, 'AL': 28, 'AT': 20, 'AZ': 28, 'BA': 20, 'BE': 16,
    'BG': 22, 'BH': 22, 'BR': 29, 'BY': 28, 'CH': 21, 'CR': 22, 'CY': 28,
    'CZ': 24, 'DE': 22, 'DK': 18, 'DO': 28, 'EE': 20, 'EG': 29, 'ES': 24,
    'FI': 18, 'FO': 18, 'FR': 27, 'GB': 22, 'GE': 22, 'GI': 23, 'GL': 18,
    'GR': 27, 'GT': 28, 'HR': 21, 'HU': 28, 'IE': 22, 'IL': 23, 'IS': 26,
    'IT': 27, 'JO': 30, 'KW': 30, 'KZ': 20, 'LB': 28, 'LC': 32, 'LI': 21,
    'LT': 20, 'LU': 20, 'LV': 21, 'MC': 27, 'MD': 24, 'ME': 22, 'MK': 19,
    'MR': 27, 'MT': 31, 'MU': 30, 'NL': 18, 'NO': 15, 'PK': 24, 'PL': 28,
    'PS': 29, 'PT': 25, 'QA': 29, 'RO': 24, 'RS': 22, 'SA': 24, 'SE': 24,
    'SI': 19, 'SK': 24, 'SM': 27, 'TN': 24, 'TR': 26, 'UA': 29, 'VA': 22,
    'VG': 24, 'XK': 20,
}

COUNTRY_NAMES = {
    'ES': 'España', 'FR': 'Francia', 'DE': 'Alemania', 'IT': 'Italia',
    'PT': 'Portugal', 'GB': 'Reino Unido', 'NL': 'Países Bajos', 'BE': 'Bélgica',
    'AT': 'Austria', 'CH': 'Suiza', 'PL': 'Polonia', 'IE': 'Irlanda',
    'LU': 'Luxemburgo', 'GR': 'Grecia', 'SE': 'Suecia', 'NO': 'Noruega',
    'DK': 'Dinamarca', 'FI': 'Finlandia', 'AE': 'Emiratos Árabes',
    'SA': 'Arabia Saudita', 'MA': 'Marruecos', 'RO': 'Rumanía', 'HU': 'Hungría',
    'CZ': 'República Checa', 'SK': 'Eslovaquia', 'BG': 'Bulgaria', 'HR': 'Croacia',
    'SI': 'Eslovenia', 'EE': 'Estonia', 'LV': 'Letonia', 'LT': 'Lituania',
    'CY': 'Chipre', 'MT': 'Malta',
}

# openiban.com solo cubre estos países con detección de banco/BIC.
OPENIBAN_COUNTRIES = {'DE', 'AT', 'NL', 'BE', 'CH', 'LI', 'LU'}


class IbanRequest(BaseModel):
    iban: str


def _normalize(raw: str) -> str:
    return (raw or '').replace(' ', '').replace('-', '').upper()


def _format_iban(clean: str) -> str:
    return ' '.join(clean[i:i + 4] for i in range(0, len(clean), 4))


def _mask_iban(clean: str) -> str:
    if len(clean) <= 8:
        return _format_iban(clean)
    masked = clean[:4] + '•' * (len(clean) - 8) + clean[-4:]
    return _format_iban(masked)


def _mod97(clean: str) -> bool:
    rearranged = clean[4:] + clean[:4]
    numeric = ''
    for ch in rearranged:
        if 'A' <= ch <= 'Z':
            numeric += str(ord(ch) - 55)
        elif ch.isdigit():
            numeric += ch
        else:
            return False
    remainder = 0
    for d in numeric:
        remainder = (remainder * 10 + int(d)) % 97
    return remainder == 1


async def _openiban_lookup(clean: str):
    """Devuelve (bank_name, bic) desde openiban.com o (None, None)."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                f'https://openiban.com/validate/{clean}',
                params={'getBIC': 'true', 'validateBankCode': 'true'},
            )
            r.raise_for_status()
            data = r.json()
            bank = data.get('bankData') or {}
            name = (bank.get('name') or '').strip() or None
            bic = (bank.get('bic') or '').strip() or None
            return name, bic
    except Exception as e:
        logging.info(f'openiban lookup failed for {clean[:4]}...: {e}')
        return None, None


@router.post('/iban/validate')
async def validate_iban(payload: IbanRequest, user: dict = Depends(get_current_user)):
    clean = _normalize(payload.iban)

    if len(clean) < 15 or len(clean) > 34:
        return {'valid': False, 'error': 'Longitud de IBAN inválida.', 'iban': payload.iban}

    country = clean[:2]
    if not country.isalpha():
        return {'valid': False, 'error': 'Código de país inválido.', 'iban': payload.iban}

    expected = IBAN_LENGTHS.get(country)
    if expected is None:
        return {'valid': False, 'error': f'País "{country}" no reconocido para IBAN.', 'iban': payload.iban}
    if len(clean) != expected:
        return {
            'valid': False,
            'error': f'El IBAN de {COUNTRY_NAMES.get(country, country)} debe tener {expected} caracteres.',
            'iban': payload.iban,
        }

    if not _mod97(clean):
        return {
            'valid': False,
            'error': 'El IBAN no supera el dígito de control (MOD-97). Verifique los datos.',
            'iban': payload.iban,
        }

    bank_name, bic = (None, None)
    if country in OPENIBAN_COUNTRIES:
        bank_name, bic = await _openiban_lookup(clean)

    bank_detected = bool(bank_name)
    if bank_detected:
        message = f'IBAN válido. Entidad detectada: {bank_name}.'
    else:
        message = 'IBAN válido. No fue posible identificar automáticamente la entidad bancaria.'

    return {
        'valid': True,
        'error': None,
        'iban': payload.iban,
        'formatted': _format_iban(clean),
        'masked': _mask_iban(clean),
        'country_code': country,
        'country_name': COUNTRY_NAMES.get(country, country),
        'bank_name': bank_name,
        'bic': bic,
        'bank_detected': bank_detected,
        'message': message,
    }
