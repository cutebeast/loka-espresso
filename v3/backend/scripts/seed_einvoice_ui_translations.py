"""Seed admin-ui / staff-ui translation keys for the LHDN MyInvois e-invoice UI.

Upserts (namespace, translation_key, locale) into the translations table for
all five UI locales (en, ms, zh, ta, tr). Human-written F&B-domain strings —
is_auto_translated=false.

Run:  python scripts/seed_einvoice_ui_translations.py
"""

from __future__ import annotations

import asyncio

from sqlalchemy import text

from _db_utils import get_db

# ---------------------------------------------------------------------------
# admin-ui keys (admin portal /einvoice page, sidebar, settings section)
# ---------------------------------------------------------------------------

ADMIN_UI: dict[str, dict[str, str]] = {
    "einvoice.title": {
        "en": "E-Invoices",
        "ms": "E-Invois",
        "zh": "电子发票",
        "ta": "மின்-இன்வாய்ஸ்",
        "tr": "E-Faturalar",
    },
    "einvoice.subtitle": {
        "en": "LHDN MyInvois e-invoice documents for paid orders",
        "ms": "Dokumen e-invois LHDN MyInvois untuk pesanan berbayar",
        "zh": "已付款订单的 LHDN MyInvois 电子发票文件",
        "ta": "செலுத்தப்பட்ட ஆர்டர்களுக்கான LHDN MyInvois மின்-இன்வாய்ஸ் ஆவணங்கள்",
        "tr": "Ödenmiş siparişler için LHDN MyInvois e-fatura belgeleri",
    },
    "einvoice.all_status": {
        "en": "All statuses",
        "ms": "Semua status",
        "zh": "全部状态",
        "ta": "அனைத்து நிலைகளும்",
        "tr": "Tüm durumlar",
    },
    "einvoice.status_pending": {
        "en": "Pending",
        "ms": "Menunggu",
        "zh": "待处理",
        "ta": "நிலுவையில்",
        "tr": "Beklemede",
    },
    "einvoice.status_submitted": {
        "en": "Submitted",
        "ms": "Dihantar",
        "zh": "已提交",
        "ta": "சமர்ப்பிக்கப்பட்டது",
        "tr": "Gönderildi",
    },
    "einvoice.status_validated": {
        "en": "Validated",
        "ms": "Disahkan",
        "zh": "已验证",
        "ta": "சரிபார்க்கப்பட்டது",
        "tr": "Doğrulandı",
    },
    "einvoice.status_rejected": {
        "en": "Rejected",
        "ms": "Ditolak",
        "zh": "已拒绝",
        "ta": "நிராகரிக்கப்பட்டது",
        "tr": "Reddedildi",
    },
    "einvoice.status_failed": {
        "en": "Failed",
        "ms": "Gagal",
        "zh": "失败",
        "ta": "தோல்வி",
        "tr": "Başarısız",
    },
    "einvoice.status_cancelled": {
        "en": "Cancelled",
        "ms": "Dibatalkan",
        "zh": "已取消",
        "ta": "ரத்து செய்யப்பட்டது",
        "tr": "İptal edildi",
    },
    "einvoice.type_invoice": {
        "en": "Invoice",
        "ms": "Invois",
        "zh": "发票",
        "ta": "இன்வாய்ஸ்",
        "tr": "Fatura",
    },
    "einvoice.type_refund": {
        "en": "Refund Note",
        "ms": "Nota Bayaran Balik",
        "zh": "退款单",
        "ta": "பணம் திரும்பக் குறிப்பு",
        "tr": "İade Notu",
    },
    "einvoice.col_order": {
        "en": "Order",
        "ms": "Pesanan",
        "zh": "订单",
        "ta": "ஆர்டர்",
        "tr": "Sipariş",
    },
    "einvoice.col_store": {
        "en": "Store",
        "ms": "Kedai",
        "zh": "门店",
        "ta": "கடை",
        "tr": "Mağaza",
    },
    "einvoice.col_type": {
        "en": "Type",
        "ms": "Jenis",
        "zh": "类型",
        "ta": "வகை",
        "tr": "Tür",
    },
    "einvoice.col_code": {
        "en": "Code Number",
        "ms": "Nombor Kod",
        "zh": "编号",
        "ta": "குறியீட்டு எண்",
        "tr": "Kod Numarası",
    },
    "einvoice.col_status": {
        "en": "Status",
        "ms": "Status",
        "zh": "状态",
        "ta": "நிலை",
        "tr": "Durum",
    },
    "einvoice.col_uuid": {
        "en": "MyInvois UUID",
        "ms": "UUID MyInvois",
        "zh": "MyInvois UUID",
        "ta": "MyInvois UUID",
        "tr": "MyInvois UUID",
    },
    "einvoice.col_submitted": {
        "en": "Submitted At",
        "ms": "Dihantar Pada",
        "zh": "提交时间",
        "ta": "சமர்ப்பித்த நேரம்",
        "tr": "Gönderilme Zamanı",
    },
    "einvoice.order_id_placeholder": {
        "en": "Order ID",
        "ms": "ID Pesanan",
        "zh": "订单 ID",
        "ta": "ஆர்டர் ஐடி",
        "tr": "Sipariş No",
    },
    "einvoice.view": {
        "en": "View",
        "ms": "Lihat",
        "zh": "查看",
        "ta": "பார்க்க",
        "tr": "Görüntüle",
    },
    "einvoice.hide": {
        "en": "Hide",
        "ms": "Sembunyi",
        "zh": "收起",
        "ta": "மறை",
        "tr": "Gizle",
    },
    "einvoice.retry": {
        "en": "Retry",
        "ms": "Cuba Semula",
        "zh": "重试",
        "ta": "மீண்டும் முயற்சி",
        "tr": "Yeniden Dene",
    },
    "einvoice.no_results": {
        "en": "No e-invoice documents found",
        "ms": "Tiada dokumen e-invois ditemui",
        "zh": "未找到电子发票文件",
        "ta": "மின்-இன்வாய்ஸ் ஆவணங்கள் எதுவும் இல்லை",
        "tr": "E-fatura belgesi bulunamadı",
    },
    "einvoice.ubl_document": {
        "en": "UBL Document",
        "ms": "Dokumen UBL",
        "zh": "UBL 文件",
        "ta": "UBL ஆவணம்",
        "tr": "UBL Belgesi",
    },
    "einvoice.validation_link": {
        "en": "Validation Link",
        "ms": "Pautan Pengesahan",
        "zh": "验证链接",
        "ta": "சரிபார்ப்பு இணைப்பு",
        "tr": "Doğrulama Bağlantısı",
    },
    "einvoice.error": {
        "en": "Error",
        "ms": "Ralat",
        "zh": "错误",
        "ta": "பிழை",
        "tr": "Hata",
    },
    "settings.section_einvoice": {
        "en": "E-Invoice (LHDN MyInvois)",
        "ms": "E-Invois (LHDN MyInvois)",
        "zh": "电子发票（LHDN MyInvois）",
        "ta": "மின்-இன்வாய்ஸ் (LHDN MyInvois)",
        "tr": "E-Fatura (LHDN MyInvois)",
    },
    "settings.section_einvoice_desc": {
        "en": "LHDN MyInvois e-invoicing: credentials, supplier identity, and auto-issue settings",
        "ms": "E-invois LHDN MyInvois: kredensial, identiti pembekal dan tetapan terbitan automatik",
        "zh": "LHDN MyInvois 电子发票：凭证、供应商身份及自动开具设置",
        "ta": "LHDN MyInvois மின்-இன்வாய்ஸ்: நம்பிக்கைச் சான்றுகள், சப்ளையர் விவரம் மற்றும் தானியங்கு வெளியீட்டு அமைப்புகள்",
        "tr": "LHDN MyInvois e-fatura: kimlik bilgileri, tedarikçi bilgileri ve otomatik düzenleme ayarları",
    },
    "admin.nav.einvoice": {
        "en": "E-Invoices",
        "ms": "E-Invois",
        "zh": "电子发票",
        "ta": "மின்-இன்வாய்ஸ்",
        "tr": "E-Faturalar",
    },
}

