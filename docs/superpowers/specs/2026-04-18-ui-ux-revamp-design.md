# Data Builder — UI/UX Revamp Design

**Date:** 2026-04-18
**Status:** Design — ready for implementation planning
**Scope:** Full visual refresh of the Data Builder frontend

---

## 1 · Intent

Transform Data Builder's current stock shadcn/Radix look into a distinctive Workbench aesthetic — dark sidebar + light work area + engineered canvas — with an Emerald primary accent, standardized primitives, and a comfortable balanced density. One big-bang refresh rather than incremental rollout.

**Direction locked during brainstorming:**
- **Mood:** D · Workbench (dark sidebar + light work area + grid canvas)
- **Accent:** B · Emerald (`#059669` primary)
- **Density:** B · Balanced (Inter 13px body, JetBrains Mono for identifiers/metrics, comfortable padding)
- **Scope:** A · Full big-bang refresh across all 7 pages + shell

Reference aesthetics: Retool / dbt Cloud / Fivetran / Airflow — engineered-looking tool for data engineers.

## 2 · Design Tokens

All tokens live in `src/globals.css` as CSS variables, consumed through Tailwind 4's `@theme` block. shadcn component contracts are preserved — retokening changes variable values, not the class API.

### 2.1 Color

```
Primary / accent      #059669  (emerald-600)    — buttons, active nav, node accent
Primary hover         #047857  (emerald-700)
Primary faint         #d1fae5  (emerald-100)    — success bg, node hover

Sidebar bg            #111827  (gray-900)       — always dark
Work area bg          #ffffff
Canvas bg             #fafbfc
Canvas dot-grid       #d1d5db on 16px grid, dot-size 1px
Card bg               #ffffff
Card border           #e5e7eb  (gray-200)

Text primary          #111827  (gray-900)
Text secondary        #6b7280  (gray-500)
Text muted            #9ca3af  (gray-400)

Status — success     #059669
Status — error       #dc2626
Status — warn        #d97706
Status — info        #0ea5e9
```

### 2.2 Node type palette

| Type | Left-bar color |
|---|---|
| source | `#059669` emerald-600 |
| filter | `#0ea5e9` sky-500 |
| transform | `#8b5cf6` violet-500 |
| join | `#06b6d4` cyan-500 |
| aggregate | `#10b981` emerald-500 |
| destination | `#f59e0b` amber-500 |

### 2.3 Typography

```
Body font       Inter (self-hosted via @fontsource/inter)
Mono font       JetBrains Mono (@fontsource/jetbrains-mono)
Scale           11/12/13/14/16/20/24
Body default    13px
Weights         400 / 500 / 600 / 700
Line height     1.5 body · 1.25 headings
```

### 2.4 Spacing, radius, shadow

```
Spacing scale    4px base → 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48
Radius           4px small · 6px card/node · 10px dialog
Shadow — sm      0 1px 2px rgba(0,0,0,0.04)
Shadow — md      0 4px 8px rgba(0,0,0,0.06)    (popovers)
Shadow — lg      0 12px 24px rgba(0,0,0,0.08)  (dialogs)
Border default   1px solid #e5e7eb
Focus ring       2px emerald-500 (4px outer offset)
Motion           150ms ease-out (hover/focus) · 200ms cubic-bezier(0.4,0,0.2,1) (dialogs/popovers)
```

### 2.5 Dark mode

Out of scope. The Workbench pattern is fixed: sidebar always dark, work area always light. A full dark-mode toggle is deferred to a follow-up.

## 3 · Layout Shell

```
┌──────────────────────────────────────────────────────────────────┐
│ Sidebar — dark #111827, 224px fixed, collapsible to 56px rail    │
│                                                                  │
│  ◆ Data Builder                Topbar — 44px, white, border-bot  │
│                                ┌────────────────────────────┐    │
│  NAV                           │  page-title · breadcrumb    │    │
│  ◉ Dashboard                   │         search / user      │    │
│  ○ Connectors        [1]       └────────────────────────────┘    │
│  ○ Catalog                      Content area                     │
│  ○ Pipelines         [1]        (page-specific)                  │
│  ○ CDC Streams                                                   │
│  ○ Monitoring                                                    │
│                                                                  │
│  ─────────────                                                   │
│  ○ Settings                                                      │
│  v0.1.0  · ● backend            [max-width 1280px on info pages] │
└──────────────────────────────────────────────────────────────────┘
```

