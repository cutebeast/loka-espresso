"""Aggregate all models for Alembic and runtime."""

from app.models.base import Base
from app.models.enums import (
    CampaignStatus,
    LoyaltyEventType,
    PaymentMethodType,
    PaymentProvider,
    PaymentStatus,
    OrderStatus,
    FulfillmentType,
    ReservationStatus,
)
from app.models.iam import (
    IAMPrincipal,
    AdminAccount,
    IAMRole,
    IAMPermission,
    RolePermission,
    RoleAssignment,
    StoreAssignment,
    APICredentials,
    TokenBlacklist,
)
from app.models.store import (
    Store,
    StoreOperatingHours,
    StoreSpecialHours,
    StoreConfiguration,
    DiningTable,
    TableStatusSnapshot,
    Reservation,
)
from app.models.customer import (
    Customer,
    CustomerConsent,
    CustomerAddress,
    CustomerDevice,
    ReferralEvent,
)
from app.models.staff import (
    StaffProfile,
    StaffTimeEvent,
    StaffShift,
    TipAllocation,
)
from app.models.platform import (
    PlatformConfig,
    AuditLog,
    ScheduledJob,
    DataRetentionPolicy,
    SystemHealthMetric,
)
from app.models.info_card import (
    InformationCard,
    SystemPage,
    ProductCard,
    EventCard,
    EventRsvp,
    PromoBanner,
    ContentSection,
    SplashScreen,
)
from app.models.menu import (
    MenuCategory,
    MenuItem,
    MenuModifierGroup,
    MenuModifierOption,
    MenuVariant,
    MenuItemRecipe,
    Allergen,
    MenuItemAllergen,
    DietaryTag,
    MenuItemDietaryTag,
    TaxCategory,
)
from app.models.inventory import (
    InventoryCategory,
    InventoryItem,
    Supplier,
    InventoryMovementLog,
    PurchaseOrder,
    PurchaseOrderLine,
)
from app.models.cart import (
    CartLineItem,
    CustomerCart,
)
from app.models.order import (
    Order,
    OrderLineItem,
    OrderStatusLog,
    OrderAdjustment,
    OrderFulfillment,
)
from app.models.payment import (
    Payment,
    PaymentEvent,
    PaymentMethod,
    Refund,
)
from app.models.loyalty import (
    LoyaltyTier,
    LoyaltyAccount,
    LoyaltyPointsLedger,
)
from app.models.wallet import (
    Wallet,
    WalletLedgerEntry,
)
from app.models.reward import (
    RewardCatalog,
    CustomerReward,
)
from app.models.voucher import (
    VoucherDefinition,
    CustomerVoucher,
)
from app.models.marketing import (
    MarketingCampaign,
    CampaignAnalytics,
)

from app.models.survey import (
    SurveyDefinition,
    SurveyQuestion,
    SurveyResponse,
    SurveyAnswer,
)
from app.models.notification import (
    AdminNotification,
    NotificationTemplate,
    NotificationMessage,
    NotificationDeliveryLog,
    NotificationPreference,
)
from app.models.translation import (
    Translation,
    TranslationCache,
)
from app.models.feedback import FeedbackEntry
from app.models.checkin import CustomerDailyCheckin
