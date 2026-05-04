"""Seed default notification templates and config for Loka Espresso."""
from sqlalchemy import text


async def seed_templates(db):
    """Insert default notification templates and system content if missing."""
    from sqlalchemy import select, func
    from app.models.notification import NotificationTemplate
    from app.models.splash import AppConfig

    # Always ensure config defaults exist (idempotent)
    await _seed_config_defaults(db)

    # Always ensure system content cards exist (idempotent)
    await _seed_system_content(db)

    # Skip template seeding if already done
    count = (await db.execute(select(func.count()).select_from(NotificationTemplate))).scalar()
    if count and count > 0:
        return

    templates = [
        dict(name="Welcome New User", title="Welcome to Loka Espresso! ☕",
             body="Thank you for joining us! Explore our menu, earn loyalty points, and enjoy exclusive rewards.",
             type="info", audience="new"),
        dict(name="Order Confirmed", title="Your Order is Confirmed ✅",
             body="We've received your order and our baristas are getting it ready for you.",
             type="order", audience="all"),
        dict(name="Order Ready for Pickup", title="Your Order is Ready! 🎉",
             body="Come grab your order at the counter — it's hot and fresh!",
             type="order", audience="all"),
        dict(name="Order Out for Delivery", title="Your Order is On the Way! 🛵",
             body="Our rider is heading to you now. Estimated arrival in 15-25 minutes.",
             type="order", audience="all"),
        dict(name="New Reward Unlocked", title="You Earned a Reward! 🏆",
             body="Congratulations! Check your Rewards page to claim your new loyalty reward.",
             type="reward", audience="all"),
        dict(name="Loyalty Tier Upgrade", title="Tier Upgrade — Congratulations! 🌟",
             body="You've been upgraded to a new loyalty tier! Enjoy better rewards and exclusive perks.",
             type="loyalty", audience="loyal"),
        dict(name="Flash Promo", title="⚡ Flash Sale — Limited Time!",
             body="Grab your favorites at a special price! Valid today only at all Loka Espresso outlets.",
             type="promo", audience="all"),
        dict(name="New Menu Item", title="Something New on the Menu! 🍽️",
             body="We've added exciting new items to our menu. Come try them today!",
             type="info", audience="all"),
        dict(name="Store Event", title="You're Invited! 🎪",
             body="Join us for a special tasting event this weekend at your nearest Loka Espresso.",
             type="event", audience="loyal"),
        dict(name="Wallet Top-Up Reminder", title="Low Wallet Balance 💰",
             body="Your wallet balance is running low. Top up now to enjoy seamless checkout.",
             type="wallet", audience="all"),
    ]

    for t in templates:
        tmpl = NotificationTemplate(**t)
        db.add(tmpl)

    await db.flush()

    # Seed config defaults
    await _seed_config_defaults(db)

    print(f"Seeded {len(templates)} notification templates")


async def _seed_system_content(db):
    """Ensure essential system content cards exist (idempotent)."""
    from app.models.content import InformationCard
    from sqlalchemy import select

    system_cards = [
        dict(title="About Loka Espresso", slug="about-loka-espresso",
             long_description="Born from a passion for authentic Turkish coffee culture, Loka Espresso brings the warmth of centuries-old coffee traditions to every cup. Our beans are sourced from the finest regions — roasted in small batches to honour the craft.",
             short_description="Our story and heritage", content_type="system", is_active=True),
    ]
    for card in system_cards:
        existing = (await db.execute(
            select(InformationCard).where(InformationCard.slug == card["slug"])
        )).scalar_one_or_none()
        if not existing:
            db.add(InformationCard(**card))
    await db.flush()


async def _seed_config_defaults(db):
    """Ensure essential app_config keys exist (idempotent)."""
    from app.models.splash import AppConfig
    from sqlalchemy import select

    defaults = {
        "notification_retention_days": "30",
        "otp_rate_limit": "20",
    }
    for key, val in defaults.items():
        existing = (await db.execute(select(AppConfig).where(AppConfig.key == key))).scalar_one_or_none()
        if not existing:
            db.add(AppConfig(key=key, value=val))

    await db.flush()
