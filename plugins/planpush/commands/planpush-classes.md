# PlanPush CSS Class Reference

The server injects `plan.css` and `plan.js` automatically. Use only these classes — no inline `<style>` or `<script>` tags.

## Layout
- `plan-wrapper` — outer container (max-width 1100px, centered)
- `plan-header` — top header block with `<h1>` title
- `plan-meta` — subtitle/metadata row inside header
- `plan-tabs` — tab bar container
- `plan-tab` — individual tab button (`data-tab="..."`, first gets class `active`)
- `plan-pane` — tab content pane (`data-pane="..."`, first gets class `active`)
- `plan-section` — major content section (adds bottom margin)
- `plan-divider` — horizontal rule separator

## Cards
- `plan-card` — general-purpose card
- `plan-card-title` — flex row for card header with icon
- `plan-card-icon` — 32px icon circle (accent colored)
- `plan-component` — architecture/component box (hover shadow)
- `plan-entity` — data model card (header + field rows)
- `plan-entity-header` — table-name bar
- `plan-entity-body` — field list container
- `plan-entity-field` — single field row (flex: name left, type right)
  - `.field-name` — mono font field name
  - `.field-type` — accent-colored type badge
  - `.field-pk` — primary key marker
  - `.field-fk` — foreign key marker
- `plan-integration` — integration/service block

## Grids
- `plan-grid plan-grid-2` — 2-column auto-fit grid
- `plan-grid plan-grid-3` — 3-column auto-fit grid
- `plan-grid plan-grid-4` — 4-column auto-fit grid
- `plan-columns` — flex columns (equal width, wrap)

## Flows
- `plan-flow` — flow container card
- `plan-flow-steps` — vertical step list
- `plan-flow-step` — single step with connector line
- `plan-flow-num` — numbered circle (accent)
- `plan-flow-content` — step text block
- `plan-flow-horizontal` — horizontal arrow flow
- `plan-flow-box` — box in horizontal flow
- `plan-flow-arrow` — arrow character between boxes

## Diagrams (SVG)
- `plan-diagram` — container for inline SVG diagrams
- `plan-diagram-caption` — caption text below diagram

Use CSS custom properties in SVG for theming:
- `var(--pp-accent)` — primary blue
- `var(--pp-text)` — main text color
- `var(--pp-text-muted)` — secondary text
- `var(--pp-surface-1)` — card background
- `var(--pp-surface-2)` — darker surface
- `var(--pp-border)` — border color
- `var(--pp-success)` — green
- `var(--pp-warning)` — yellow
- `var(--pp-danger)` — red

## Decisions
- `plan-decision` — decision card (accent left border)
  - `.decision-status.decided` — green decided badge
  - `.decision-status.open` — yellow open badge

## Tables
- `plan-table` — styled table with `<thead>/<tbody>/<tr>/<th>/<td>`

## Other
- `plan-tier` — pricing/tier card with `.tier-price`
- `plan-mockup` — browser chrome container
  - `plan-mockup-bar` — title bar with dots
  - `plan-mockup-dot` (x3) — traffic light dots
  - `plan-mockup-url` — URL text
  - `plan-mockup-body` — content area
- `plan-note plan-note-info` — blue callout (also `-warning`, `-success`, `-danger`)
- `plan-badge` — status pill (also `-accent`, `-success`, `-warning`, `-danger`)
- `plan-code` — code block with mono font
- `plan-list` — styled list with accent arrows
- `plan-checklist` — checkbox list (`.checked` on items)

## Utility
- `text-muted`, `text-accent`, `text-success`, `text-warning`, `text-danger`
- `text-mono`, `text-sm`, `text-xs`, `font-bold`
- `mt-0`/`mt-1`/`mt-2`/`mt-3`, `mb-0`/`mb-1`/`mb-2`/`mb-3`
