"""Route modules for LIONSBIT VERIFICACION"""
from fastapi import APIRouter

from routes.auth import router as auth_router
from routes.support import router as support_router
from routes.accounts import router as accounts_router
from routes.transactions import router as transactions_router
from routes.notifications import router as notifications_router
from routes.admin import router as admin_router
from routes.misc import router as misc_router


def register_routes(api_router: APIRouter):
    """Register all route modules on the main API router"""
    api_router.include_router(auth_router, tags=["auth"])
    api_router.include_router(support_router, tags=["support"])
    api_router.include_router(accounts_router, tags=["accounts"])
    api_router.include_router(transactions_router, tags=["transactions"])
    api_router.include_router(notifications_router, tags=["notifications"])
    api_router.include_router(admin_router, tags=["admin"])
    api_router.include_router(misc_router, tags=["misc"])
