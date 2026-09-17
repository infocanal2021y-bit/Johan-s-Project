# Stripe Integration TODO

Integración de Stripe Checkout (página alojada / Hosted Checkout) — **Escenario A**: ya existía una integración nativa; solo se actualizaron los parámetros de la sesión de Checkout según lo configurado en Checkout Studio.

## Values to Replace

Ninguno pendiente. Los parámetros `sample_only` ya usan valores reales del proyecto (no placeholders):

| Field | Current Value | Status |
|-------|--------------|--------|
| mode | `payment` | ✅ Real — pagos únicos (abonos y servicios administrativos) |
| success_url | `{origin_url}/payment/success?session_id={CHECKOUT_SESSION_ID}` | ✅ Real — página de éxito existente del frontend |
| cancel_url | `{origin_url}/payment/cancel` | ✅ Real — página de cancelación existente |
| line_items[].price | Price ID resuelto en servidor vía `lookup_key` (catálogo gestionado en Stripe) | ✅ Real — nunca se aceptan precios del cliente |

## Configured Parameters

Configurados en Checkout Studio y aplicados en el código.

**Files containing these parameters:**
- [backend/routes/service_payments.py](backend/routes/service_payments.py) (endpoint `POST /api/service-payments/checkout`)

| Parameter | Value |
|-----------|-------|
| ui_mode | `hosted` (SDK stripe-python 14.4.0 < 21.0.0 → se usa `hosted`; con SDK ≥ 21 sería `hosted_page`) |
| billing_address_collection | `auto` |
| phone_number_collection | `{"enabled": false}` |
| automatic_tax | `{"enabled": false}` |
| allow_promotion_codes | `false` |
| submit_type | `auto` |
| origin_context | `web` |
| integration_identifier | `hosted_web_0001` |
| payment_method_collection | *(omitido — solo aplica cuando `mode` es `subscription`; aquí `mode` es `payment`)* |

> Nota: se eliminó el bloque anterior de `managed_payments` / `automatic_tax=true` (fallback fiscal), sustituido por la configuración de Checkout Studio (`automatic_tax` deshabilitado).

## Setup

- Variables de entorno (ya presentes en `backend/.env`): `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MODE`.
- SDK: `stripe==14.4.0` (Python). No se fija versión de API al inicializar el cliente.
- No se crearon archivos nuevos de servidor: la integración ya existía en `backend/routes/service_payments.py`.

## Cómo funciona el flujo

1. El frontend llama a `POST /api/service-payments/checkout` con un `lookup_key` del catálogo.
2. El servidor resuelve el Price ID en Stripe (los importes nunca vienen del cliente) y crea la Checkout Session alojada con los parámetros de arriba.
3. El usuario es redirigido a `session.url` (página de pago alojada por Stripe).
4. Al pagar, Stripe redirige a `/payment/success?session_id=...` y envía el webhook `checkout.session.completed` a `POST /api/service-payments/webhook` (firma verificada con `STRIPE_WEBHOOK_SECRET`).
5. El webhook marca la transacción como pagada, aplica el abono al contexto (retiro BTC / Especial +45), notifica al usuario y al admin, y genera la factura PDF.

## Testing

- Tarjeta de prueba: `4242 4242 4242 4242` · fecha futura · CVC cualquiera · CP cualquiera.
- Rechazo: `4000 0000 0000 0002`. 3DS: `4000 0027 6000 3184`.
- Modo actual: **test** (`STRIPE_MODE=test`). Para producción, reclama la cuenta Stripe desde Emergent y las claves live se inyectan automáticamente.

## Next Steps

- Gestionar el catálogo de servicios/precios en el Dashboard de Stripe (los productos gestionados llevan `metadata.managed_by=emergent`).
- Revisar la conciliación de pagos en `/admin/service-payments`.

## Resources

- https://support.stripe.com
- https://docs.stripe.com/mcp
