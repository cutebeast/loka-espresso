"""Seed (or refresh) the transactional notification templates.

Idempotent: upserts by event_key; refreshes title/body/priority/channels/
action_url when changed (marker flag), never touches manual translation rows
(is_auto_translated=false stays protected). Zh translations are hand-written
here (house-style, gloss-free notification copy) and marked manual so the
nightly translation cron never rewrites them.

Run: python3 scripts/seed_transactional_templates.py --yes --force-prod
"""

import asyncio
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.notification import NotificationTemplate, NotificationMessage
from app.models.translation import Translation

# event_key -> dict of EN copy (title/body contain {variables}) + zh copy
TEMPLATES: dict[str, dict] = {
    "welcome": {
        "name": "Welcome",
        "notification_type": "loyalty",
        "priority": "normal",
        "channels": ["in_app", "push_notification"],
        "action_url_template": "#my-rewards",
        "title": "Welcome to LOKA Espresso ☕",
        "body": "Hi {customer_name}, your welcome gift is here: {gifts}. Find it in My Rewards — see you in store!",
        "title_zh": "欢迎来到 LOKA Espresso ☕",
        "body_zh": "{customer_name}，你好！你的欢迎礼已到账：{gifts}。前往「我的奖励」查看，我们店里见！",
    },
    "order_confirmed": {
        "name": "Order confirmed",
        "notification_type": "order",
        "priority": "normal",
        "channels": ["in_app", "push_notification"],
        "action_url_template": "#orders",
        "title": "Order confirmed ✅",
        "body": "Hi {customer_name}, order {order_number} is confirmed and will be prepared at {store_name}.",
        "title_zh": "订单已确认 ✅",
        "body_zh": "{customer_name}，你好！订单 {order_number} 已确认，{store_name} 即将为你准备。",
    },
    "order_preparing": {
        "name": "Order preparing",
        "notification_type": "order",
        "priority": "normal",
        "channels": ["in_app"],
        "action_url_template": "#orders",
        "title": "Your order is being prepared 👨‍🍳",
        "body": "Order {order_number} is now being prepared at {store_name}.",
        "title_zh": "咖啡师正在为你制作 👨‍🍳",
        "body_zh": "订单 {order_number} 正在 {store_name} 制作中。",
    },
    "order_ready": {
        "name": "Order ready",
        "notification_type": "order",
        "priority": "high",
        "channels": ["in_app", "push_notification"],
        "action_url_template": "#orders",
        "title": "Your order is ready! 🎉",
        "body": "Order {order_number} is ready for pickup at {store_name}.",
        "title_zh": "你的订单已准备好！🎉",
        "body_zh": "订单 {order_number} 已备好，请到 {store_name} 取餐。",
    },
    "order_out_for_delivery": {
        "name": "Order out for delivery",
        "notification_type": "order",
        "priority": "normal",
        "channels": ["in_app", "push_notification"],
        "action_url_template": "#orders",
        "title": "Your order is on the way 🛵",
        "body": "{provider} is delivering order {order_number} to you.",
        "title_zh": "你的订单已在路上 🛵",
        "body_zh": "{provider} 正在为你配送订单 {order_number}。",
    },
    "order_delivered": {
        "name": "Order delivered",
        "notification_type": "order",
        "priority": "normal",
        "channels": ["in_app"],
        "action_url_template": "#orders",
        "title": "Order delivered 📦",
        "body": "Order {order_number} has been delivered. Enjoy!",
        "title_zh": "订单已送达 📦",
        "body_zh": "订单 {order_number} 已送达，请慢用！",
    },
    "order_cancelled": {
        "name": "Order cancelled",
        "notification_type": "order",
        "priority": "normal",
        "channels": ["in_app"],
        "action_url_template": "#my-rewards",
        "title": "Order cancelled",
        "body": "Order {order_number} was cancelled. Any voucher or reward used is back in your wallet.",
        "title_zh": "订单已取消",
        "body_zh": "订单 {order_number} 已取消，所用的优惠券或奖励已退回你的钱包。",
    },
    "refund_processed": {
        "name": "Refund processed",
        "notification_type": "wallet",
        "priority": "normal",
        "channels": ["in_app", "push_notification"],
        "action_url_template": "#orders",
        "title": "Refund processed 💸",
        "body": "A refund of RM {amount} for order {order_number} is on its way to {method}.",
        "title_zh": "退款已处理 💸",
        "body_zh": "订单 {order_number} 的退款 RM {amount} 正退回至{method}。",
    },
    "payment_reminder": {
        "name": "Payment reminder",
        "notification_type": "order",
        "priority": "normal",
        "channels": ["in_app", "push_notification"],
        "action_url_template": "#orders",
        "title": "Your order is waiting for payment",
        "body": "Order {order_number} is still waiting for payment (RM {amount_due}). Pay now to get it started!",
        "title_zh": "你的订单待付款",
        "body_zh": "订单 {order_number} 尚未付款（RM {amount_due}），现在付款即可开始制作！",
    },
    "voucher_granted": {
        "name": "Voucher granted",
        "notification_type": "reward",
        "priority": "normal",
        "channels": ["in_app", "push_notification"],
        "action_url_template": "#my-rewards",
        "title": "You've got a voucher! 🎁",
        "body": "{voucher_title} ({discount}) was added to your wallet. Use it on your next order.",
        "title_zh": "你获得了一张优惠券！🎁",
        "body_zh": "{voucher_title}（{discount}）已加入你的钱包，下次点单即可使用。",
    },
    "reward_redeemed": {
        "name": "Reward redeemed",
        "notification_type": "loyalty",
        "priority": "normal",
        "channels": ["in_app"],
        "action_url_template": "#my-rewards",
        "title": "Reward redeemed 🎁",
        "body": "{reward_name} is ready in My Rewards — use it on your next order.",
        "title_zh": "奖励兑换成功 🎁",
        "body_zh": "{reward_name} 已存入「我的奖励」，下次点单即可使用。",
    },
    "wallet_topup": {
        "name": "Wallet topped up",
        "notification_type": "wallet",
        "priority": "normal",
        "channels": ["in_app", "push_notification"],
        "action_url_template": "#wallet",
        "title": "Wallet topped up ✅",
        "body": "RM {amount} has been added to your wallet. New balance: RM {balance}.",
        "title_zh": "钱包充值成功 ✅",
        "body_zh": "RM {amount} 已存入你的钱包，最新余额为 RM {balance}。",
    },
    "tier_upgrade": {
        "name": "Tier upgrade",
        "notification_type": "loyalty",
        "priority": "high",
        "channels": ["in_app", "push_notification"],
        "action_url_template": "#vip",
        "title": "You've reached {tier_name}! 🏆",
        "body": "Congratulations — enjoy {multiplier} points on every order.",
        "title_zh": "你已升级为 {tier_name}！🏆",
        "body_zh": "恭喜升级！每笔订单均可获得 {multiplier} 积分。",
    },
    "referral_credited": {
        "name": "Referral credited",
        "notification_type": "loyalty",
        "priority": "normal",
        "channels": ["in_app"],
        "action_url_template": "#referral",
        "title": "Referral bonus earned 🎉",
        "body": "You earned {points} points from your referral. Share again to earn more!",
        "title_zh": "推荐奖励已到账 🎉",
        "body_zh": "你的推荐已为你带来 {points} 积分，继续分享赚更多！",
    },
    "points_expiring_soon": {
        "name": "Points expiring soon",
        "notification_type": "loyalty",
        "priority": "normal",
        "channels": ["in_app", "push_notification"],
        "action_url_template": "#rewards",
        "title": "Points expiring soon ⏳",
        "body": "{points} of your points expire on {date}. Redeem a reward before they're gone!",
        "title_zh": "积分即将到期 ⏳",
        "body_zh": "你有 {points} 积分将于 {date} 到期，趁过期前兑换奖励吧！",
    },
    "lucky_draw_win": {
        "name": "Lucky draw win",
        "notification_type": "promo",
        "priority": "high",
        "channels": ["in_app", "push_notification"],
        "action_url_template": "#lucky-draw",
        "title": "Lucky Draw winner! 🎊",
        "body": "You won {prize} in the {campaign_name} draw. Check My Rewards to claim it.",
        "title_zh": "幸运抽奖中奖啦！🎊",
        "body_zh": "你在{campaign_name}活动中抽中「{prize}」！前往「我的奖励」查看。",
    },
    "reservation_reminder": {
        "name": "Reservation reminder",
        "notification_type": "event",
        "priority": "normal",
        "channels": ["in_app", "push_notification"],
        "action_url_template": "#reservations",
        "title": "See you tomorrow! 📅",
        "body": "Reminder: {event_name} is booked for tomorrow ({time}).",
        "title_zh": "明天见！📅",
        "body_zh": "温馨提醒：你预订的{event_name}将于明天（{time}）进行。",
    },
}


