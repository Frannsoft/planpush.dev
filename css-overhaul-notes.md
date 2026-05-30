# CSS Overhaul Notes — Landing Page → App

## Landing Page Design System (planpush.landing)

**Palette**: Sweetie 16 pixel-art palette
- Gold (#ffcd75) — primary accent/CTA
- Coral (#ef7d57) — secondary accent
- Teal (#257179) — tertiary accent
- Sky (#41a6f6) — info accent
- Void (#1a1c2c) — darkest bg / dark text
- Shadow (#333c57) — dark surface
- Slate (#566c86) — secondary text
- Mist (#94b0c2) — faint text
- Cloud (#f4f4f4) — light text on dark

**Surfaces (light)**: Warm paper tones — #edeae4 (page), #f8f6f2 (raised), #ddd8cf (alt), #d5d1c9 (sunken)

**Fonts**: Sora (headings, 500–800), Outfit (body, 300–700), JetBrains Mono (code)

**Techniques**: `color-mix(in oklch, ...)` for all tints/transparency, `--overlay-ink` flip for dark surface system

**Radius**: `--radius: 8px`, `--radius-lg: 14px`

**Dark mode**: `@media prefers-color-scheme` + `data-theme` attribute with localStorage flash-prevention script

---

## Current App Design System

**Palette**: GitHub-inspired blue/gray
- Accent: #2563eb (light), #58a6ff (dark)
- Surfaces: cold grays (#fff, #f8f9fb, #f0f2f5)
- Text: #1a1d23 / #e6edf3

**Fonts**: System font stack only (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`)

**Two parallel token systems**:
- `--pp-*` tokens (plan.css) — uses `light-dark()` CSS function
- `--` tokens (BASE_PAGE_CSS, dashboard) — uses `@media prefers-color-scheme`
- Bridged in `page.js` via aliases

**Radius**: `--radius: 8px`, `--radius-lg: 12px`

---

## CSS Sources in App

| File | What it styles |
|------|---------------|
| `src/utils/html.js` | `BASE_PAGE_CSS` (shared tokens/reset), `HEADER_CSS` (nav bar) |
| `src/dashboard/css.js` | `DASHBOARD_CSS` (tabs, stats, tables, filters, activity, cards, pagination, footer) |
| `src/utils/commentOverlay.js` | `SIDEBAR_CSS` + `INFO_PANEL_CSS` (comment sidebar, info panel, version banner, toast) |
| `src/assets/plan.css` | Plan view component library (710 lines) |
| `src/routes/auth.js` | Inline styles for activate, success, forbidden pages |
| `src/routes/serve.js` | Inline styles for 404 pages |

---

## Open Questions

1. **Scope**: All pages, or just "chrome" (dashboard, auth, header, sidebar) leaving plan.css alone?
2. **Fonts**: Bring in Google Fonts (Sora/Outfit/JetBrains Mono) or keep system fonts?
3. **Color palette**: Full Sweetie 16 with gold primary, or modified version?
4. **Which palette**: Main Sweetie 16 from style.css, or the alternate charcoal-green from mockup-palette.html?
5. **Dark mode mechanism**: Unify to one approach?
6. **Border radius**: Match landing page's 14px for `--radius-lg`?
7. **Token consolidation**: Unify `--pp-*` and `--` into one system matching landing page semantics?
