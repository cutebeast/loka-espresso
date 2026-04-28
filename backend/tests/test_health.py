"""Basic import and health tests."""

import pytest


def test_app_imports():
    """Verify the FastAPI app can be imported without errors."""
    from app.main import app
    assert app is not None
    assert app.title


def test_models_import():
    """Verify all models can be imported."""
    from app.models.user import User
    from app.models.store import Store
    from app.models.menu import MenuItem, MenuCategory
    from app.models.order import Order, CheckoutToken
    from app.models.loyalty import LoyaltyAccount
    from app.models.voucher import Voucher
    from app.models.reward import Reward
    from app.models.staff import Staff
    from app.models.feedback import Feedback
    from app.models.compliance import (
        Allergen, DeliveryZone, TaxRate, TaxCategory,
        RecipeItem, Reservation, ModifierGroup, ModifierOption,
    )
    from app.models.marketing import CustomizationOption, MarketingCampaign


def test_schemas_import():
    """Verify all schemas can be imported."""
    from app.schemas.menu import MenuItemOut, MenuItemCreate, MenuItemUpdate
    from app.schemas.order import OrderListOut, OrderOut
    from app.schemas.voucher import VoucherOut, VoucherCreate
    from app.schemas.reward import RewardOut, RewardCreate


def test_order_list_schema_uses_items():
    """Verify OrderListOut uses 'items' key, not 'orders'."""
    from app.schemas.order import OrderListOut
    assert hasattr(OrderListOut, 'items')
    assert not hasattr(OrderListOut, 'orders')


@pytest.mark.anyio
async def test_health_endpoint(client):
    """Verify the /health endpoint returns 200."""
    resp = await client.get("/health")
    assert resp.status_code == 200


@pytest.mark.anyio
async def test_docs_endpoint(client):
    """Verify Swagger docs are accessible."""
    resp = await client.get("/docs")
    assert resp.status_code == 200
