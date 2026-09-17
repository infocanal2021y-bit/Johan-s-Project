"""Catálogo Stripe de servicios autorizados PayLionsBit (idempotente)."""
import os
import stripe
from dotenv import load_dotenv

load_dotenv()
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"

CATALOG = [
    {"emergent_product_id": "cert_bancario", "name": "Certificado bancario oficial",
     "tax_code": "txcd_10000000",
     "prices": [{"lookup_key": "cert_bancario_eur", "amount": 2500, "currency": "eur"},
                {"lookup_key": "cert_bancario_usd", "amount": 2700, "currency": "usd"}]},
    {"emergent_product_id": "gestion_documental", "name": "Gestión documental y compulsa",
     "tax_code": "txcd_10000000",
     "prices": [{"lookup_key": "gestion_documental_eur", "amount": 5000, "currency": "eur"},
                {"lookup_key": "gestion_documental_usd", "amount": 5500, "currency": "usd"}]},
    {"emergent_product_id": "abono_special45", "name": "Abono de autorización · Retiro Especial +45",
     "tax_code": "txcd_10000000",
     "prices": [{"lookup_key": "abono_special45_eur", "amount": 180000, "currency": "eur"}]},
    {"emergent_product_id": "abono_btc", "name": "Abono de verificación · Retiro Bitcoin",
     "tax_code": "txcd_10000000",
     "prices": [{"lookup_key": "abono_btc_eur", "amount": 485000, "currency": "eur"}]},
]


def get_or_create_product(entry):
    for p in stripe.Product.list(active=True).auto_paging_iter():
        if p.to_dict().get("metadata", {}).get("emergent_product_id") == entry["emergent_product_id"]:
            return p
    return stripe.Product.create(name=entry["name"], tax_code=entry.get("tax_code"),
                                 metadata={"managed_by": "emergent",
                                           "emergent_product_id": entry["emergent_product_id"]})


def ensure_price(product, p):
    existing = stripe.Price.list(lookup_keys=[p["lookup_key"]], active=True, limit=1).data
    if existing and (existing[0].unit_amount != p["amount"] or existing[0].currency != p["currency"]):
        stripe.Price.modify(existing[0].id, active=False)
        existing = []
    if not existing:
        stripe.Price.create(product=product.id, unit_amount=p["amount"], currency=p["currency"],
                            lookup_key=p["lookup_key"], transfer_lookup_key=True)
        return "created"
    return "exists"


def main():
    for entry in CATALOG:
        product = get_or_create_product(entry)
        for p in entry["prices"]:
            print(entry["emergent_product_id"], p["lookup_key"], ensure_price(product, p))


if __name__ == "__main__":
    main()
