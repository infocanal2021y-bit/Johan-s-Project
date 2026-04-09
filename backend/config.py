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
GOVERNMENT_TREASURY_ID = "GOVT-TREASURY-001"
FRAUD_THRESHOLD_AMOUNT = 5000
FRAUD_THRESHOLD_COUNT = 3
FRAUD_THRESHOLD_MINUTES = 5

# Admin accounts
ADMIN_ACCOUNTS = [
    {'name': 'Admin LionsBit', 'email': 'admi@paylionsbit.es', 'password': 'LionsBit2026!'},
    {'name': 'Admin Backup', 'email': 'admin.backup@paylionsbit.es', 'password': 'LionsBit2026!Backup'},
]

# Bank transfer restriction
RESTRICTED_BANK_TRANSFER_EMAILS = ['marinini28@gmail.com']

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