# ---------------------------------------------------------------------------
# staff-ui keys (staff portal kitchen order detail e-invoice chip)
# ---------------------------------------------------------------------------

STAFF_UI: dict[str, dict[str, str]] = {
    "kitchen.einvoice_title": {
        "en": "E-Invoice",
        "ms": "E-Invois",
        "zh": "电子发票",
        "ta": "மின்-இன்வாய்ஸ்",
        "tr": "E-Fatura",
    },
    "kitchen.einvoice_type_invoice": {
        "en": "Invoice",
        "ms": "Invois",
        "zh": "发票",
        "ta": "இன்வாய்ஸ்",
        "tr": "Fatura",
    },
    "kitchen.einvoice_type_refund": {
        "en": "Refund Note",
        "ms": "Nota Bayaran Balik",
        "zh": "退款单",
        "ta": "பணம் திரும்பக் குறிப்பு",
        "tr": "İade Notu",
    },
    "kitchen.einvoice_copy_link": {
        "en": "Copy validation link",
        "ms": "Salin pautan pengesahan",
        "zh": "复制验证链接",
        "ta": "சரிபார்ப்பு இணைப்பை நகலெடு",
        "tr": "Doğrulama bağlantısını kopyala",
    },
    "kitchen.einvoice_copied": {
        "en": "Copied",
        "ms": "Disalin",
        "zh": "已复制",
        "ta": "நகலெடுக்கப்பட்டது",
        "tr": "Kopyalandı",
    },
    "kitchen.einvoice_scan_hint": {
        "en": "Scan to view on MyInvois",
        "ms": "Imbas untuk lihat di MyInvois",
        "zh": "扫码在 MyInvois 上查看",
        "ta": "MyInvois இல் பார்க்க ஸ்கேன் செய்யவும்",
        "tr": "MyInvois'te görüntülemek için taratın",
    },
    "kitchen.einvoice_status_pending": {
        "en": "Pending",
        "ms": "Menunggu",
        "zh": "待处理",
        "ta": "நிலுவையில்",
        "tr": "Beklemede",
    },
    "kitchen.einvoice_status_submitted": {
        "en": "Submitted",
        "ms": "Dihantar",
        "zh": "已提交",
        "ta": "சமர்ப்பிக்கப்பட்டது",
        "tr": "Gönderildi",
    },
    "kitchen.einvoice_status_validated": {
        "en": "Validated",
        "ms": "Disahkan",
        "zh": "已验证",
        "ta": "சரிபார்க்கப்பட்டது",
        "tr": "Doğrulandı",
    },
    "kitchen.einvoice_status_rejected": {
        "en": "Rejected",
        "ms": "Ditolak",
        "zh": "已拒绝",
        "ta": "நிராகரிக்கப்பட்டது",
        "tr": "Reddedildi",
    },
    "kitchen.einvoice_status_failed": {
        "en": "Failed",
        "ms": "Gagal",
        "zh": "失败",
        "ta": "தோல்வி",
        "tr": "Başarısız",
    },
    "kitchen.einvoice_status_cancelled": {
        "en": "Cancelled",
        "ms": "Dibatalkan",
        "zh": "已取消",
        "ta": "ரத்து செய்யப்பட்டது",
        "tr": "İptal edildi",
    },
}

UPSERT = text(
    """
    INSERT INTO translations (namespace, translation_key, locale, translated_text, source_text, is_auto_translated)
    VALUES (:namespace, :key, :locale, :translated_text, :source_text, false)
    ON CONFLICT (namespace, translation_key, locale)
    DO NOTHING
    -- round 35: never overwrite existing rows; Translations-page edits are manual
    -- (is_auto_translated=false) and sacred. Dictionary changes need a manual update.
    """
)


async def main() -> None:
    rows = 0
    async with get_db() as db:
        for namespace, keys in (("admin-ui", ADMIN_UI), ("staff-ui", STAFF_UI)):
            for key, locales in keys.items():
                source = locales["en"]
                for locale, translated in locales.items():
                    await db.execute(UPSERT, {
                        "namespace": namespace,
                        "key": key,
                        "locale": locale,
                        "translated_text": translated,
                        "source_text": source,
                    })
                    rows += 1
    print(f"Upserted {rows} translation rows "
          f"(admin-ui: {len(ADMIN_UI)} keys, staff-ui: {len(STAFF_UI)} keys, 5 locales each)")


if __name__ == "__main__":
    asyncio.run(main())
