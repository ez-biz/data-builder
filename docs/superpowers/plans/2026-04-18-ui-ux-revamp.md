# Data Builder UI/UX Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Data Builder frontend to a distinctive Workbench aesthetic (dark sidebar + light work area + dot-grid canvas) with an Emerald primary accent and standardized primitives, across all 7 pages + shell in a single big-bang refresh.

**Architecture:** Token-first rollout — update CSS variables in `globals.css` so existing shadcn primitives adopt the new palette with no class changes; add new primitives (`Badge` variants, `StatCard`, `EmptyState`, `DataTable`, `PageHeader`, `Kbd`, `Skeleton`); rewrite layout shell + pipeline canvas; swap every list page to `DataTable` and every page top to `PageHeader`.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind 4 (`@theme` block) + shadcn/Radix primitives + React Flow 12 + TanStack Query + Zustand. No new test framework; verification via `pnpm run build` + Chrome DevTools manual smoke.

**Source spec:** `docs/superpowers/specs/2026-04-18-ui-ux-revamp-design.md` (commit `6e9137a`).

---

## Testing Model

Frontend has no Vitest/Testing Library and the spec explicitly keeps visual regression out of scope. For each task:

- **Build gate:** `cd frontend && pnpm run build` must exit 0 (TypeScript + Vite)
- **Dev server smoke:** `pnpm run dev` and visit the affected page; expected visual state described in the task
- **Console check:** open browser DevTools, confirm zero errors on affected page
- **Backend protection:** `cd backend && source .venv/bin/activate && pytest` must remain green after each commit
- **A11y spot check (final task only):** keyboard tab through every page

No step says "write a failing unit test" because there is no unit test harness. Where a primitive has branching behavior, the verification step describes the exact condition to observe in the browser.

---

## File Structure Map

### New files

```
frontend/src/components/ui/
  ├── data-table.tsx        (new primitive — generic sortable table with loading/empty/error)
  ├── dropdown-menu.tsx     (Radix wrapper — dep already installed)
  ├── empty-state.tsx       (new primitive — icon/title/body/action)
  ├── kbd.tsx               (new primitive — keyboard hint tile)
  ├── page-header.tsx       (new primitive — title/description/actions)
  ├── skeleton.tsx          (new primitive — loading block)
  ├── stat-card.tsx         (new primitive — label/value/delta/hint)
  ├── tabs.tsx              (Radix wrapper — dep already installed)
  └── tooltip.tsx           (Radix wrapper — dep already installed)

frontend/src/hooks/
  └── useBackendHealth.ts   (pings /api/health for sidebar health dot)
```

### Modified files

```
frontend/package.json                              (adds @fontsource/inter, @fontsource/jetbrains-mono)
frontend/src/main.tsx                              (imports font CSS)
frontend/src/globals.css                           (rewritten @theme block)

frontend/src/components/ui/
  ├── badge.tsx             (new variants: status, count, kind)
  ├── button.tsx            (restyled via tokens + variant tweaks)
  ├── card.tsx              (radius 6, shadow-sm on hover)
  ├── dialog.tsx            (radius 10, shadow-lg, emerald primary action)
  ├── input.tsx             (36px, gray-300 border, emerald ring)
  ├── select.tsx            (tokens)
  └── toast.tsx             (left accent stripe)

frontend/src/components/layout/
  ├── AppShell.tsx          (new structure; uses PageHeader per page)
  ├── Sidebar.tsx           (collapsible, dark, active accent bar, health dot, version footer)
  └── Header.tsx            (breadcrumb, env Badge, ⌘K search affordance)

frontend/src/components/pipeline/
  ├── PipelineCanvas.tsx    (dot grid bg, themed minimap + controls, edge styling)
  ├── PipelineToolbar.tsx   (chip retheme — colored borders)
  ├── CatalogSidebar.tsx    (gray-50 bg, mono table names, badge counts)
  ├── NodeConfigPanel.tsx   (tokens only — no behavior change)
  └── nodes/
      ├── SourceNode.tsx        (new recipe: left accent bar + 3-line body)
      ├── FilterNode.tsx        (same recipe)
      ├── TransformNode.tsx     (same recipe)
      ├── JoinNode.tsx          (same recipe)
      ├── AggregateNode.tsx     (same recipe)
      └── DestinationNode.tsx   (same recipe)

frontend/src/pages/
  ├── DashboardPage.tsx     (StatCard + DataTable for recent pipelines)
  ├── ConnectorsPage.tsx    (DataTable + actions menu)
  ├── CatalogPage.tsx       (Tabs: Schema / Preview, DataTable for columns)
  ├── PipelineListPage.tsx  (DataTable + filter bar)
  ├── PipelineEditorPage.tsx (topbar restyle, validation banner, Run History panel)
  ├── CDCPage.tsx           (DataTable + detail drawer)
  └── MonitoringPage.tsx    (StatCard adoption, chart retheme)
```

---

## Phase 1 · Tokens & Fonts

### Task 1.1: Install and wire fonts

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Install font packages**

```bash
cd frontend && pnpm add @fontsource/inter @fontsource/jetbrains-mono
```

- [ ] **Step 2: Import font stylesheets in `main.tsx`**

Add these imports at the top of `frontend/src/main.tsx` (before any component imports):

```tsx
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
```

- [ ] **Step 3: Verify build**

```bash
cd frontend && pnpm run build
```

Expected: exits 0; no new errors.

- [ ] **Step 4: Run dev server and verify fonts load**

```bash
cd frontend && pnpm run dev
```

Open http://localhost:5173 in a browser, open DevTools → Network → Fonts filter. Expected: 4 Inter weights + 2 JetBrains Mono weights load as `.woff2`. Body text renders in Inter (check via DevTools Computed styles on `<body>`).

- [ ] **Step 5: Commit**

```bash
cd /Users/anchitgupta/data-builder
git add frontend/package.json frontend/pnpm-lock.yaml frontend/src/main.tsx
git commit -m "feat(ui): self-host Inter and JetBrains Mono via @fontsource

Preload 4 Inter weights + 2 mono weights. Foundation for typography tokens.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.2: Rewrite `globals.css` with Workbench + Emerald tokens

**Files:**
- Modify: `frontend/src/globals.css` (replace entire contents)

- [ ] **Step 1: Replace `globals.css` with the new token set**

Overwrite `frontend/src/globals.css` with:

```css
@import "tailwindcss";

/* ============================================================
   Data Builder — Workbench + Emerald design tokens
   See: docs/superpowers/specs/2026-04-18-ui-ux-revamp-design.md
   ============================================================ */

@theme {
  /* ---- Brand / accent (Emerald) ---- */
  --color-primary: #059669;
  --color-primary-foreground: #ffffff;
  --color-primary-hover: #047857;
  --color-primary-faint: #d1fae5;

  /* ---- Surfaces ---- */
  --color-background: #ffffff;
  --color-foreground: #111827;
  --color-card: #ffffff;
  --color-card-foreground: #111827;
  --color-popover: #ffffff;
  --color-popover-foreground: #111827;
  --color-muted: #f9fafb;
  --color-muted-foreground: #6b7280;
  --color-accent: #f3f4f6;
  --color-accent-foreground: #111827;
  --color-secondary: #f3f4f6;
  --color-secondary-foreground: #111827;
  --color-border: #e5e7eb;
  --color-input: #d1d5db;
  --color-ring: #059669;

  /* ---- Text scale ---- */
  --color-text-primary: #111827;
  --color-text-secondary: #6b7280;
  --color-text-muted: #9ca3af;

  /* ---- Sidebar (always dark #111827) ---- */
  --color-sidebar-background: #111827;
  --color-sidebar-foreground: #d1d5db;
  --color-sidebar-foreground-strong: #ffffff;
  --color-sidebar-muted: #9ca3af;
  --color-sidebar-border: #1f2937;
  --color-sidebar-hover: #1f2937;
  --color-sidebar-active-bg: #064e3b;
  --color-sidebar-active-accent: #10b981;
  --color-sidebar-active-icon: #6ee7b7;
  --color-sidebar-primary: #059669;
  --color-sidebar-primary-foreground: #ffffff;
  --color-sidebar-accent: #1f2937;
  --color-sidebar-accent-foreground: #ffffff;
  --color-sidebar-ring: #10b981;

  /* ---- Canvas ---- */
  --color-canvas-background: #fafbfc;
  --color-canvas-dot: #d1d5db;

  /* ---- Status ---- */
  --color-status-success: #059669;
  --color-status-success-faint: #d1fae5;
  --color-status-error: #dc2626;
  --color-status-error-faint: #fee2e2;
  --color-status-warn: #d97706;
  --color-status-warn-faint: #fef3c7;
  --color-status-info: #0ea5e9;
  --color-status-info-faint: #e0f2fe;

  /* ---- Node type palette ---- */
  --color-node-source: #059669;
  --color-node-filter: #0ea5e9;
  --color-node-transform: #8b5cf6;
  --color-node-join: #06b6d4;
  --color-node-aggregate: #10b981;
  --color-node-destination: #f59e0b;

  /* ---- Destructive (keep red) ---- */
  --color-destructive: #dc2626;
  --color-destructive-foreground: #ffffff;

  /* ---- Radius ---- */
  --radius-sm: 0.25rem;     /* 4px */
  --radius-md: 0.375rem;    /* 6px */
  --radius-lg: 0.625rem;    /* 10px */
  --radius-xl: 0.75rem;

  /* ---- Shadows ---- */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 8px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 12px 24px rgba(0, 0, 0, 0.08);

  /* ---- Typography ---- */
  --font-sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}

