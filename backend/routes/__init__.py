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
