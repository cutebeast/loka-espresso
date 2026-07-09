# Admin Portal: Translations

## Page
`/translations`

## Purpose
Manage UI text and translated content for all supported locales.

## Supported locales
- `en` — English (source)
- `ms` — Bahasa Malaysia
- `zh` — Chinese
- `ta` — Tamil
- `tr` — Turkish

## What it shows
A list of translation keys grouped by namespace and locale.

## Namespaces

| Namespace | Content |
|-----------|---------|
| admin-ui | Admin Portal interface text. |
| staff-ui | Staff Portal interface text. |
| customer-ui | Customer PWA interface text. |
| content | Translatable content (menu items, rewards, help articles, etc.). |

## Add or edit a translation
1. Search for the key or browse by namespace/locale.
2. Click the translation row.
3. Enter translated text.
4. Save.

## Auto-translate
1. Select the source text (usually English).
2. Choose target locale.
3. Click **Auto-translate**.
4. The system uses DeepL or DeepSeek to generate a translation.
5. Review and save.

## Content translations
Translatable content is linked to database records. For example:
- Menu item name/description
- Reward name/description
- Help article title/body
- System page title/body
- Promo banner text

When a record is saved, the system can auto-translate the translatable fields to all supported locales.

## Cache
Translations are cached. After bulk edits, you may need to clear the translation cache for changes to appear immediately.

## Tips
- Always keep English source text accurate; translations depend on it.
- Review auto-translations before publishing.
- Use consistent terminology across locales.

## Related
- [Content](content.md)
- [Menu](menu.md)
- [Marketing](marketing.md)
