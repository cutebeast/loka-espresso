# UI/UX Guidelines

> Last updated: 2026-05-02 | Session: Phase 1 UI/UX v2

## Status

| Page | Status | CSS |
|---|---|---|
| Splash | ✅ Complete | `splash-v2.css` |
| Auth (Phone/OTP/Profile) | ✅ Complete | `phone-v2.css`, `otp-v2.css`, `profile-setup-v2.css` |
| AuthStepIndicator | ✅ Complete | `auth-step-v2.css` |
| Login Modal | ✅ Complete | `login-v2.css` |
| Bottom Nav | ✅ Complete | `home-bottom-nav-v2.css` |
| Homepage | ✅ Complete | `home-page-v2.css` |
| QR Scanner | ✅ Complete | `qr-scanner-v2.css` |
| Menu | ✅ Complete | `menu-page-v2.css` |
| Cart | ✅ Complete | `cart-page-v2.css` |
| Store Picker | ✅ Complete | `store-picker-v2.css` |
| Toast | ✅ Complete | `toast-v2.css` |
| **Saved Addresses** | ✅ Complete | `saved-addresses-v2.css` |
| **Checkout** | ✅ Complete | `checkout-v2.css` |
| Orders List | ⏳ Needs audit | `orders-list-v2.css` |
| Order Detail | ⏳ Needs audit | `order-detail-v2.css` |

## Brand Colors (Loka Espresso)

The centralized theme system is defined in `src/lib/theme.ts` and `src/styles/theme.css`.

### Primary Theme (Dark Olive)
```typescript
// src/lib/theme.ts
export const THEME = {
  primary: '#384B16',        // Dark Olive - main brand color
  primaryDark: '#2A3910',    // Darker variant
  primaryLight: '#4A6A1D',   // Lighter variant
  accent: '#85B085',         // Sage Green - success/positive
  accentCopper: '#D18E38',   // Mustard - attention/highlights
  accentBrown: '#57280D',    // Dark Chocolate - emphasis
  accentBrownLight: '#7A4A2E',
  accentRed: '#C75050',      // Error states
  accentBlue: '#4A607A',     // Info states

  textPrimary: '#1B2023',    // Dark Charcoal - main text
  textSecondary: '#3A4A5A',  // Secondary text
  textMuted: '#6A7A8A',      // Muted/placeholder text
  textLight: '#FFFFFF',      // Text on dark backgrounds

  border: '#C4CED8',         // Border color
  borderLight: '#D4DCE5',    // Lighter borders
  bgMuted: '#D4DCE5',        // Muted backgrounds (stats bars)
  bgLight: '#E4EAEF',        // Light backgrounds
  bgCard: '#FFFFFF',         // Card backgrounds
  bgDark: '#1B2023',         // Dark backgrounds

  sidebar: {
    bg: '#1B2023',
    textMuted: '#8A9AAA',
    activeBg: 'rgba(56, 75, 22, 0.2)',
  },

  radius: {
    sm: '6px',
    md: '10px',
    lg: '16px',
    xl: '20px',
  },

  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 4px 6px rgba(0,0,0,0.07)',
    lg: '0 10px 15px rgba(0,0,0,0.1)',
  },
};
```

### CSS Variables
```css
/* src/styles/theme.css */
:root {
  --color-primary: #384B16;
  --color-accent: #85B085;
  --color-accent-copper: #D18E38;
  --color-accent-brown: #57280D;
  --color-text-primary: #1B2023;
  --color-text-muted: #6A7A8A;
  --color-border: #C4CED8;
  --color-bg-muted: #D4DCE5;
  --color-bg-light: #E4EAEF;
  --color-success: #85B085;
  --color-warning: #D18E38;
  --color-danger: #C75050;
  --color-info: #4A607A;
}
```

## Color Usage Guidelines