### 3.1 Sidebar

- Fixed 224px, collapsible to 56px icon-only, collapsed state persisted in `localStorage`
- Background `#111827`, nav item height 36px, radius 4px
- Active item: emerald-600 left accent bar (3px), subtle emerald-900 bg tint, text white, icon emerald-300
- Inactive item: text gray-300, icon gray-400, hover bg gray-800
- Count badges (e.g., "Connectors [1]") use gray-800 pill, 10px mono
- Footer: version string + live backend health dot (pings `/api/health`; red dot on failure)

### 3.2 Topbar

- 44px, white, border-bottom gray-200
- Left: page title from route + breadcrumb when inside an entity (`Pipelines › users_etl`)
- Right: global search input with ⌘K `Kbd` hint (affordance only — clicking is a no-op; palette itself deferred to Section 13)
- Right-most: environment marker — small `Badge` showing `LOCAL` / `DEV` / `PROD` from `VITE_ENV_NAME`, helps eng avoid destructive ops in the wrong env

### 3.3 Content area

- Default page padding: 24px top/bottom, 32px sides
- `max-width: 1280px` on info-dense pages (Dashboard, Monitoring)
- Full-width on canvas (Pipeline editor)
- Table-width on list pages
- Every page wraps its contents in sections using the `Card` primitive — no raw borders

### 3.4 Responsive

- Breakpoint at 1024px — sidebar auto-collapses to icon rail
- Below 768px not in scope (desktop tool)

### 3.5 Accessibility

- Existing `Skip to content` link preserved
- All interactive elements keyboard-reachable
- Focus ring visible on every interactive element (2px emerald-500 outside offset)

## 4 · Component Primitives

Most primitives exist in `src/components/ui/` (shadcn/Radix). The revamp is largely retoken + a few additions.

### 4.1 Restyled via tokens (no API change)

| Primitive | Change |
|---|---|
| `Button` | Primary emerald filled; Ghost gray border + gray-900 text; Destructive red-600; sizes sm(28px) / md(36px) / lg(44px) |
| `Input` | 36px, gray-300 border, emerald-500 focus ring (2px), radius 4px |
| `Card` | White bg, gray-200 border 1px, radius 6px, optional shadow-sm on hover |
| `Dialog` | Radius 10px, shadow-lg, 480px default width, emerald primary action |
| `DropdownMenu` | White bg, gray-200 border, shadow-md, 4px item radius, emerald hover tint |
| `Tooltip` | Gray-900 bg, white text, radius 6px, 11px font |
| `Toast` | Card style + left accent stripe by kind (success/error/info) |
| `Tabs` | Underline style, emerald-600 active indicator (2px), gray-500 inactive |

### 4.2 New primitives

- **`Badge`** — variants:
  - `status` — maps to `RunStatus` (pending/running/completed/failed/cancelled) with text labels, never color-only
  - `count` — dark gray pill for nav, 10px mono numerals
  - `kind` — node-type colored pill (used in detail views, side-panels)
- **`StatCard`** — `{ label, value, delta?, hint?, sparkline? }` — replaces ad-hoc Dashboard tiles. `sparkline` prop is part of the API but rendering is a no-op in MVP (no reserved visual space when absent)
- **`EmptyState`** — `{ icon, title, body, action? }` — replaces duplicated per-page empty markup
- **`DataTable`** — thin gray-200 borders, header gray-50 bg, row hover gray-50, 40px row height, sortable column headers, built-in loading skeleton / empty / error states. Generic over row type.
- **`PageHeader`** — `{ title, description?, actions[] }` — standardizes page tops
- **`Kbd`** — small monospace tile for keyboard hints (⌘K, ⌘S)

