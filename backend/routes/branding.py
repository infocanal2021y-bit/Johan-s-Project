"""Public branding endpoint — exposes corporate contact constants to the FE.

The frontend can either:
  - Use the hardcoded fallbacks in `frontend/src/config/branding.js` (preferred
    for synchronous render), or
  - Hydrate them at runtime from `GET /api/branding` if the team wants to
    change support contacts without redeploying the React bundle.

Returns only public-safe fields. Never expose API keys or internal config.
"""
from fastapi import APIRouter

from config import BRANDING


router = APIRouter()


@router.get("/branding")
async def get_branding():
    """Public corporate-branding payload (no auth required)."""
    return BRANDING