@layer base {
  * {
    border-color: var(--color-border);
  }
  body {
    background: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
    font-size: 13px;
    line-height: 1.5;
  }
  code, kbd, pre, samp {
    font-family: var(--font-mono);
  }
}

/* Reduce motion for users who prefer it */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Global focus-visible */
:focus-visible {
  outline: 2px solid var(--color-ring);
  outline-offset: 2px;
}

/* ============================================================
   React Flow theming — canvas dot-grid, edges, controls, minimap
   ============================================================ */
.react-flow {
  background: var(--color-canvas-background);
}

.react-flow__background {
  background-color: var(--color-canvas-background);
  background-image: radial-gradient(circle, var(--color-canvas-dot) 1px, transparent 1px);
  background-size: 16px 16px;
}

.react-flow__edge-path {
  stroke: #9ca3af;
  stroke-width: 1.5;
}

.react-flow__edge.selected .react-flow__edge-path {
  stroke: var(--color-primary);
  stroke-width: 2;
}

.react-flow__edge:hover .react-flow__edge-path {
  stroke: #10b981;
  stroke-width: 2;
}

.react-flow__handle {
  width: 8px;
  height: 8px;
  background: #9ca3af;
  border: 2px solid #ffffff;
  border-radius: 50%;
  transition: background 0.15s ease, transform 0.15s ease;
}

.react-flow__handle:hover,
.react-flow__handle.connecting,
.react-flow__handle.connectingfrom {
  background: var(--color-primary);
  transform: scale(1.2);
}