**Primary Actions:**
- Primary button: `THEME.primary` (#384B16) background, white text
- Hover state: `THEME.primaryDark` (#2A3910)

**Accents:**
- Success/positive: `THEME.accent` (#85B085)
- Attention/highlights: `THEME.accentCopper` (#D18E38)
- Emphasis: `THEME.accentBrown` (#57280D)
- Info: `THEME.accentBlue` (#4A607A)
- Error: `THEME.accentRed` (#C75050)

**Backgrounds:**
- Page background: `THEME.bgLight` (#E4EAEF)
- Cards/surfaces: `THEME.bgCard` (#FFFFFF)
- Stats bars: `THEME.bgMuted` (#D4DCE5)
- Dividers/borders: `THEME.border` (#C4CED8)

**Text:**
- Headings: `THEME.textPrimary` (#1B2023)
- Body text: `THEME.textPrimary` (#1B2023)
- Secondary: `THEME.textSecondary` (#3A4A5A)
- Subtext/labels: `THEME.textMuted` (#6A7A8A)

---

## When to Use Each Visualization

### DataTable (Grid)

**Use when:**
- Multiple metrics for one item (Name, Calls, Win Rate, Revenue, Quota)
- User needs to Sort or Filter
- Exact numbers matter more than shape
- Goal is exporting to CSV/Excel

**Features:**
- Sortable columns with indicator
- Row hover effects
- Action buttons column
- Pagination support
- Empty/Loading states

---

### BarChart

**Use when:**
- Comparing different categories (e.g., 5 sales regions)
- Ranking items (Top 10, sorted high to low)
- Comparing against a goal (actual vs target)

**Orientation:**
- Horizontal bars for long text labels (client names, rep names)
- Vertical bars (columns) for time periods (Jan, Feb, Mar)

**Example:**
```tsx
<BarChart
  data={[
    { label: 'Store A', value: 12000 },
    { label: 'Store B', value: 8500 },
    { label: 'Store C', value: 6200 },
  ]}
  orientation="horizontal"
  formatValue={(v) => `RM ${v.toLocaleString()}`}
/>
```

---

### DonutChart

**Use when:**
- 5 categories or fewer (use BarChart for 6+)
- Obvious differences (70% vs 30%)
- Highlight single dominant metric
- Put total number in center

**Example:**
```tsx
<DonutChart
  data={[
    { label: 'Dine In', value: 450 },
    { label: 'Takeaway', value: 280 },
    { label: 'Delivery', value: 170 },
  ]}
  centerLabel="Orders"
  formatValue={(v) => v.toString()}
/>
```

---

### LineChart

**Use when:**
- Show trend over time
- Multiple series comparison

**Example:**
```tsx
<LineChart
  data={[
    { label: 'Revenue', values: [1200, 1900, 1500, 2100, 2400] },
  ]}
  xAxisLabels={['Jan', 'Feb', 'Mar', 'Apr', 'May']}
  formatValue={(v) => `RM ${v}`}
/>
```

---

## Standardized Components

### DateFilter

Compact date filter with preset buttons: Today, MTD, QTD, YTD, Custom

```tsx
import { DateFilter, type DatePreset } from '@/components/ui';

const [preset, setPreset] = useState<DatePreset>('MTD');
const [fromDate, setFromDate] = useState('');
const [toDate, setToDate] = useState('');

<DateFilter
  preset={preset}
  onChange={(p, from, to) => { setPreset(p); setFromDate(from); setToDate(to); }}
  fromDate={fromDate}
  toDate={toDate}
/>
```

### FilterBar

Combines store selector, date filter, status filter, and search input.

```tsx
import { FilterBar } from '@/components/ui';

<FilterBar
  stores={[{ id: '1', name: 'Store A' }]}
  selectedStore="1"
  onStoreChange={(id) => console.log(id)}
  datePreset="MTD"
  onDateChange={(p, from, to) => console.log(p, from, to)}
  fromDate="2024-01-01"
  toDate="2024-01-31"
  statusOptions={[{ value: 'active', label: 'Active' }]}
  selectedStatus="active"
  onStatusChange={(s) => console.log(s)}
  searchPlaceholder="Search..."
  onSearch={(q) => console.log(q)}
/>
```

### KPICards

Grid of KPI stat cards with optional trend indicators.

```tsx
import { KPICards } from '@/components/ui';

<KPICards
  columns={4}
  cards={[
    {
      icon: 'fa-dollar-sign',
      iconColor: '#4A7A59',
      iconBgColor: '#F0F9F6',
      label: 'Total Revenue',
      value: 'RM 12,450',
      trend: { value: 12.5, isPositive: true },
    },
  ]}
/>
```

### PageHeader

Standardized page header with breadcrumbs and action buttons.

```tsx
import { PageHeader } from '@/components/ui';

<PageHeader
  title="Dashboard"
  subtitle="Overview of your business"
  breadcrumbs={[
    { label: 'Home', href: '/' },
    { label: 'Dashboard' },
  ]}
  primaryAction={{
    label: 'Export',
    icon: 'fa-download',
    onClick: () => console.log('export'),
  }}
/>
```

---

## Typography

- **Page titles:** 24px, fontWeight 700
- **Section headings:** 18px, fontWeight 600
- **Card titles:** 14px, fontWeight 600
- **Body text:** 14px, fontWeight 400
- **Labels/captions:** 12-13px, fontWeight 500
- **Small text:** 11px

---

## Spacing

- **Card padding:** 20px (md) or 28px (lg)
- **Grid gap:** 16px (cards), 24px (sections)
- **Border radius:** 16px (cards), 8px (buttons/inputs), 40px (pills)
- **Page margins:** 24px

---

## Responsive Design

- **Mobile:** Single column, collapsible sidebar
- **Tablet:** 2-column grids
- **Desktop:** Full view with sidebar expanded

---

## Standardized Components (Session 4 Additions)

### StoreSelector
Store dropdown component used across all store-scoped pages.

```tsx
import { StoreSelector } from '@/components/ui';

<StoreSelector
  stores={physicalStores}
  selectedStore={selectedStore}
  onChange={setSelectedStore}
  showAllOption={false}
  placeholder="Select a store..."
/>
```

### DateFilter
Date preset selector with calendar dropdown.

```tsx
import { DateFilter, type DatePreset, calcDateRange } from '@/components/ui/DateFilter';

const [preset, setPreset] = useState<DatePreset>('MTD');
const [fromDate, setFromDate] = useState('');
const [toDate, setToDate] = useState('');

<DateFilter
  preset={preset}
  onChange={(p, from, to) => { setPreset(p); setFromDate(from); setToDate(to); }}
  fromDate={fromDate}
  toDate={toDate}
/>
```

**Presets:** `TODAY`, `MTD` (Month to Date), `QTD` (Quarter to Date), `YTD` (Year to Date), `CUSTOM`

### FilterSelect
Generic dropdown filter for status/type filtering.

```tsx
import { FilterSelect } from '@/components/ui';

<FilterSelect
  value={filterType}
  onChange={setFilterType}
  options={[
    { value: '', label: 'All Types' },
    { value: 'received', label: 'Received' },
    { value: 'waste', label: 'Waste' },
  ]}
  icon="fa-filter"
  placeholder="All Types"
/>
```

### Select (Form Component)
Form-friendly dropdown that replaces native `<select>` elements.

```tsx
import { Select } from '@/components/ui';

<Select
  value={unit}
  onChange={(val) => setUnit(val)}
  options={[
    { value: 'kg', label: 'kg' },
    { value: 'litre', label: 'litre' },
    { value: 'pcs', label: 'pcs' },
  ]}
/>
```

---

## UI/UX Layout Patterns

### Page Layout Pattern
All listing pages should follow this pattern:
1. **Filter Bar (LEFT):** StoreSelector + DateFilter + FilterSelect
2. **Action Button (RIGHT):** "New/Add" button right-aligned
3. **Stats Bar:** Grey bar showing "Showing X of Y items" and "Page N of M"
4. **Table/List:** Data display with THEME styling
5. **Pagination:** Previous/Next buttons at bottom

### Stats Bar Pattern
```tsx
<div style={{
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  background: THEME.bgMuted,
  borderRadius: `${THEME.radius.md} ${THEME.radius.md} 0 0`,
  border: `1px solid ${THEME.border}`,
  borderBottom: 'none',
}}>
  <div style={{ fontSize: 14, color: THEME.textSecondary }}>
    <i className="fas fa-chart-line" style={{ marginRight: 8, color: THEME.primary }}></i>
    Showing <strong style={{ color: THEME.textPrimary }}>{items.length}</strong> of <strong>{total}</strong> items
  </div>
  <div style={{ fontSize: 13, color: THEME.textMuted }}>
    Page {page} of {totalPages}
  </div>
</div>
```

---

## Component Import Pattern

Always import from the unified UI index:

```tsx
import {
  Button,
  Card,
  DateFilter,
  FilterSelect,
  StoreSelector,
  Select,
  DataTable,
  DonutChart,
  KPICards,
} from '@/components/ui';
```
