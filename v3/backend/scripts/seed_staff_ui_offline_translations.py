"""Seed staff-ui translations for POS offline mode (all 5 locales).

Hand-written (is_auto_translated=False) for en/ms/zh/ta/tr.
Run with the backend venv:
    cd v3/backend && python3 scripts/seed_staff_ui_offline_translations.py
"""

import asyncio
from datetime import datetime, timezone
import sys

sys.path.insert(0, ".")

from sqlalchemy.dialects.postgresql import insert

from app.models.translation import Translation
from scripts._db_utils import get_db


STAFF_UI_OFFLINE = {
    "pos.offline_banner": {
        "en": "You are offline — new sales are queued and sync automatically",
        "ms": "Anda di luar talian — jualan baharu akan dimasukkan ke dalam giliran dan disegerakkan secara automatik",
        "zh": "您已离线 — 新销售将进入队列并自动同步",
        "ta": "நீங்கள் ஆஃப்லைனில் உள்ளீர்கள் — புதிய விற்பனைகள் வரிசையில் சேர்ந்து தானாக ஒத்திசைக்கப்படும்",
        "tr": "Çevrimdışısınız — yeni satışlar kuyruğa alınır ve otomatik olarak senkronize edilir",
    },
    "pos.offline_cash_only": {
        "en": "Offline — cash only (card & QR need connectivity)",
        "ms": "Luar talian — tunai sahaja (kad & QR perlukan sambungan)",
        "zh": "离线 — 仅限现金（刷卡和二维码需要网络连接）",
        "ta": "ஆஃப்லைன் — ரொக்கம் மட்டும் (அட்டை & QRக்கு இணைப்பு தேவை)",
        "tr": "Çevrimdışı — yalnızca nakit (kart ve QR bağlantı gerektirir)",
    },
    "pos.offline_data_note": {
        "en": "Showing offline menu data — prices may be outdated",
        "ms": "Memaparkan data menu luar talian — harga mungkin tidak terkini",
        "zh": "正在显示离线菜单数据 — 价格可能不是最新",
        "ta": "ஆஃப்லைன் மெனு தரவு காட்டப்படுகிறது — விலைகள் பழையதாக இருக்கலாம்",
        "tr": "Çevrimdışı menü verisi gösteriliyor — fiyatlar güncel olmayabilir",
    },
    "pos.offline_failed": {
        "en": "Sync failed",
        "ms": "Penyegerakan gagal",
        "zh": "同步失败",
        "ta": "ஒத்திசைவு தோல்வியடைந்தது",
        "tr": "Senkronizasyon başarısız",
    },
    "pos.offline_pending": {
        "en": "Pending",
        "ms": "Menunggu",
        "zh": "待处理",
        "ta": "நிலுவையில்",
        "tr": "Beklemede",
    },
    "pos.offline_queue_chip": {
        "en": "Queued ({count})",
        "ms": "Dalam giliran ({count})",
        "zh": "已排队 ({count})",
        "ta": "வரிசையில் ({count})",
        "tr": "Kuyrukta ({count})",
    },
    "pos.offline_queue_empty": {
        "en": "No queued orders",
        "ms": "Tiada pesanan dalam giliran",
        "zh": "没有排队订单",
        "ta": "வரிசையில் ஆர்டர்கள் இல்லை",
        "tr": "Kuyrukta sipariş yok",
    },
    "pos.offline_queue_title": {
        "en": "Offline Queue",
        "ms": "Giliran Luar Talian",
        "zh": "离线队列",
        "ta": "ஆஃப்லைன் வரிசை",
        "tr": "Çevrimdışı Kuyruk",
    },
    "pos.offline_queued_confirm": {
        "en": "Order queued — it will sync automatically when you're back online",
        "ms": "Pesanan dimasukkan ke dalam giliran — ia akan disegerakkan secara automatik apabila anda kembali dalam talian",
        "zh": "订单已排队 — 恢复在线后将自动同步",
        "ta": "ஆர்டர் வரிசையில் சேர்க்கப்பட்டது — நீங்கள் மீண்டும் ஆன்லைனில் வந்ததும் தானாக ஒத்திசைக்கப்படும்",
        "tr": "Sipariş kuyruğa alındı — tekrar çevrimiçi olduğunuzda otomatik olarak senkronize edilir",
    },
    "pos.offline_retry": {
        "en": "Retry",
        "ms": "Cuba semula",
        "zh": "重试",
        "ta": "மீண்டும் முயற்சிக்கவும்",
        "tr": "Yeniden dene",
    },
    "pos.offline_syncing": {
        "en": "Syncing…",
        "ms": "Menyegerak…",
        "zh": "同步中…",
        "ta": "ஒத்திசைக்கிறது…",
        "tr": "Senkronize ediliyor…",
    },
}


async def main() -> None:
    count = 0
    async with get_db() as db:
        for key, texts in STAFF_UI_OFFLINE.items():
            for locale, text in texts.items():
                stmt = (
                    insert(Translation)
                    .values(
                        namespace="staff-ui",
                        translation_key=key,
                        locale=locale,
                        translated_text=text,
                        source_text=texts["en"],
                        is_auto_translated=False,
                    )
                    .on_conflict_do_update(
                        index_elements=["namespace", "translation_key", "locale"],
                        set_={
                            "translated_text": text,
                            "source_text": texts["en"],
                            "namespace": "staff-ui",
                            "updated_at": datetime.now(timezone.utc),
                        },
                    )
                )
                await db.execute(stmt)
                count += 1
    print(f"Seeded {count} staff-ui offline translations ({len(STAFF_UI_OFFLINE)} keys × 5 locales).")


if __name__ == "__main__":
    asyncio.run(main())