### 4.3 Icon system

- Standardize on `lucide-react` (already installed)
- Size scale: 16px body, 14px dense chrome, 20px page headers
- No mixing icon sets

### 4.4 Loading & skeleton

- `Skeleton` primitive (shadcn) used for structural loading on Dashboard cards, run history, catalog tree
- Unify on skeletons — remove ad-hoc spinners where content structure is known

### 4.5 Accessibility baseline

- Radix primitives preserve keyboard behavior
- Focus ring visible on every interactive element
- Color contrast WCAG AA for all text/bg pairs (verified via a11y spot-check)
- Status badges always include a text label — color alone is not semantic

## 5 · Pipeline Canvas

The hero surface. Most user attention lands here; this section gets the most visual polish.

### 5.1 Node component

- Card-style: white bg, gray-300 border, 6px radius, shadow-sm on hover
- **Left accent bar** 4px wide, full height, color = node type (Section 2.2)
- Body: 8px 12px padding, two or three lines:
  - Line 1 (always): UPPERCASE type label in 10px gray-500, letter-spacing 0.04em (`SOURCE`, `FILTER`, …)
  - Line 2 (always): primary identifier in 13px gray-900 (e.g., `public.users`); JetBrains Mono for table/column references, Inter for logical labels
  - Line 3 (conditional — rendered only when the node has a summary available): 11px gray-500. Summaries by type:
    - Source: `N columns` (from `selectedColumns.length` or total)
    - Filter: `N conditions (AND|OR)`
    - Transform: `N transformations`
    - Join: `INNER | LEFT | RIGHT | FULL | CROSS JOIN`
    - Aggregate: `N groups, M aggs`
    - Destination: `append | overwrite`

### 5.2 Node states

| State | Visual |
|---|---|
| Default | gray-300 border |
| Hover | gray-400 border, shadow-md, cursor-grab |
| Selected | 2px emerald-500 border (replaces gray), shadow-md |
| Error | 2px red-500 border, red-50 bg tint, alert-triangle icon top-right |
| Running | emerald-500 pulsing left-bar (1.5s pulse animation) |

### 5.3 Connection handles

- Circle, 8px diameter, gray-400, emerald-500 on hover / during connect drag
- Positioned at horizontal midpoints of node edges (React Flow default, restyled)

### 5.4 Edges

- Smooth bezier, stroke gray-400, width 1.5px
- Arrow head at target (React Flow default)
- Hover: stroke emerald-400, width 2px
- Selected: stroke emerald-500, width 2px
- No edge labels in MVP
- Animated running-state edges: **out of scope** (Section 11)

### 5.5 Canvas background

- Dot pattern (not lines): 16px grid, 1px dots, color `#d1d5db` on `#fafbfc`
- Softer than line-grid; keeps "engineered" feel without visual noise
- Controls (zoom / fit / lock): bottom-left, stacked vertical, 32px icon buttons styled as Button ghost
- Minimap: bottom-right, 180×120px, semi-transparent white bg, gray-200 border

### 5.6 Toolbar (node palette)

- Top of canvas, full-width, 44px, white bg, gray-200 bottom border
- Six draggable chips: icon + type label, border color matches node type
- Spacing 8px between chips
- "Drag to add" label on left in 11px gray-500

### 5.7 Catalog sidebar (left, 260px)

- Background gray-50, right-border gray-200, 12px padding
- Connectors as collapsible sections; tables as draggable rows
- Each table row: icon + `schema.table` (mono 12px) + column count badge
- Drag behavior: drop on canvas → creates preconfigured `source` node at drop position

### 5.8 Node config panel (right, 320px, shown when node selected)

- White bg, gray-200 left-border
- Header: node type pill (`kind` Badge variant) + close button
- Fields: Section 4 primitives — Input, Select, etc.
- Multi-row editors (Join/Transform/Aggregate): add/remove buttons use Button ghost
- Behavior: field changes commit to Zustand immediately on change; persistence to backend flows through the existing debounced auto-save (3s). No explicit "Apply" button in MVP. This matches current UX.

