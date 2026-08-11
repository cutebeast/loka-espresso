# Hygiene Reports

## Overview

Staff submit daily hygiene reports from the staff portal. Admin reviews them here.

### Report Types

| Type | Staff Path | Admin Path |
|------|-----------|------------|
| **Grease Trap** | `POST /staff/hygiene/grease-trap` | `GET /admin/hygiene/reports?type=grease_trap` |
| **Garbage** | `POST /staff/hygiene/garbage` | `GET /admin/hygiene/reports?type=garbage` |

### Filters

- **Date range**: `date_from` / `date_to`
- **Store**: Filter by store
- **Status**: Submission status

### Grease Trap Fields

- `level_percent`: Current fill level (0-100)
- `needs_cleaning`: Boolean flag for cleaning required
- `notes`: Staff notes
- `photo_evidence`: Optional photo

### Garbage Fields

- `bag_count`: Number of bags disposed
- `disposal_method`: compactor / regular / recycling
- `notes`: Staff notes