.react-flow__controls {
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.react-flow__controls-button {
  background: #ffffff;
  border-bottom: 1px solid var(--color-border);
  color: #6b7280;
  width: 32px;
  height: 32px;
}

.react-flow__controls-button:hover {
  background: var(--color-muted);
  color: #111827;
}

.react-flow__minimap {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm run build
```

Expected: exits 0. (Existing shadcn classes like `bg-primary`, `border-border`, `text-muted-foreground` still compile — we only changed the values the variables resolve to.)

- [ ] **Step 3: Run dev server and eyeball the global impact**

```bash
cd frontend && pnpm run dev
```

Visit http://localhost:5173. Expected observations:
- Body text in Inter (not system default)
- Primary buttons on the Dashboard are emerald green, not the old purple
- Card borders are gray-200
- No layout breakage; no console errors

Existing components don't look *right* yet (sidebar is still white, nodes are still old style). That's expected — those are later tasks. Only confirm the tokens propagated.

- [ ] **Step 4: Commit**

```bash
cd /Users/anchitgupta/data-builder
git add frontend/src/globals.css
git commit -m "feat(ui): rewrite design tokens to Workbench + Emerald

- Emerald #059669 primary; white cards; gray-200 borders
- Dark sidebar token set (#111827 with emerald active accent)
- Status / node-type color palette
- Radius 4/6/10; shadow sm/md/lg
- React Flow override: dot-grid canvas, themed edges/handles/minimap/controls

No visual-layout changes; existing shadcn classes consume new values through CSS variables.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 · Primitives

### Task 2.1: Add Radix wrapper primitives (Tabs, Tooltip, DropdownMenu)

Deps already installed. We just need thin shadcn-style wrappers so pages import from `@/components/ui/*` consistently.

**Files:**
- Create: `frontend/src/components/ui/tabs.tsx`
- Create: `frontend/src/components/ui/tooltip.tsx`
- Create: `frontend/src/components/ui/dropdown-menu.tsx`

- [ ] **Step 1: Create `tabs.tsx`**

```tsx
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center gap-6 border-b border-border",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative -mb-px px-1 pb-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
      "data-[state=active]:text-foreground data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-4 focus-visible:outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
```

- [ ] **Step 2: Create `tooltip.tsx`**

```tsx
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md bg-gray-900 px-2 py-1 text-[11px] text-white shadow-md",
      "animate-in fade-in-0 zoom-in-95",
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
```

- [ ] **Step 3: Create `dropdown-menu.tsx`**

```tsx
import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[10rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
      "focus:bg-accent focus:text-accent-foreground",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("my-1 h-px bg-border", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
};
```

- [ ] **Step 4: Verify build**

```bash
cd frontend && pnpm run build
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/tabs.tsx frontend/src/components/ui/tooltip.tsx frontend/src/components/ui/dropdown-menu.tsx
git commit -m "feat(ui): add Tabs, Tooltip, DropdownMenu Radix wrappers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.2: Add `Skeleton` and `Kbd` primitives

**Files:**
- Create: `frontend/src/components/ui/skeleton.tsx`
- Create: `frontend/src/components/ui/kbd.tsx`

- [ ] **Step 1: Create `skeleton.tsx`**

```tsx
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Create `kbd.tsx`**

```tsx
import { cn } from "@/lib/utils";

export function Kbd({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground",
        "h-5 min-w-[20px]",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
cd frontend && pnpm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ui/skeleton.tsx frontend/src/components/ui/kbd.tsx
git commit -m "feat(ui): add Skeleton and Kbd primitives

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.3: Badge variants — status, count, kind

**Files:**
- Modify: `frontend/src/components/ui/badge.tsx` (replace file)

- [ ] **Step 1: Replace `badge.tsx`**

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold leading-none transition-colors",
  {
    variants: {
      /** Semantic: run status — always paired with a text label, never color-only */
      status: {
        pending: "bg-gray-100 text-gray-700",
        running: "bg-[var(--color-status-info-faint)] text-[var(--color-status-info)]",
        completed: "bg-[var(--color-status-success-faint)] text-[var(--color-status-success)]",
        failed: "bg-[var(--color-status-error-faint)] text-[var(--color-status-error)]",
        cancelled: "bg-gray-100 text-gray-600",
      },
      /** Numeric count pill for nav counts */
      count: {
        sidebar: "bg-gray-800 text-gray-100 font-mono tabular-nums",
        muted: "bg-muted text-muted-foreground font-mono tabular-nums",
      },
      /** Pipeline node type chip — colored by node kind */
      kind: {
        source: "bg-[var(--color-node-source)]/10 text-[var(--color-node-source)]",
        filter: "bg-[var(--color-node-filter)]/10 text-[var(--color-node-filter)]",
        transform: "bg-[var(--color-node-transform)]/10 text-[var(--color-node-transform)]",
        join: "bg-[var(--color-node-join)]/10 text-[var(--color-node-join)]",
        aggregate: "bg-[var(--color-node-aggregate)]/10 text-[var(--color-node-aggregate)]",
        destination: "bg-[var(--color-node-destination)]/10 text-[var(--color-node-destination)]",
      },
      /** Legacy variants — map to token-based colors */
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-[var(--color-status-error-faint)] text-[var(--color-status-error)]",
        outline: "border border-border text-foreground",
        success: "bg-[var(--color-status-success-faint)] text-[var(--color-status-success)]",
        warning: "bg-[var(--color-status-warn-faint)] text-[var(--color-status-warn)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({
  className,
  variant,
  status,
  count,
  kind,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, status, count, kind }), className)}
      {...props}
    />
  );
}

export { badgeVariants };
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm run build
```

Existing usages of `<Badge variant="success" />` still compile. `<Badge status="completed" />` is newly available.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/badge.tsx
git commit -m "feat(ui): Badge variants — status, count, kind

Status variant maps to RunStatus values with text labels (never color-only).
Count for sidebar/muted numeric pills. Kind for node-type chips.
Legacy variant prop preserved for existing usages.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.4: `EmptyState` primitive

**Files:**
- Create: `frontend/src/components/ui/empty-state.tsx`

- [ ] **Step 1: Create `empty-state.tsx`**

```tsx
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-muted/30 px-6 py-12 text-center",
        className,
      )}
      role="status"
    >
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {body && <p className="max-w-sm text-xs text-muted-foreground">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/empty-state.tsx
git commit -m "feat(ui): EmptyState primitive

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.5: `PageHeader` primitive

**Files:**
- Create: `frontend/src/components/ui/page-header.tsx`

- [ ] **Step 1: Create `page-header.tsx`**

```tsx
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold leading-tight text-foreground">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/page-header.tsx
git commit -m "feat(ui): PageHeader primitive

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.6: `StatCard` primitive

**Files:**
- Create: `frontend/src/components/ui/stat-card.tsx`

- [ ] **Step 1: Create `stat-card.tsx`**

```tsx
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: string | number;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  hint?: string;
  /** Reserved API; no-op in MVP */
  sparkline?: number[];
  className?: string;
}

const deltaClasses: Record<"up" | "down" | "flat", string> = {
  up: "text-[var(--color-status-success)]",
  down: "text-[var(--color-status-error)]",
  flat: "text-muted-foreground",
};

export function StatCard({
  label,
  value,
  delta,
  hint,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card p-4 transition-shadow hover:shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {delta && (
          <span
            className={cn(
              "font-mono text-[11px] font-semibold tabular-nums",
              deltaClasses[delta.direction],
            )}
          >
            {delta.value}
          </span>
        )}
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/stat-card.tsx
git commit -m "feat(ui): StatCard primitive

sparkline prop reserved in API, no-op render in MVP.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.7: `DataTable` primitive

**Files:**
- Create: `frontend/src/components/ui/data-table.tsx`

Generic-over-row-type table with built-in loading skeleton / empty / error states. Sortable column headers.

- [ ] **Step 1: Create `data-table.tsx`**

```tsx
import * as React from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export interface DataTableColumn<T> {
  /** Unique key; also used as the sort key */
  key: string;
  /** Display label */
  header: React.ReactNode;
  /** Cell renderer */
  cell: (row: T) => React.ReactNode;
  /** Enable sorting by this column's `key` */
  sortable?: boolean;
  /** Optional Tailwind width class, e.g. "w-32" */
  width?: string;
  /** Right-align numeric columns */
  align?: "left" | "right";
}

type SortState = { key: string; dir: "asc" | "desc" } | null;

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[] | undefined;
  /** Stable key per row (e.g. row.id) */
  getRowId: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  /** Empty state when rows is [] and !loading */
  empty?: React.ReactNode;
  /** Invoked on row click (optional) */
  onRowClick?: (row: T) => void;
  /** Custom sort comparator — defaults to string compare on row[key] */
  getSortValue?: (row: T, key: string) => string | number;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading,
  error,
  empty,
  onRowClick,
  getSortValue,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = React.useState<SortState>(null);

  const sortedRows = React.useMemo(() => {
    if (!rows || !sort) return rows;
    const defaultGet = (row: T, key: string) =>
      (row as unknown as Record<string, string | number | null | undefined>)[key] ?? "";
    const getVal = getSortValue ?? defaultGet;
    return [...rows].sort((a, b) => {
      const av = getVal(a, sort.key);
      const bv = getVal(b, sort.key);
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sort, getSortValue]);

  const handleSort = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };

  if (loading) {
    return (
      <div className={cn("rounded-md border border-border bg-card", className)}>
        <div className="border-b border-border bg-muted px-3 py-2">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-3 py-3">
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "rounded-md border border-[var(--color-status-error)]/30 bg-[var(--color-status-error-faint)] p-4 text-sm text-[var(--color-status-error)]",
          className,
        )}
        role="alert"
      >
        {error}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    if (empty) return <>{empty}</>;
    return (
      <EmptyState
        title="No data"
        body="Nothing to show yet."
        className={className}
      />
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-md border border-border bg-card", className)}>
      <table className="w-full border-collapse text-sm">
        <thead className="border-b border-border bg-muted text-left">
          <tr>
            {columns.map((col) => {
              const active = sort?.key === col.key;
              const SortIcon = active
                ? sort?.dir === "asc"
                  ? ChevronUp
                  : ChevronDown
                : ChevronsUpDown;
              return (
                <th
                  key={col.key}
                  className={cn(
                    "px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
                    col.width,
                    col.align === "right" && "text-right",
                  )}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => handleSort(col.key)}
                      className="inline-flex items-center gap-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
                    >
                      {col.header}
                      <SortIcon className="h-3 w-3" />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sortedRows!.map((row) => (
            <tr
              key={getRowId(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "transition-colors",
                onRowClick && "cursor-pointer hover:bg-muted/50",
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-3 py-2.5 align-middle text-foreground",
                    col.align === "right" && "text-right",
                  )}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/data-table.tsx
git commit -m "feat(ui): DataTable primitive

Generic sortable table with loading skeleton / empty / error states.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.8: Button tweaks — sizes and ghost variant

Token-first made most Button appearance work. One tweak: size-based padding/height and ghost-border recipe per spec.

**Files:**
- Modify: `frontend/src/components/ui/button.tsx`

- [ ] **Step 1: Update the CVA variants in `button.tsx`**

Replace the entire `buttonVariants` block (lines 6–30 of current file) with:

```tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[var(--color-primary-hover)]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background text-foreground hover:bg-muted",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "border border-border text-foreground hover:bg-muted",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5 text-[13px]",
        sm: "h-7 px-2.5 text-xs",
        md: "h-9 px-3.5 text-[13px]",
        lg: "h-11 px-5 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
```

The only semantic change: `ghost` now has a border (spec: "Ghost = gray border + gray-900 text"). Existing usage compiles.

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm run build
```

- [ ] **Step 3: Run dev server and eyeball the Dashboard**

```bash
cd frontend && pnpm run dev
```

Visit http://localhost:5173. Expected: `New Pipeline` button is emerald with white text. Any ghost buttons (e.g. Edit on Connectors) now have a visible gray border.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ui/button.tsx
git commit -m "feat(ui): Button — emerald primary, bordered ghost variant, size scale

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.9: Card and Dialog radius/shadow tweaks

**Files:**
- Modify: `frontend/src/components/ui/card.tsx`
- Modify: `frontend/src/components/ui/dialog.tsx`

- [ ] **Step 1: Update Card classes**

In `frontend/src/components/ui/card.tsx`, change line 8 from:

```tsx
className={cn("rounded-xl border bg-card text-card-foreground shadow", className)}
```

to:

```tsx
className={cn(
  "rounded-md border border-border bg-card text-card-foreground transition-shadow hover:shadow-sm",
  className,
)}
```

- [ ] **Step 2: Update Dialog radius and shadow**

Open `frontend/src/components/ui/dialog.tsx`. Find the `DialogContent` className (it wraps Radix `DialogPrimitive.Content`); update the rounded/shadow tokens to match:

Replace the existing className with (keep animation/positioning classes intact):

```tsx
className={cn(
  "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border border-border bg-background p-6 shadow-lg duration-200",
  "data-[state=open]:animate-in data-[state=closed]:animate-out",
  "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
  className,
)}
```

- [ ] **Step 3: Verify build**

```bash
cd frontend && pnpm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ui/card.tsx frontend/src/components/ui/dialog.tsx
git commit -m "feat(ui): Card + Dialog — new radius and shadow tokens

Card: radius 6px, hover shadow-sm. Dialog: radius 10px, shadow-lg.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 · Layout Shell

### Task 3.1: `useBackendHealth` hook

**Files:**
- Create: `frontend/src/hooks/useBackendHealth.ts`

- [ ] **Step 1: Create the hook**

```ts
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

export function useBackendHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const { data } = await api.get<{ status: string; database: string; version: string }>(
        "/health",
      );
      return data;
    },
    refetchInterval: 30_000,
    retry: 1,
    staleTime: 10_000,
  });
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useBackendHealth.ts
git commit -m "feat(ui): useBackendHealth hook — 30s polling /api/health

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.2: Sidebar rewrite — dark, collapsible, active accent, health dot

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx` (replace contents)

- [ ] **Step 1: Replace `Sidebar.tsx`**

```tsx
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Plug,
  Database,
  GitBranch,
  RefreshCw,
  Activity,
  ChevronLeft,
  ChevronRight,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { useConnectors } from "@/api/connectors";
import { usePipelines } from "@/api/pipelines";

const STORAGE_KEY = "databuilder:sidebar-collapsed";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/connectors", label: "Connectors", icon: Plug, badgeSource: "connectors" as const },
  { to: "/catalog", label: "Catalog", icon: Database },
  { to: "/pipelines", label: "Pipelines", icon: GitBranch, badgeSource: "pipelines" as const },
  { to: "/cdc", label: "CDC Streams", icon: RefreshCw },
  { to: "/monitoring", label: "Monitoring", icon: Activity },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const { data: connectors } = useConnectors();
  const { data: pipelines } = usePipelines();
  const health = useBackendHealth();

  const badgeFor = (source?: "connectors" | "pipelines") => {
    if (source === "connectors") return connectors?.length ?? 0;
    if (source === "pipelines") return pipelines?.length ?? 0;
    return undefined;
  };

  const width = collapsed ? "w-14" : "w-56";

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "flex h-full flex-col bg-[var(--color-sidebar-background)] text-[var(--color-sidebar-foreground)] transition-[width] duration-150",
          width,
        )}
      >
        {/* Brand row */}
        <div className="flex h-14 items-center justify-between border-b border-[var(--color-sidebar-border)] px-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GitBranch className="h-4 w-4" />
            </div>
            {!collapsed && (
              <span className="text-sm font-semibold text-[var(--color-sidebar-foreground-strong)]">
                Data Builder
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="rounded-md p-1 text-[var(--color-sidebar-muted)] transition-colors hover:bg-[var(--color-sidebar-hover)] hover:text-[var(--color-sidebar-foreground-strong)]"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Nav */}
        <nav aria-label="Main navigation" className="flex-1 space-y-0.5 p-2">
          {navItems.map(({ to, label, icon: Icon, end, badgeSource }) => {
            const badge = badgeFor(badgeSource);
            const navLink = (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "relative flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-sidebar-ring)]",
                    isActive
                      ? "bg-[var(--color-sidebar-active-bg)] text-[var(--color-sidebar-foreground-strong)]"
                      : "text-[var(--color-sidebar-foreground)] hover:bg-[var(--color-sidebar-hover)] hover:text-[var(--color-sidebar-foreground-strong)]",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-[var(--color-sidebar-active-accent)]"
                      />
                    )}
                    <Icon
                      className={cn(
                        "h-4 w-4 flex-shrink-0",
                        isActive ? "text-[var(--color-sidebar-active-icon)]" : "text-[var(--color-sidebar-muted)]",
                      )}
                    />
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate">{label}</span>
                        {badge !== undefined && badge > 0 && (
                          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gray-800 px-1.5 font-mono text-[10px] tabular-nums text-gray-100">
                            {badge}
                          </span>
                        )}
                      </>
                    )}
                  </>
                )}
              </NavLink>
            );

            return collapsed ? (
              <Tooltip key={to}>
                <TooltipTrigger asChild>{navLink}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            ) : (
              navLink
            );
          })}
        </nav>

        {/* Footer: settings link + version + health dot */}
        <div className="border-t border-[var(--color-sidebar-border)] p-2">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                "flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-sidebar-ring)]",
                isActive
                  ? "bg-[var(--color-sidebar-active-bg)] text-[var(--color-sidebar-foreground-strong)]"
                  : "text-[var(--color-sidebar-foreground)] hover:bg-[var(--color-sidebar-hover)] hover:text-[var(--color-sidebar-foreground-strong)]",
              )
            }
          >
            <Settings className="h-4 w-4 flex-shrink-0 text-[var(--color-sidebar-muted)]" />
            {!collapsed && <span>Settings</span>}
          </NavLink>
          {!collapsed && (
            <div className="mt-2 flex items-center justify-between px-2.5 text-[11px] text-[var(--color-sidebar-muted)]">
              <span className="font-mono">v0.1.0</span>
              <HealthIndicator status={health.data?.status} isError={health.isError} />
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}

function HealthIndicator({ status, isError }: { status?: string; isError?: boolean }) {
  const ok = status === "healthy" && !isError;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={ok ? "Backend healthy" : "Backend unreachable"}
          className="flex items-center gap-1.5"
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              ok ? "bg-[var(--color-status-success)]" : "bg-[var(--color-status-error)]",
            )}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {ok ? "Backend online" : "Backend offline"}
      </TooltipContent>
    </Tooltip>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm run build
```

If build fails because `useConnectors` or `usePipelines` have a different name, open `frontend/src/api/connectors.ts` and `frontend/src/api/pipelines.ts` and match exactly — keep the hook calls identical to what those files export.

- [ ] **Step 3: Dev server visual check**

```bash
cd frontend && pnpm run dev
```

Visit http://localhost:5173. Expected:
- Sidebar is dark `#111827`
- Active nav item has an emerald left accent bar (~2px wide) and emerald-tinted icon
- Connectors and Pipelines show numeric badges (if there are rows)
- Collapse/expand toggle works; state survives a page reload
- Health dot at bottom-right is green when backend is up
- Stop the backend → dot turns red within ~30s

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "feat(ui): Sidebar rewrite — dark, collapsible, accent, health dot

- Collapsible with localStorage persistence (STORAGE_KEY=databuilder:sidebar-collapsed)
- Active item: emerald left accent bar + subtle bg tint
- Per-item count badges (Connectors, Pipelines) from API counts
- Health dot in footer pings /api/health every 30s

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.3: Header (topbar) rewrite

**Files:**
- Modify: `frontend/src/components/layout/Header.tsx` (replace contents)

- [ ] **Step 1: Replace `Header.tsx`**

```tsx
import { useLocation, Link } from "react-router-dom";
import { Search, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";

const ENV = import.meta.env.VITE_ENV_NAME as string | undefined;

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/connectors": "Connectors",
  "/catalog": "Catalog",
  "/pipelines": "Pipelines",
  "/cdc": "CDC Streams",
  "/monitoring": "Monitoring",
};

function useCrumbs(pathname: string): { label: string; to?: string }[] {
  // Root routes render no crumb; nested pipeline page shows "Pipelines › <id>"
  if (pathname === "/") return [];
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 1) return [{ label: pageTitles[pathname] ?? segments[0] }];
  if (segments[0] === "pipelines" && segments[1] && segments[1] !== "new") {
    return [
      { label: "Pipelines", to: "/pipelines" },
      { label: segments[1].slice(0, 8), to: undefined },
    ];
  }
  return segments.map((s, i) => ({ label: s, to: i < segments.length - 1 ? "/" + segments.slice(0, i + 1).join("/") : undefined }));
}

export function Header() {
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? "Data Builder";
  const crumbs = useCrumbs(location.pathname);

  return (
    <header className="flex h-11 items-center justify-between border-b border-border bg-card px-4">
      {/* Left: title + optional breadcrumb */}
      <div className="flex min-w-0 items-center gap-2 text-[13px]">
        <h1 className="truncate font-semibold text-foreground">{title}</h1>
        {crumbs.length > 1 && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                {c.to ? (
                  <Link to={c.to} className="text-muted-foreground hover:text-foreground">
                    {c.label}
                  </Link>
                ) : (
                  <span className="font-mono text-muted-foreground">{c.label}</span>
                )}
              </span>
            ))}
          </>
        )}
      </div>

      {/* Right: search affordance + env badge */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Search (coming soon)"
          disabled
          className="inline-flex h-7 items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 text-[11px] text-muted-foreground"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search</span>
          <Kbd>⌘K</Kbd>
        </button>
        {ENV && (
          <Badge variant="outline" className="font-mono uppercase">
            {ENV}
          </Badge>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm run build
```

- [ ] **Step 3: Dev server visual check**

Expected: topbar is 44px tall, shows page title on the left; on the Pipeline editor route `/pipelines/<id>`, shows breadcrumb `Pipelines › <short-id>`. Right side shows a disabled search chip with `⌘K`. If `VITE_ENV_NAME` is set (it isn't by default), shows a badge — no badge is expected in dev.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/Header.tsx
git commit -m "feat(ui): Topbar — breadcrumb, search affordance with Kbd, env badge

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.4: AppShell — max-width on info pages, full-width on editor

Info-dense pages (Dashboard, Monitoring, list pages) get a 1280px max-width; the Pipeline editor uses the full viewport width. Handle this once in `AppShell`.

**Files:**
- Modify: `frontend/src/components/layout/AppShell.tsx` (replace contents)

- [ ] **Step 1: Replace `AppShell.tsx`**

```tsx
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main id="main-content" className="flex-1 overflow-auto bg-background">
          <RouteContent />
        </main>
      </div>
    </div>
  );
}

/**
 * The Pipeline editor needs the full viewport width for its canvas; every
 * other page caps at 1280px and gets consistent padding.
 */
function RouteContent() {
  const location = useLocation();
  const isEditor = /^\/pipelines\/[^/]+$/.test(location.pathname);
  if (isEditor) {
    return <Outlet />;
  }
  return (
    <div className="mx-auto max-w-[1280px] px-8 py-6">
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm run build
```

- [ ] **Step 3: Visual check**

```bash
cd frontend && pnpm run dev
```

Expected: Dashboard/Connectors/etc. have 1280px max-width with 32px horizontal padding; navigating to an editor route fills the entire content area (no max-width constraint).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/AppShell.tsx
git commit -m "feat(ui): AppShell — 1280px max-width for info pages, full-width for editor

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 · Pipeline Canvas

Canvas is the hero. Multiple tasks — do not batch.

### Task 4.1: Shared node component recipe

Inspect the existing node files first so you preserve the props React Flow expects.

**Files:**
- Create: `frontend/src/components/pipeline/nodes/NodeShell.tsx`
- Modify: all of `SourceNode.tsx`, `FilterNode.tsx`, `TransformNode.tsx`, `JoinNode.tsx`, `AggregateNode.tsx`, `DestinationNode.tsx`

- [ ] **Step 1: Inspect the current files**

```bash
cat frontend/src/components/pipeline/nodes/SourceNode.tsx
cat frontend/src/components/pipeline/nodes/FilterNode.tsx
# …and the other four
```

Note the React Flow API used (`NodeProps`, `Handle`, `Position`) and the data prop shape for each kind. The NodeShell below must match whatever `{id, data, selected}` interface is already in use.

- [ ] **Step 2: Create `NodeShell.tsx`**

```tsx
import * as React from "react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";

type NodeKind =
  | "source"
  | "filter"
  | "transform"
  | "join"
  | "aggregate"
  | "destination";

const accentVar: Record<NodeKind, string> = {
  source: "var(--color-node-source)",
  filter: "var(--color-node-filter)",
  transform: "var(--color-node-transform)",
  join: "var(--color-node-join)",
  aggregate: "var(--color-node-aggregate)",
  destination: "var(--color-node-destination)",
};

export interface NodeShellProps {
  kind: NodeKind;
  /** Primary identifier — rendered in mono if `mono` */
  identifier: string;
  mono?: boolean;
  /** Optional summary line (e.g. "9 columns", "INNER JOIN") */
  summary?: string;
  selected?: boolean;
  hasError?: boolean;
  isRunning?: boolean;
  hasInput?: boolean;
  hasOutput?: boolean;
  /** Handle IDs for sources with >1 input (join takes left/right) */
  inputHandleIds?: string[];
}

export function NodeShell({
  kind,
  identifier,
  mono,
  summary,
  selected,
  hasError,
  isRunning,
  hasInput = true,
  hasOutput = true,
  inputHandleIds,
}: NodeShellProps) {
  return (
    <div
      className={cn(
        "relative flex min-w-[160px] max-w-[260px] rounded-md border bg-card text-foreground transition-all",
        selected
          ? "border-primary shadow-md"
          : hasError
          ? "border-[var(--color-status-error)] bg-[var(--color-status-error-faint)]"
          : "border-border hover:border-gray-400 hover:shadow-md",
      )}
    >
      {/* Left accent bar */}
      <span
        aria-hidden
        className={cn("w-1 rounded-l-md", isRunning && "animate-pulse")}
        style={{ background: accentVar[kind] }}
      />
      <div className="flex-1 px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          {kind}
        </div>
        <div
          className={cn(
            "mt-0.5 truncate text-[13px] font-semibold text-foreground",
            mono && "font-mono",
          )}
          title={identifier}
        >
          {identifier}
        </div>
        {summary && (
          <div className="mt-0.5 text-[11px] text-muted-foreground">{summary}</div>
        )}
      </div>

      {hasInput &&
        (inputHandleIds?.length ? (
          inputHandleIds.map((id, i) => (
            <Handle
              key={id}
              type="target"
              position={Position.Left}
              id={id}
              style={{ top: `${(100 / (inputHandleIds.length + 1)) * (i + 1)}%` }}
            />
          ))
        ) : (
          <Handle type="target" position={Position.Left} />
        ))}
      {hasOutput && <Handle type="source" position={Position.Right} />}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite each node file to use `NodeShell`**

For each of the six node files, replace its body with a thin wrapper that picks its identifier + summary from `data` and delegates to `NodeShell`.

Example — `SourceNode.tsx`:

```tsx
import { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";

export function SourceNode({ data, selected }: NodeProps) {
  const d = data as {
    schema?: string;
    table?: string;
    selectedColumns?: string[];
    columns?: string[];
  };
  const id = d.schema && d.table ? `${d.schema}.${d.table}` : "<no table>";
  const cols = d.selectedColumns?.length ?? d.columns?.length ?? 0;
  return (
    <NodeShell
      kind="source"
      identifier={id}
      mono
      summary={cols > 0 ? `${cols} column${cols === 1 ? "" : "s"}` : undefined}
      selected={selected}
      hasInput={false}
    />
  );
}
```

Apply the same pattern to the other five (match the summary rules from the spec):

- `FilterNode`: `identifier = data.label ?? "Filter"`, `summary = N conditions (AND|OR)` from `data.conditions` and `data.logicalOperator`
- `TransformNode`: `identifier = data.label ?? "Transform"`, `summary = N transformations` from `data.transformations`
- `JoinNode`: `identifier = data.label ?? "Join"`, `summary = ${data.joinType?.toUpperCase() ?? "INNER"} JOIN`; pass `inputHandleIds={["left", "right"]}`
- `AggregateNode`: `identifier = data.label ?? "Aggregate"`, `summary = N groups, M aggs` from `data.groupByColumns` and `data.aggregations`
- `DestinationNode`: `identifier = data.schema && data.table ? \`${data.schema}.${data.table}\` : "<no dest>"`, `mono`, `summary = data.writeMode`, `hasOutput={false}`

- [ ] **Step 4: Verify build**

```bash
cd frontend && pnpm run build
```

- [ ] **Step 5: Dev server visual check**

Open a pipeline with multiple node types. Expected:
- Every node is a white card with a colored left bar matching its type
- Node body shows UPPERCASE type label in gray, identifier in gray-900 (mono for table references)
- Summary line appears only when meaningful
- Selected node has emerald border

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/pipeline/nodes
git commit -m "feat(ui): unified node recipe — left accent bar + type label + identifier + summary

NodeShell renders the common card. All six nodes delegate through it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.2: Canvas chrome — background / minimap / controls

Most of this is already handled by the React Flow overrides in `globals.css` (Task 1.2). This task makes sure `PipelineCanvas.tsx` uses the built-in components correctly and removes any inline color overrides that would conflict.

**Files:**
- Modify: `frontend/src/components/pipeline/PipelineCanvas.tsx`

- [ ] **Step 1: Inspect current canvas**

```bash
grep -n "Background\|Controls\|MiniMap\|backgroundColor\|background=" frontend/src/components/pipeline/PipelineCanvas.tsx
```

- [ ] **Step 2: Ensure the React Flow wrapper uses defaults for Background/Controls/MiniMap**

If the current file passes `<Background variant="dots" gap={16} size={1} color="..."  />` or similar, simplify to `<Background />` — the CSS in `globals.css` takes over styling.

If `<Controls />` passes `style` props, remove inline styles. Keep `<MiniMap />` with `nodeColor={...}` only if it uses a function that returns a React Flow-known node type; otherwise remove the prop and rely on defaults.

Concretely — in the `<ReactFlow>` tree, the three companion components should render like:

```tsx
<Background gap={16} size={1} />
<MiniMap pannable zoomable />
<Controls showInteractive={false} />
```

- [ ] **Step 3: Verify build**

```bash
cd frontend && pnpm run build
```

- [ ] **Step 4: Dev server visual check**

Expected:
- Canvas has a subtle gray dot pattern on a near-white bg
- Controls at bottom-left in a bordered card with 32px buttons
- Minimap at bottom-right, semi-transparent white
- Edges are gray, turn emerald on hover/select

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/pipeline/PipelineCanvas.tsx
git commit -m "feat(ui): canvas — rely on global React Flow theming for bg/controls/minimap

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.3: PipelineToolbar — colored chip borders

**Files:**
- Modify: `frontend/src/components/pipeline/PipelineToolbar.tsx`

- [ ] **Step 1: Update the toolbar component**

Replace the contents of `frontend/src/components/pipeline/PipelineToolbar.tsx` with:

```tsx
import {
  Database,
  Filter,
  Wand2,
  Merge,
  BarChart3,
  HardDrive,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChipSpec {
  type: string;
  label: string;
  icon: LucideIcon;
  var: string;
}

const nodeToolbox: ChipSpec[] = [
  { type: "source", label: "Source", icon: Database, var: "--color-node-source" },
  { type: "filter", label: "Filter", icon: Filter, var: "--color-node-filter" },
  { type: "transform", label: "Transform", icon: Wand2, var: "--color-node-transform" },
  { type: "join", label: "Join", icon: Merge, var: "--color-node-join" },
  { type: "aggregate", label: "Aggregate", icon: BarChart3, var: "--color-node-aggregate" },
  { type: "destination", label: "Destination", icon: HardDrive, var: "--color-node-destination" },
];

export function PipelineToolbar() {
  return (
    <div className="flex h-11 items-center gap-2 border-b border-border bg-card px-3">
      <span className="text-[11px] font-medium text-muted-foreground">Drag to add:</span>
      {nodeToolbox.map(({ type, label, icon: Icon, var: cssVar }) => (
        <div
          key={type}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/data-builder-node-type", type);
            e.dataTransfer.effectAllowed = "copy";
          }}
          className={cn(
            "flex h-7 cursor-grab items-center gap-1.5 rounded-md border bg-card px-2 text-[12px] font-medium transition-all",
            "hover:shadow-sm active:cursor-grabbing",
          )}
          style={{
            borderColor: `color-mix(in srgb, var(${cssVar}) 35%, transparent)`,
            color: `var(${cssVar})`,
          }}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify build + visual**

```bash
cd frontend && pnpm run build && pnpm run dev
```

Open a pipeline editor. Expected: 6 chips at top with colored borders matching node types; chips are drag sources.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/pipeline/PipelineToolbar.tsx
git commit -m "feat(ui): pipeline toolbar chips — colored borders per node type

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.4: CatalogSidebar retheme

**Files:**
- Modify: `frontend/src/components/pipeline/CatalogSidebar.tsx`

- [ ] **Step 1: Read and update existing markup**

Open `frontend/src/components/pipeline/CatalogSidebar.tsx`. Apply these class changes wherever the relevant element is rendered:
- Root `<aside>`: `bg-muted` → `bg-[var(--color-muted)]`, border-right `border-border`, width kept (260px / `w-[260px]`)
- Connector section headers: 12px font-semibold text-foreground, padding px-3 py-2, bottom-border
- Table rows: class `font-mono text-xs text-foreground truncate` for the `schema.table`; column count as `<Badge count="muted">{n}</Badge>`
- Selected/hover row: `hover:bg-primary/10 rounded-sm`

The exact existing markup may differ; the goal is visual match to spec Section 5.7. Do not restructure the drag/drop behavior.

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm run build
```

- [ ] **Step 3: Visual check**

In editor, left sidebar shows connectors → schemas → tables with mono table names and count badges; drag behavior onto canvas still works.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/pipeline/CatalogSidebar.tsx
git commit -m "feat(ui): catalog sidebar — gray-50 bg, mono table names, count badges

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.5: NodeConfigPanel tokens only

This is pure retokening; no behavior change.

**Files:**
- Modify: `frontend/src/components/pipeline/NodeConfigPanel.tsx`

- [ ] **Step 1: Apply token replacements**

Read the file and change:
- Root wrapper: `bg-white border-l border-border w-80`
- Header: `flex items-center justify-between border-b border-border px-4 py-3`; node-type label becomes `<Badge kind={nodeType} />`
- All inputs/selects keep their existing shadcn wrappers — those are retokened already
- Multi-row editor add/remove buttons: use `<Button variant="ghost" size="sm">`

Keep the auto-apply behavior intact (field `onChange` → Zustand action). No explicit "Apply" button in MVP.

- [ ] **Step 2: Verify build + visual**

```bash
cd frontend && pnpm run build && pnpm run dev
```

Click any node; config panel opens on the right, title shows a colored `kind` badge matching the node type.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/pipeline/NodeConfigPanel.tsx
git commit -m "feat(ui): node config panel — tokens + kind Badge in header

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.6: PipelineEditorPage — topbar + validation banner

Editor uses full viewport width (already handled in Task 3.4 via `RouteContent`). This task only touches `PipelineEditorPage.tsx`.

**Files:**
- Modify: `frontend/src/pages/PipelineEditorPage.tsx`

- [ ] **Step 1: Rewrite editor topbar button group**

In `PipelineEditorPage.tsx`, find the topbar JSX (around lines 210–275). Replace the action cluster with:

```tsx
<div className="flex items-center gap-2">
  <Button
    size="sm"
    variant="ghost"
    onClick={handleValidate}
    disabled={!pipelineId || validateMutation.isPending}
  >
    {validateMutation.isPending ? (
      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
    ) : (
      <CheckCircle2 className="mr-1 h-3 w-3" />
    )}
    Validate
  </Button>

  <Button
    size="sm"
    variant="ghost"
    onClick={handleSave}
    disabled={!pipelineId || saveMutation.isPending}
  >
    {saveMutation.isPending ? (
      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
    ) : (
      <Save className="mr-1 h-3 w-3" />
    )}
    {isDirty ? "Save" : saveMutation.data ? `Saved` : "Save"}
  </Button>

  <Button
    size="sm"
    variant="ghost"
    onClick={() => setShowSchedule((s) => !s)}
    disabled={!pipelineId}
  >
    <Clock className="mr-1 h-3 w-3" />
    Schedule
    {pipelineData?.schedule_cron && (
      <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-status-success)]" />
    )}
  </Button>

  <div className="mx-1 h-4 w-px bg-border" />

  <Button
    size="sm"
    variant="default"
    onClick={handleRun}
    disabled={
      !pipelineId ||
      runMutation.isPending ||
      (validateMutation.data && !validateMutation.data.valid)
    }
    title={
      validateMutation.data && !validateMutation.data.valid
        ? "Fix validation errors before running"
        : undefined
    }
  >
    {runMutation.isPending ? (
      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
    ) : (
      <Play className="mr-1 h-3 w-3" />
    )}
    Run
  </Button>

  <Button
    size="sm"
    variant="ghost"
    onClick={() => setShowRuns((s) => !s)}
    disabled={!pipelineId}
  >
    <History className="mr-1 h-3 w-3" />
    Runs
    {runs && runs.length > 0 && (
      <span className="ml-1.5 inline-flex h-4 min-w-[18px] items-center justify-center rounded-full bg-muted px-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">
        {runs.length}
      </span>
    )}
  </Button>
</div>
```

- [ ] **Step 2: Validation banner with reserved space**

Wherever the existing validation-error alert renders (currently around line 277 of the file), wrap it in a reserved-height container so toggling doesn't cause layout jump:

```tsx
<div className="min-h-[40px]">
  {validateMutation.data && !validateMutation.data.valid && (
    <div
      role="alert"
      className="flex items-start gap-2 border-b border-[var(--color-status-error)]/30 bg-[var(--color-status-error-faint)] px-4 py-2 text-[12px] text-[var(--color-status-error)]"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <div className="flex-1">
        <div className="font-semibold">Validation errors</div>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {validateMutation.data.errors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={() => validateMutation.reset()}
        aria-label="Dismiss"
        className="rounded p-0.5 hover:bg-[var(--color-status-error)]/10"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )}
</div>
```

- [ ] **Step 3: Verify build**

```bash
cd frontend && pnpm run build
```

- [ ] **Step 4: Visual check**

Expected:
- Editor fills the full viewport width (set in Task 3.4)
- Button group reads: `Validate · Save · Schedule · | · Run · Runs [N]`
- Clicking Validate on a bad pipeline shows a red banner that has dismiss working; toggling it doesn't shift canvas content
- Run button is disabled with tooltip when validation errors are present

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/PipelineEditorPage.tsx
git commit -m "feat(ui): pipeline editor topbar + validation banner

- Button group: Validate · Save · Schedule · Run · Runs[N]
- Validation banner reserves vertical space even when empty

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.7: Run History panel — new item recipe

**Files:**
- Modify: `frontend/src/pages/PipelineEditorPage.tsx` (the `{showRuns && … }` block around line 359)

- [ ] **Step 1: Replace the run item markup**

Inside `{showRuns && (…)}`, replace each `runs.map` item with:

```tsx
{runs.map((run) => {
  const ts = run.created_at
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(run.created_at))
    : "";
  const durationMs =
    run.started_at && run.finished_at
      ? new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
      : null;
  return (
    <div key={run.id} className="rounded-md border border-border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <Badge status={run.status}>{run.status}</Badge>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {durationMs != null ? `${(durationMs / 1000).toFixed(1)}s` : "—"}
          {run.rows_processed != null && ` · ${run.rows_processed.toLocaleString()} rows`}
        </span>
      </div>
      {run.error_message && (
        <p className="mt-1 line-clamp-2 text-[11px] text-[var(--color-status-error)]">
          {run.error_message}
        </p>
      )}
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {ts} · via {run.triggered_by}
        </span>
        <div className="flex items-center gap-2">
          {(run.status === "failed" || run.status === "cancelled") && (
            <button
              type="button"
              onClick={() => handleRetry(run.id)}
              disabled={retryMutation.isPending}
              className="inline-flex items-center gap-0.5 text-[11px] text-[var(--color-status-info)] hover:underline disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" /> Retry
            </button>
          )}
          {(run.status === "pending" || run.status === "running") && (
            <button
              type="button"
              onClick={() => handleCancel(run.id)}
              disabled={cancelMutation.isPending}
              className="inline-flex items-center gap-0.5 text-[11px] text-[var(--color-status-error)] hover:underline disabled:opacity-50"
            >
              <Ban className="h-3 w-3" /> Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
})}
```

Remove the `RunStatusBadge` local component — it's replaced by the `Badge` primitive's `status` variant.

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm run build
```

- [ ] **Step 3: Visual check**

Run a pipeline; open Run History panel. Expected: each run shows status badge, mono duration+rows, timestamp, trigger; Retry on failed/cancelled, Cancel on pending/running.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/PipelineEditorPage.tsx
git commit -m "feat(ui): run history items — new recipe with Badge status variant

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5 · List Pages

Each list page follows the same pattern: `PageHeader` on top, `DataTable` below, empty state wired, primary action in header.

### Task 5.1: Dashboard — StatCards + recent pipelines DataTable

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx` (full rewrite below)

- [ ] **Step 1: Replace `DashboardPage.tsx`**

```tsx
import { Link } from "react-router-dom";
import { Plus, GitBranch, Plug, CheckCircle2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { usePipelines } from "@/api/pipelines";
import { useConnectors } from "@/api/connectors";
import { useCDCJobs } from "@/api/cdc";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export function DashboardPage() {
  useDocumentTitle("Dashboard — Data Builder");
  const { data: pipelines, isLoading: pLoading } = usePipelines();
  const { data: connectors, isLoading: cLoading } = useConnectors();
  const { data: cdcJobs } = useCDCJobs();

  const validCount = pipelines?.filter((p) => p.status === "valid" || p.status === "completed").length ?? 0;

  const recent = [...(pipelines ?? [])]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  const columns: DataTableColumn<(typeof recent)[0]>[] = [
    {
      key: "name",
      header: "Name",
      cell: (r) => (
        <Link to={`/pipelines/${r.id}`} className="font-medium text-foreground hover:underline">
          {r.name}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <Badge variant="outline">{r.status}</Badge>,
      width: "w-32",
    },
    {
      key: "updated_at",
      header: "Updated",
      cell: (r) =>
        r.updated_at ? (
          <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
            {new Date(r.updated_at).toLocaleDateString()}
          </span>
        ) : (
          "—"
        ),
      width: "w-32",
      sortable: true,
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of pipelines, connectors, and activity."
        actions={
          <Button asChild variant="default">
            <Link to="/pipelines/new">
              <Plus className="h-3.5 w-3.5" /> New Pipeline
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Connectors"
          value={cLoading ? "—" : connectors?.length ?? 0}
          hint="Database connections"
        />
        <StatCard
          label="Pipelines"
          value={pLoading ? "—" : pipelines?.length ?? 0}
          hint="Total defined"
        />
        <StatCard
          label="Valid Pipelines"
          value={pLoading ? "—" : validCount}
          hint="Passing validation"
        />
        <StatCard
          label="CDC Streams"
          value={cdcJobs?.length ?? 0}
          hint="Active jobs"
        />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recent Pipelines
        </h2>
        <DataTable
          columns={columns}
          rows={recent}
          getRowId={(r) => r.id}
          loading={pLoading}
          empty={
            <EmptyState
              icon={GitBranch}
              title="No pipelines yet"
              body="Create your first visual ETL pipeline to see it here."
              action={
                <Button asChild variant="default" size="sm">
                  <Link to="/pipelines/new">New Pipeline</Link>
                </Button>
              }
            />
          }
        />
      </section>

      <section className="mt-8 rounded-md border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Quick Start</h2>
        <ol className="space-y-3">
          {[
            { to: "/connectors", label: "Add a database connector", icon: Plug },
            { to: "/catalog", label: "Browse your table catalog", icon: CheckCircle2 },
            { to: "/pipelines/new", label: "Create a pipeline with drag & drop", icon: GitBranch },
            { to: "/cdc", label: "Set up CDC to stream changes to S3", icon: RefreshCw },
          ].map((step, i) => (
            <li key={step.to} className="flex items-center gap-3 border-l-2 border-primary pl-3">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 font-mono text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <Link to={step.to} className="text-sm text-foreground hover:underline">
                {step.label}
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
```

Make sure imports for `useCDCJobs`, `useDocumentTitle` match current exports — adjust names if the current codebase uses different ones. If any hook doesn't exist, substitute `const cdcJobs = []` as a fallback — it's a non-critical stat.

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm run build
```

- [ ] **Step 3: Visual check**

Expected: four StatCards, Recent Pipelines table, Quick Start numbered list with emerald step numbers.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat(ui): Dashboard — StatCard + DataTable + PageHeader

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5.2: Connectors list — DataTable

**Files:**
- Modify: `frontend/src/pages/ConnectorsPage.tsx`

- [ ] **Step 1: Inspect current state**

```bash
cat frontend/src/pages/ConnectorsPage.tsx
```

Note the existing API hooks, the dialog component used for Add/Edit, and the data shape returned by `useConnectors`.

- [ ] **Step 2: Rewrite to use PageHeader + DataTable + DropdownMenu**

Produce a new file that:
- Uses `<PageHeader title="Connectors" description="…" actions={<Button>Add Connector</Button>} />`
- Renders a `<DataTable>` whose columns are:
  - name — bold foreground
  - type — `<Badge variant="outline">` with the `connector_type`
  - status — colored dot using `<span class="h-2 w-2 rounded-full bg-[var(--color-status-success)]" />` mapped from `test_status`
  - last_tested_at — formatted mono date
  - actions — a `<DropdownMenu>` with Test / Edit / Delete
- Delete uses the existing `<Dialog>` component for confirmation

The exact code must reuse whatever `useConnectors`, `useCreateConnector`, `useUpdateConnector`, `useDeleteConnector`, `useTestConnector` hooks are already exported from `@/api/connectors`. If any mutation hook is missing, add it following the same pattern as existing ones (Axios call + `useMutation` + query invalidation).

Reference skeleton:

```tsx
import { useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useConnectors, useTestConnector, useDeleteConnector } from "@/api/connectors";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
// …dialog + form imports as currently used

export function ConnectorsPage() {
  useDocumentTitle("Connectors — Data Builder");
  const { data: connectors, isLoading, error } = useConnectors();
  const testMutation = useTestConnector();
  const deleteMutation = useDeleteConnector();
  const [editing, setEditing] = useState<Connector | null>(null);
  const [creating, setCreating] = useState(false);

  const columns: DataTableColumn<Connector>[] = [
    {
      key: "name",
      header: "Name",
      cell: (r) => <span className="font-medium text-foreground">{r.name}</span>,
      sortable: true,
    },
    {
      key: "connector_type",
      header: "Type",
      cell: (r) => <Badge variant="outline">{r.connector_type}</Badge>,
      width: "w-32",
    },
    {
      key: "test_status",
      header: "Status",
      cell: (r) => (
        <span className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
          <span
            className="h-2 w-2 rounded-full"
            style={{
              background:
                r.test_status === "success"
                  ? "var(--color-status-success)"
                  : r.test_status === "failed"
                  ? "var(--color-status-error)"
                  : "var(--color-text-muted)",
            }}
          />
          {r.test_status ?? "untested"}
        </span>
      ),
      width: "w-40",
    },
    {
      key: "last_tested_at",
      header: "Last tested",
      cell: (r) =>
        r.last_tested_at ? (
          <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
            {new Date(r.last_tested_at).toLocaleString()}
          </span>
        ) : (
          "—"
        ),
      width: "w-48",
    },
    {
      key: "actions",
      header: "",
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => testMutation.mutate(r.id)}>
              Test connection
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setEditing(r)}>Edit</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                if (confirm(`Delete connector "${r.name}"?`)) deleteMutation.mutate(r.id);
              }}
              className="text-[var(--color-status-error)]"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      width: "w-16",
      align: "right",
    },
  ];

  return (
    <>
      <PageHeader
        title="Connectors"
        description="Manage your database connections. Add connectors to browse catalogs and build pipelines."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Connector
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={connectors}
        getRowId={(r) => r.id}
        loading={isLoading}
        error={error ? String(error) : null}
      />
      {/* Keep existing Add/Edit dialogs — wire state via creating/editing */}
    </>
  );
}
```

Preserve the existing Add/Edit `<Dialog>` integration — only the list/action chrome changes.

- [ ] **Step 3: Verify build**

```bash
cd frontend && pnpm run build
```

- [ ] **Step 4: Visual + interactive check**

Expected: table with the 5 columns; status dot is green for `success`; row action menu (⋮) has Test / Edit / Delete; existing add-connector dialog still opens from primary header button.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ConnectorsPage.tsx frontend/src/api/connectors.ts
git commit -m "feat(ui): Connectors — DataTable + actions menu + status dot

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5.3: Pipelines list

**Files:**
- Modify: `frontend/src/pages/PipelineListPage.tsx`

- [ ] **Step 1: Rewrite to PageHeader + filter bar + DataTable**

Apply the same pattern as Task 5.2. Columns:
- **Name** — linked to `/pipelines/:id`, primary text color
- **Status** — `<Badge variant="outline">{r.status}</Badge>`
- **Nodes** — `r.definition?.nodes?.length ?? 0`, mono tabular right-aligned
- **Updated** — `new Date(r.updated_at).toLocaleDateString()` in mono
- **Actions** — DropdownMenu: Open · Delete

**Run count is intentionally omitted from MVP columns** — the current API returns pipelines without aggregated run counts, and fetching `/runs` for every pipeline on list load is wasteful. Adding `run_count` is a separate follow-up that needs a backend aggregation endpoint; track it as UI-6 alongside the other follow-ups in spec §13.

Filter bar between header and table: search `<Input>` (filters by name substring, case-insensitive) + status `<Select>` with options `all / draft / valid / invalid / running / completed / failed`. Filtering is client-side over the already-fetched `pipelines` array.

- [ ] **Step 2: Verify build + smoke**

```bash
cd frontend && pnpm run build && pnpm run dev
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/PipelineListPage.tsx
git commit -m "feat(ui): Pipelines list — DataTable + filter bar

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5.4: CDC jobs list

**Files:**
- Modify: `frontend/src/pages/CDCPage.tsx`

Follow the same pattern. Columns: name, connector name (looked up via `connectors` cache by `connector_id`), source (mono `schema.table`), status Badge, last sync mono date, rows synced mono number, actions (Sync now, Snapshot, View logs, Edit, Delete).

- [ ] **Step 1: Rewrite**

Apply the pattern from Task 5.2 to `CDCPage.tsx`. Reuse existing `useCDCJobs`, `useTriggerSync`, `useTriggerSnapshot`, `useDeleteCDCJob` (or the actual names exposed in `@/api/cdc`).

- [ ] **Step 2: Verify build + smoke**

```bash
cd frontend && pnpm run build && pnpm run dev
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/CDCPage.tsx
git commit -m "feat(ui): CDC list — DataTable + actions menu

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 6 · Detail / Specialty Pages

### Task 6.1: Catalog — Tabs + DataTable

**Files:**
- Modify: `frontend/src/pages/CatalogPage.tsx`

- [ ] **Step 1: Rewrite right panel as Tabs**

Keep the two-column layout. The right panel, when a table is selected, becomes:

```tsx
<Tabs defaultValue="schema">
  <TabsList>
    <TabsTrigger value="schema">Schema</TabsTrigger>
    <TabsTrigger value="preview">Preview</TabsTrigger>
  </TabsList>
  <TabsContent value="schema">
    <DataTable columns={columnColumns} rows={columns} getRowId={(c) => c.name} loading={columnsLoading} />
  </TabsContent>
  <TabsContent value="preview">
    <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
      <span className="text-[11px] text-muted-foreground">
        Showing {preview?.rows.length ?? 0} rows
      </span>
      <Button variant="ghost" size="sm" onClick={() => refetchPreview()}>
        <RefreshCw className="h-3 w-3" /> Refresh
      </Button>
    </div>
    {/* Use DataTable or a simple table for the preview */}
  </TabsContent>
</Tabs>
```

Where `columnColumns` is a column spec showing name (mono), data_type (mono, muted), PK badge, nullable yes/no.

Left-column tree keeps its current logic; restyle selected item to `bg-primary/10` and selected schema/table to mono.

- [ ] **Step 2: Verify build + smoke**

```bash
cd frontend && pnpm run build && pnpm run dev
```

Expected: clicking a table loads Schema tab by default; switching to Preview refetches and shows row sample.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/CatalogPage.tsx
git commit -m "feat(ui): Catalog — Tabs (Schema / Preview) + DataTable for columns

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6.2: Monitoring — StatCards + chart retheme

**Files:**
- Modify: `frontend/src/pages/MonitoringPage.tsx`

- [ ] **Step 1: Swap the four top tiles to StatCard**

Replace the top-of-page tiles with:

```tsx
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-8">
  <StatCard label="Total Runs" value={stats?.total_runs ?? 0} hint="Last 30 days" />
  <StatCard
    label="Success Rate"
    value={`${Math.round((stats?.success_rate ?? 0) * 100)}%`}
    hint={`${stats?.completed ?? 0} completed, ${stats?.failed ?? 0} failed`}
  />
  <StatCard
    label="Avg Duration"
    value={stats?.avg_duration_seconds ? `${stats.avg_duration_seconds.toFixed(1)}s` : "N/A"}
    hint="Per pipeline run"
  />
  <StatCard
    label="CDC Rows Synced"
    value={stats?.cdc_rows_total ?? 0}
    hint={`${stats?.cdc_jobs_total ?? 0} jobs`}
  />
</div>
```

Field names must match whatever the `/api/monitoring/stats` endpoint returns in this codebase.

- [ ] **Step 2: Retheme the Run Activity chart**

If the chart uses an existing library (recharts, chartjs, inline svg), update color props:
- Completed bars: `var(--color-status-success)` (#059669)
- Failed bars: `var(--color-status-error)` (#dc2626)
- Axis/grid lines: `#e5e7eb`
- Labels: `#6b7280`

Leave the data wiring untouched.

- [ ] **Step 3: Retheme the rest**

Status Breakdown counts, CDC Jobs summary, Log Export form, Webhook block — wrap each section in a `<Card>` with 20px padding, use `<Input>` and `<Select>` primitives for forms, `<Button>` for actions. Keep all existing logic.

- [ ] **Step 4: Verify build + smoke**

```bash
cd frontend && pnpm run build && pnpm run dev
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/MonitoringPage.tsx
git commit -m "feat(ui): Monitoring — StatCard adoption + emerald chart palette

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6.3: CDC detail drawer

**Files:**
- Create: `frontend/src/components/cdc/CDCDetailDrawer.tsx`
- Modify: `frontend/src/pages/CDCPage.tsx` (wire the drawer in)

- [ ] **Step 1: Create the drawer component**

```tsx
import { X, RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { useCDCSyncLogs, useTriggerSync, useTriggerSnapshot } from "@/api/cdc";
import type { CDCJob, CDCSyncLog } from "@/types/cdc";

export function CDCDetailDrawer({
  job,
  onClose,
}: {
  job: CDCJob | null;
  onClose: () => void;
}) {
  const { data: logs, isLoading } = useCDCSyncLogs(job?.id);
  const sync = useTriggerSync();
  const snap = useTriggerSnapshot();

  if (!job) return null;

  const columns: DataTableColumn<CDCSyncLog>[] = [
    {
      key: "created_at",
      header: "Started",
      cell: (l) => (
        <span className="font-mono text-[12px] tabular-nums">
          {new Date(l.created_at).toLocaleString()}
        </span>
      ),
      width: "w-48",
    },
    {
      key: "status",
      header: "Status",
      cell: (l) => <Badge variant="outline">{l.status}</Badge>,
      width: "w-28",
    },
    {
      key: "rows_captured",
      header: "Rows",
      cell: (l) => (
        <span className="font-mono tabular-nums">{l.rows_captured ?? 0}</span>
      ),
      width: "w-24",
      align: "right",
    },
    {
      key: "error_message",
      header: "Error",
      cell: (l) =>
        l.error_message ? (
          <span className="truncate text-[12px] text-[var(--color-status-error)]">
            {l.error_message}
          </span>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <aside
      role="dialog"
      aria-label={`${job.name} details`}
      className="fixed right-0 top-0 z-40 flex h-full w-[520px] flex-col border-l border-border bg-background shadow-lg"
    >
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">{job.name}</h2>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {job.source_schema}.{job.source_table}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex gap-2 border-b border-border px-5 py-3">
        <Button size="sm" onClick={() => sync.mutate(job.id)} disabled={sync.isPending}>
          <RefreshCw className="h-3 w-3" /> Sync now
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => snap.mutate(job.id)}
          disabled={snap.isPending}
        >
          <Zap className="h-3 w-3" /> Snapshot
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-5">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sync logs
        </h3>
        <DataTable
          columns={columns}
          rows={logs}
          getRowId={(l) => l.id}
          loading={isLoading}
          empty={<EmptyState title="No syncs yet" body="Trigger a sync to see logs here." />}
        />
      </div>
    </aside>
  );
}
```

Substitute hook names and type imports to match whatever the project exposes.

- [ ] **Step 2: Wire the drawer into `CDCPage.tsx`**

Add state in the CDC page component:

```tsx
const [selectedJob, setSelectedJob] = useState<CDCJob | null>(null);
```

Pass `onRowClick={setSelectedJob}` to the `DataTable`. Render `<CDCDetailDrawer job={selectedJob} onClose={() => setSelectedJob(null)} />` at the bottom.

- [ ] **Step 3: Verify build + smoke**

```bash
cd frontend && pnpm run build && pnpm run dev
```

Click a row → drawer slides in with sync logs. Sync now / Snapshot buttons work. Close dismisses.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/cdc/CDCDetailDrawer.tsx frontend/src/pages/CDCPage.tsx
git commit -m "feat(ui): CDC detail drawer — sync logs, inline Sync now / Snapshot

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 7 · Sweep

### Task 7.1: Empty / loading / error state sweep + legacy markup grep

**Files:** every page file

- [ ] **Step 1: Grep for legacy patterns that should be gone**

```bash
cd /Users/anchitgupta/data-builder/frontend/src
grep -RIn --include="*.tsx" --include="*.ts" "className=\".*border.*rounded\".*<" .
grep -RIn --include="*.tsx" 'Status: <' .
grep -RIn --include="*.tsx" 'className="flex.*gap.*">\s*<h[12]' .
grep -RIn --include="*.tsx" 'text-muted-foreground">\s*Last tested:' .
```

Expected: zero matches (or only matches inside components we already migrated).

- [ ] **Step 2: Visit each page in dev and exercise the empty + loading states**

```bash
cd frontend && pnpm run dev
```

For each of: Dashboard, Connectors, Catalog, Pipelines, CDC, Monitoring:
- Disconnect backend → reload page → expect DataTable shows the error state
- Start backend with empty DB → expect every list page shows `EmptyState` primitive (not a custom "No X yet" div)
- Reload → expect skeleton rows briefly visible

If any page shows a custom empty/loading/error view, swap it out for the primitive.

- [ ] **Step 3: Keyboard a11y spot-check**

For each page:
- Tab through and confirm every interactive is reachable
- Confirm `Enter` on the primary action button triggers it
- Focus ring (2px emerald) visible on every tab stop

- [ ] **Step 4: Commit any sweep fixes**

```bash
git add -p
git commit -m "chore(ui): sweep — unify empty/loading/error states across all pages

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 8 · Final Verification

### Task 8.1: Full-app smoke

- [ ] **Step 1: Build gate**

```bash
cd /Users/anchitgupta/data-builder/frontend && pnpm run build
```

Expected: exits 0, no warnings about missing CSS vars / unused imports that weren't there before.

- [ ] **Step 2: Backend gate**

```bash
cd /Users/anchitgupta/data-builder/backend && source .venv/bin/activate && pytest -q
```

Expected: all backend tests still pass (frontend revamp should touch nothing backend).

- [ ] **Step 3: Dev server smoke**

```bash
cd /Users/anchitgupta/data-builder/frontend && pnpm run dev
```

With backend running, walk through every route in a browser with DevTools open. For each page confirm:
- Zero console errors
- All network requests return 2xx
- New primitives render (emerald primary, dark sidebar, dot-grid canvas, DataTable headers)

Trigger a happy-path pipeline run:
- Create a pipeline → add source + destination nodes → Validate → Run → see "completed" in run history

- [ ] **Step 4: Capture screenshots for the PR**

One screenshot per page: Dashboard, Connectors, Catalog (with a table selected, Schema tab), Pipelines list, Pipeline editor (with at least 2 nodes), CDC (with detail drawer open), Monitoring. Attach to the final PR.

- [ ] **Step 5: Final commit & PR**

If any polish fixes came out of the smoke, commit them:

```bash
git add -A
git commit -m "chore(ui): final smoke polish" || true
```

Open the PR referencing the spec:

```bash
gh pr create --title "UI/UX revamp: Workbench + Emerald + Balanced" --body "$(cat <<'EOF'
## Summary
- Full visual refresh per docs/superpowers/specs/2026-04-18-ui-ux-revamp-design.md
- New design tokens (Workbench aesthetic + Emerald primary)
- New primitives: Badge variants, StatCard, EmptyState, DataTable, PageHeader, Kbd, Skeleton
- Pipeline canvas rewritten to new node recipe + dot-grid background
- All 7 pages adopt PageHeader + new list/detail patterns

## Test plan
- [x] pnpm run build green
- [x] pytest green
- [x] Chrome DevTools smoke on all 7 pages (zero console errors, all XHRs 2xx)
- [x] Happy-path pipeline run (create → validate → run → completed)
- [x] Keyboard a11y tab-through of every page
- [x] Screenshots attached

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Definition of Done (copied from spec §12)

- [ ] All 7 pages render with new tokens and primitives
- [ ] `pnpm run build` green
- [ ] `pytest` green
- [ ] Chrome DevTools smoke: zero console errors, editor Run flow succeeds
- [ ] No inline status-dot / button / card markup remains (grep proves it)
- [ ] Screenshots of each page attached to the final PR