### 5.9 Run history panel (right, 320px, shown when Runs toggled)

- Mutually exclusive with node config panel
- Run items use the balanced-density recipe from mockup:
  - Status Badge (status variant)
  - Duration + rows in mono 11px (right-aligned)
  - Timestamp + trigger source in gray-500 11px
  - Inline action buttons: Retry (blue, for failed/cancelled), Cancel (red, for pending/running)
- Clicking a run expands it to show `node_results` breakdown

### 5.10 Editor topbar (above canvas toolbar)

- 44px, white
- Left: back-to-pipelines link, inline-editable pipeline-name input (underline on hover)
- Right button group: `Validate` (ghost) · `Save` (ghost with "Saved Xs ago" text) · `Schedule` (ghost + dot badge if active) · `Run` (emerald primary) · `Runs [N]` (ghost + count badge)

### 5.11 Validation banner

- When validation returns errors: red-50 bg strip below topbar, alert-triangle icon, error list, dismiss button
- Reserve vertical space even when empty — no layout jump on show/hide

## 6 · Per-Page Treatments

### 6.1 Dashboard `/`

- Ad-hoc tiles → four `StatCard`s in responsive grid: Connectors, Pipelines, Valid Pipelines, CDC Streams
- "Quick Start" numbered list retains content, restyled with left emerald rail + gray-900 step numbers in mono
- "Recent Pipelines" → `DataTable` (5 rows): name, status Badge, last run, row-actions menu
- `PageHeader`: title + subtitle + primary action `New Pipeline`
- Empty state (no pipelines) → `EmptyState` with CTA to `/pipelines/new`

### 6.2 Connectors `/connectors`

- Card list → `DataTable`: name, type pill, status dot (ok/failed/untested), last tested, actions menu (Test / Edit / Delete)
- `Add Connector` as primary `PageHeader` action
- Per-row test button moves into actions menu
- Delete confirmation via `Dialog`

### 6.3 Catalog `/catalog`

- Two-column layout preserved (tree sidebar + detail area)
- Left column (240px): connector → schemas → tables tree, ChevronRight expand, selected row emerald-tint bg
- Right column: when a table is selected, `Tabs` between `Schema` and `Preview`
  - Schema tab: `DataTable` of columns (sortable), mono for names + types, PK badge
  - Preview tab: read-only `DataTable` row sample + row-count indicator + refresh button

### 6.4 Pipelines `/pipelines`

- Card grid → `DataTable`: name, status, node count, updated-at, run-count, actions menu
- Filter bar at top: search Input + status multi-Select
- `New Pipeline` as primary `PageHeader` action
- Empty state → `EmptyState` with New Pipeline CTA

### 6.5 Pipeline editor `/pipelines/:id`

Covered in Section 5.

### 6.6 CDC Streams `/cdc`

- `DataTable` of jobs: name, connector, source, status pill, last sync, rows synced, actions (Sync now / Snapshot / Logs / Edit / Delete)
- **Detail drawer** (new): slides from right when a row is clicked, shows sync log list, can trigger sync inline. Replaces any current fragmented modals.

### 6.7 Monitoring `/monitoring`

- Top: four `StatCard`s (Total Runs, Success Rate, Avg Duration, CDC Rows Synced) — retoken
- "Run Activity" chart: keep existing chart library, restyled emerald + gray; x-axis dates, y-axis count, stacked bars completed/failed
- "Status Breakdown": segmented bars or compact donut
- "CDC Jobs" status grid: retoken
- "Log Export" block: restyled to match Section 4 input/select patterns
- "Push to External Service" (webhook): restyled; Test button returns a Toast with result

### 6.8 Navigation / IA

Unchanged. Same 6 routes. No IA overhaul in this spec.

## 7 · Implementation Order

Even as one big-bang PR series, code lands in this sequence:

