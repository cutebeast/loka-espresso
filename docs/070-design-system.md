# Design System

> Source: `customer-app/src/styles/variables.css` + `customer-app/src/lib/tokens.ts`

## Brand Colors — Turkish Premium

| Role | Value | CSS Variable |
|---|---|---|
| Primary (Turkish Olive) | `#3B4A1A` | `--loka-primary` |
| Primary Dark | `#263210` | `--loka-primary-dark` |
| Primary Light | `#4E6E20` | `--loka-primary-light` |
| Gold Accent | `#C9A84C` | `--loka-accent-gold` |
| Copper Accent | `#C4893A` | `--loka-accent-copper` |
| Brown | `#4A2210` | `--loka-accent-brown` |
| Cream | `#F5F0E6` | `--loka-cream` |
| Page Background | `#F2EEE6` | `--loka-bg` |
| Card Background | `#FFFDF8` | `--loka-bg-card` |
| Text Primary | `#1E1B18` | `--loka-text-primary` |
| Text Muted | `#8A8078` | `--loka-text-muted` |
| Success | `#7AAA7A` | `--loka-success` |
| Danger | `#C75050` | `--loka-danger` |

## Tier Colors
- Bronze: `#A0783A → #7A5828`
- Silver: `#B0A9A0 → #8A8278`
- Gold: `#D4AF37 → #B8942A`
- Platinum: `#8A9AB0 → #5A6A80`

## Typography
- Headings: `Playfair Display` (via `--font-display`)
- Body: `Inter` (via `--font-sans`)
- Page titles: 20px / 700
- Card titles: 14px / 600
- Body: 13-14px / 400-500
- Labels: 11-12px / 500-600

## Icons
- All `lucide-react` v1.8.0 — 73 imports, zero FontAwesome
- Icon colors use `LOKA` tokens from `@/lib/tokens`

## CSS Architecture
- 26 self-contained `*-v2.css` files (one per page)
- 14 shared CSS files (`components.css`, `globals.css`, etc.)
- All CSS variables in `variables.css`
- No hardcoded hex in any v2 CSS file
- No Tailwind — pure CSS utilities from `utilities.css`