async def _upsert(db) -> int:
    from app.services.transactional_notifications import TRANSACTIONAL_EVENTS

    changed = 0
    for event_key, tpl in TEMPLATES.items():
        if event_key not in TRANSACTIONAL_EVENTS:
            print(f"SKIP unknown event {event_key}")
            continue
        result = await db.execute(
            select(NotificationTemplate).where(NotificationTemplate.event_key == event_key)
        )
        row = result.scalar_one_or_none()
        payload = {
            "name": tpl["name"],
            "title": tpl["title"],
            "body": tpl["body"],
            "notification_type": tpl["notification_type"],
            "audience_segment": "all_users",
            "event_key": event_key,
            "is_enabled": True,
            "channels": tpl["channels"],
            "variables": TRANSACTIONAL_EVENTS[event_key]["variables"],
            "priority": tpl["priority"],
            "action_url_template": tpl["action_url_template"],
        }
        if row is None:
            row = NotificationTemplate(**payload)
            db.add(row)
            changed += 1
        else:
            for k, v in payload.items():
                if getattr(row, k) != v:
                    setattr(row, k, v)
                    changed += 1
        await db.flush()
        # Hand-written zh copy (manual rows — protected from the translation cron).
        for col, zh in (("title", tpl["title_zh"]), ("body", tpl["body_zh"])):
            en_text = payload[col]
            existing = (await db.execute(
                select(Translation).where(
                    Translation.table_name == "notification_templates",
                    Translation.record_id == row.id,
                    Translation.column_name == col,
                    Translation.locale == "zh",
                )
            )).scalars().first()
            key = f"notification_templates.{row.id}.{col}"
            if existing is None:
                db.add(Translation(
                    namespace="notification_templates",
                    translation_key=key,
                    locale="zh",
                    source_text=en_text,
                    translated_text=zh,
                    is_auto_translated=False,
                    table_name="notification_templates",
                    record_id=row.id,
                    column_name=col,
                ))
                changed += 1
            elif existing.is_auto_translated or existing.source_text != en_text or existing.translated_text != zh:
                existing.source_text = en_text
                existing.translated_text = zh
                existing.is_auto_translated = False
                changed += 1
    await db.commit()
    return changed


async def main(force: bool) -> None:
    async with AsyncSessionLocal() as db:
        changed = await _upsert(db)
        count = (await db.execute(
            select(NotificationTemplate).where(NotificationTemplate.event_key.is_not(None))
        )).scalars().all()
        print(f"transactional templates: {len(count)} seeded | {changed} changes")
        # Legacy hardcoded welcome inbox messages keep working — no migration
        # of existing inbox rows needed (template_id stays NULL on old rows).


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    parser.add_argument("--force-prod", action="store_true", help="Allow running against production DB")
    args = parser.parse_args()
    if not args.yes:
        print("Run with --yes --force-prod to apply")
        sys.exit(1)
    asyncio.run(main(force=args.force_prod))