1. **Tokens** — update `src/globals.css` / Tailwind `@theme` with new CSS variables. No visual change yet — shadcn components pick up new colors/radii automatically.
2. **Primitives** — add new primitives (`Badge`, `StatCard`, `EmptyState`, `DataTable`, `PageHeader`, `Kbd`); retoken existing ones where style diverges from token defaults.
3. **Layout shell** — `AppShell`, sidebar, topbar refactor. Swap all pages to use `PageHeader`.
4. **Pipeline canvas** — node component, toolbar, catalog sidebar, config panel, run history panel, edge/minimap styling, validation banner.
5. **List pages** — Connectors, Pipelines list, CDC, Dashboard recent list all adopt `DataTable`.
6. **Detail / specialty pages** — Catalog tabs, Monitoring stat cards + chart theming, CDC detail drawer.
7. **Empty / loading / error states** — sweep all pages; every list has skeleton + empty + error paths.

## 8 · Migration Notes

### 8.1 Deletions (grep-verifiable)

- Ad-hoc status dot markup on Connectors list (inline strings like `Status: success · Last tested: …`)
- Per-page empty-state duplicated JSX
- Inline button markup that bypasses the `Button` primitive
- Custom card borders that don't use the `Card` primitive

### 8.2 Token pass-through

- shadcn primitives consume `--primary`, `--border`, `--background`, etc. Retokening changes variable values only — class API is preserved, no sweeping class renames needed.

### 8.3 Fonts

- Self-host Inter + JetBrains Mono via `@fontsource/inter` and `@fontsource/jetbrains-mono`
- Preload critical weights in `index.html` to avoid FOUT

### 8.4 React Flow

- All canvas styles live in a scoped CSS module + inline styles driven by our token variables
- Document the customization seams so a future React Flow upgrade is tractable

## 9 · Testing

### 9.1 Gates (must pass before merge)

- `pnpm run build` — TypeScript + Vite production build green
- `pytest` — all backend tests remain green (UI revamp is frontend-only; backend untouched)
- Chrome DevTools manual smoke across all 7 pages: zero console errors, all XHRs 2xx, pipeline editor Run flow succeeds
- Keyboard accessibility spot-check of every page (tab through, Enter activates primary actions)

### 9.2 Out of scope

- Visual regression snapshots (Playwright) — documented as follow-up project
- Automated a11y scanner — manual spot-check only

## 10 · Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Big-bang refresh breaks a page we didn't test | Chunked commits in a single branch; Chrome DevTools smoke after each chunk |
| Token rename churn in existing components | Preserve Tailwind class names; change only CSS variable values |
| React Flow deep customization breaks on library upgrade | Scoped CSS module + inline styles driven by our tokens; document the seams |
| Font loading flash | Self-host + preload critical weights |
| Scope creep into dark mode / command palette / IA | Explicit Out-of-Scope list (Section 11); reject additions to this spec; follow-up projects instead |

## 11 · Out of Scope (deferred)

- Dark mode toggle (Workbench is fixed dark-sidebar / light-work-area by design)
- Command palette (⌘K) — only the affordance is in the topbar; the palette itself is a future project
- Visual regression snapshots (Playwright)
- Responsive below 1024px
- IA / navigation restructure
- Animated data-flow edges during run (stretch goal; in-scope only if trivial to add)
- Sparkline data for `StatCard` (slot reserved; data plumbing is future work)

## 12 · Definition of Done

- All 7 pages render with new tokens and primitives
- `pnpm run build` green
- `pytest` green
- Chrome DevTools smoke: zero console errors, editor Run flow succeeds
- No inline status-dot / button / card markup remains (`grep` proves it)
- Screenshots of each page attached to the final PR

## 13 · Follow-up projects (separate specs)

- **UI-2** — Dark mode toggle
- **UI-3** — Command palette (⌘K) implementation
- **UI-4** — Visual regression test suite (Playwright)
- **UI-5** — Mobile/tablet responsive treatment (if needed)
