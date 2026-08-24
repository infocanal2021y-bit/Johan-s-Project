"""Route modules for LIONSBIT VERIFICACION"""
from fastapi import APIRouter

from routes.auth import router as auth_router
from routes.support import router as support_router
from routes.accounts import router as accounts_router
from routes.transactions import router as transactions_router
from routes.notifications import router as notifications_router
from routes.admin import router as admin_router
from routes.misc import router as misc_router
from routes.trading import router as trading_router
from routes.trading_bot import router as trading_bot_router
from routes.mt5 import router as mt5_router
from routes.mt5_invest import router as mt5_invest_router
from routes.mt5_coach import router as mt5_coach_router
from routes.mt5_hub import router as mt5_hub_router
from routes.partial_unlock import router as partial_unlock_router
from routes.client_import import router as client_import_router
from routes.community import router as community_router
from routes.email_campaign import router as email_campaign_router
from routes.withdraw_type import router as withdraw_type_router
from routes.withdraw_journey import router as withdraw_journey_router
from routes.multicurrency import router as multicurrency_router
from routes.bank_withdrawals import router as bank_withdrawals_router
from routes.ai_assistant import router as ai_assistant_router
from routes.vault import router as vault_router
from routes.command_center import router as command_center_router
from routes.onboarding import router as onboarding_router
from routes.mobile_app import router as mobile_app_router
from routes.branding import router as branding_router
from routes.diagnostics import router as diagnostics_router
from routes.banks import router as banks_router
from routes.cases import router as cases_router
from routes.bank_transfer_proofs import router as bank_transfer_proofs_router
from routes.bank_certificate_requests import router as bank_certificate_requests_router
from routes.global_search import router as global_search_router
from routes.secure_messages import router as secure_messages_router
from routes.fx2026_import import router as fx2026_import_router
from routes.service_status import router as service_status_router
from routes.communications import router as communications_router


def register_routes(api_router: APIRouter):
    """Register all route modules on the main API router"""
    api_router.include_router(auth_router, tags=["auth"])
    api_router.include_router(support_router, tags=["support"])
    api_router.include_router(accounts_router, tags=["accounts"])
    api_router.include_router(transactions_router, tags=["transactions"])
    api_router.include_router(notifications_router, tags=["notifications"])
    api_router.include_router(admin_router, tags=["admin"])
    api_router.include_router(misc_router, tags=["misc"])
    api_router.include_router(trading_router, tags=["trading"])
    api_router.include_router(trading_bot_router, tags=["trading_bot"])
    api_router.include_router(mt5_router, tags=["mt5"])
    api_router.include_router(mt5_invest_router, tags=["mt5_invest"])
    api_router.include_router(mt5_coach_router, tags=["mt5_coach"])
    api_router.include_router(mt5_hub_router, tags=["mt5_hub"])
    api_router.include_router(partial_unlock_router, tags=["partial_unlock"])
    api_router.include_router(client_import_router, tags=["client_import"])
    api_router.include_router(community_router, tags=["community"])
    api_router.include_router(email_campaign_router, tags=["email-campaign"])
    api_router.include_router(withdraw_type_router, tags=["withdraw-type"])
    api_router.include_router(withdraw_journey_router, tags=["withdraw-journey"])
    api_router.include_router(multicurrency_router, tags=["multi-currency"])
    api_router.include_router(bank_withdrawals_router, tags=["bank-withdrawals"])
    api_router.include_router(ai_assistant_router, tags=["ai-assistant"])
    api_router.include_router(vault_router, tags=["vault"])
    api_router.include_router(command_center_router, tags=["command-center"])
    api_router.include_router(onboarding_router, tags=["onboarding"])
    api_router.include_router(mobile_app_router, tags=["mobile-app"])
    api_router.include_router(branding_router, tags=["branding"])
    api_router.include_router(diagnostics_router, tags=["diagnostics"])
    api_router.include_router(banks_router, tags=["banks"])
    api_router.include_router(cases_router, tags=["cases"])
    api_router.include_router(bank_transfer_proofs_router, tags=["bank-transfer-proofs"])
    api_router.include_router(bank_certificate_requests_router, tags=["bank-certificates"])
    api_router.include_router(global_search_router, tags=["global-search"])
    api_router.include_router(secure_messages_router, tags=["secure-messages"])
    api_router.include_router(fx2026_import_router, tags=["fx2026-import"])
    api_router.include_router(service_status_router, tags=["service-status"])
    api_router.include_router(communications_router, tags=["communications"])
