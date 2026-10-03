---
name: shadcn-dashboard-style
description: >-
  Apply the ShadcnSpace / MaterialM dashboard design language (soft-tinted icon
  chips, ring-bordered cards with consistent card spacing, pill-shaped trend
  chips, stat typography, grouped uppercase sidebar labels, page headers with
  actions) when building, polishing, auditing, or reviewing dashboards, admin
  panels, stat cards, list rows, page headers, or sidebar navigation in
  shadcn/ui + Tailwind projects. Use whenever the user asks to improve UI/UX of
  a shadcn app, make it look like a professional admin template, add dashboard
  widgets, or unify component styling — even if they don't name the template.
---

# ShadcnSpace Dashboard Style

Design language extracted from dashboard.shadcnspace.com and the
`shadcn-nextjs-admincn` template (WrapPixel / ShadcnStudio), adapted to
standard shadcn/ui + Tailwind CSS v4. Pair it with the `apple-design` skill
when motion, feedback, and hierarchy decisions matter — this skill covers the
static visual system, apple-design covers how it should feel.

The unifying idea: **soft tinted surfaces instead of strong borders and
colors**. Every colored element sits on a low-opacity tint of its own hue
(`bg-primary/10`, `bg-success/10`), icons are small and muted, hierarchy comes
from weight and size, and chrome (cards, rows, chips) stays quiet so data
reads first.

## Core recipes

Use these class recipes verbatim; adjust sizes proportionally. Assume `cn()`
from shadcn and semantic tokens (see "Tokens" below).

### 1. Icon chip — the signature element

A small tinted square behind every icon that represents a thing, not an
action (stat cards, list rows, empty states, feature rows):

```tsx
<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
  <Icon aria-hidden className="size-4.5" />
</div>
```

- Semantic color variants: `bg-success/10 text-success`, `bg-destructive/10
  text-destructive`, `bg-warning/10 text-warning`, `bg-muted text-muted-foreground`.
- Icon inside is always `aria-hidden`; meaning must come from adjacent text.
- Never pair the tinted chip with an emoji or a colored border.

### 2. Cards — ring, not border; spacing from a CSS variable

```tsx
// Card shell (Tailwind v4)
"group/card bg-card text-card-foreground ring-foreground/10 flex flex-col gap-6 overflow-hidden rounded-xl py-6 text-sm shadow-xs ring-1"
// Header padding via px-6, content px-6 — or define:
[--card-spacing:--spacing(6)]  // then px-(--card-spacing) everywhere
```

If the project's `ui/card.tsx` already renders `rounded-xl border shadow-sm`,
prefer upgrading it once (border → `ring-1 ring-foreground/10`, keep
`shadow-xs`) over sprinkling overrides per page. One card look across the app.

Card header pattern: title + description on the left, action top-right
(`CardAction` slot or a `justify-between` flex). Titles are `text-base
font-medium`, never `text-lg font-bold` inside cards.

### 3. Stat cards and trend chips

Big number, small muted label, optional change chip:

```tsx
<Card>
  <CardHeader className="flex items-center gap-2">
    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Icon aria-hidden className="size-4" />
    </div>
    <span className="text-2xl font-semibold tabular-nums">{value}</span>
  </CardHeader>
  <CardContent className="flex flex-col gap-1">
    <span className="text-sm font-medium">{title}</span>
    <span className="flex items-center gap-2 text-sm">
      <span className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        up ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
      )}>
        {up ? <TrendingUp aria-hidden className="size-3" /> : <TrendingDown aria-hidden className="size-3" />}
        {delta}
      </span>
      <span className="text-muted-foreground">{comparison}</span>
    </span>
  </CardContent>
</Card>
```

- Stat values: `text-2xl font-semibold tabular-nums` — tabular figures keep
  changing numbers visually stable. Never color the whole value; the chip
  carries the signal.
- The trend chip is **never color-only**: it pairs an arrow icon with the
  signed number (`+18%` / `-5%`) so it survives color blindness and dark mode.

### 4. Page header — every page answers "where am I, what can I do"

```tsx
<div className="flex flex-wrap items-start justify-between gap-3">
  <div className="space-y-1">
    <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
    <p className="text-sm text-muted-foreground">{description}</p>
  </div>
  <div className="flex items-center gap-2">{/* primary action(s) */}</div>
</div>
```

- Exactly one `h1` per page; section headings inside the page are cards with
  `text-base` titles.
- Wrap this in a shared `PageHeader` component once and reuse — do not
  re-type it per page.
- Primary action right-aligned, `default` variant; secondary actions
  `outline`. Destructive standalone actions use an outline-destructive
  treatment (see Tokens), solid `destructive` only inside confirmations.

### 5. List rows — one row shape everywhere

Replace hand-rolled rows with one shared row component:

```tsx
<li className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
  {/* left: min-w-0 truncate title + text-xs text-muted-foreground meta */}
  {/* right: shrink-0 meta (time, badges, menu) */}
</li>
```

- Padding is always `px-3 py-2.5` (not `px-3 py-2`, not `p-3`) — one value.
- Rows that navigate: add `hover:bg-accent` and make the whole row the link.
- Time values: `font-mono text-xs text-muted-foreground`.
- Empty state inside a card: center it, add a muted icon chip (48px,
  `bg-muted text-muted-foreground`), one sentence, one action. No dashed
  borders inside populated cards; dashed border is reserved for the
  "nothing at all yet" page-level state.

### 6. Sidebar — grouped, labeled, quiet

- Group labels: `uppercase tracking-wider text-sidebar-foreground/50` (via
  `SidebarGroupLabel`), short group names.
- Active item is a soft tint (`bg-primary/10 text-accent-foreground
  font-medium` via the shadcn `isActive` prop) — not a saturated fill.
- One icon per item, `size-4`; tooltip on the item so collapsed-icon mode
  stays usable.
- Footer: appearance toggle + user menu. Never duplicate those in the header.

### 7. Header bar — breadcrumbs over blankness

`SidebarTrigger` alone makes deep pages feel lost. Add a breadcrumb trail:
`SidebarTrigger` + `Separator` + trail of links, last crumb
`text-foreground` (current), earlier crumbs `text-muted-foreground
hover:text-foreground`. Keep the header `h-16 border-b bg-background sticky
top-0`. Dynamic entities (e.g. a person's name) label the last crumb when
available, otherwise use the entity type from translations.

## Tokens

Add semantic tokens once in the Tailwind v4 `@theme`/`:root` and use them
everywhere — never raw `bg-green-500`/`text-emerald-600`:

```css
:root {
  --success: oklch(0.596 0.145 163.225);  /* emerald-600 */
  --warning: oklch(0.666 0.179 58.318);   /* amber-600 */
}
.dark {
  --success: oklch(0.696 0.17 162.48);    /* emerald-400 */
  --warning: oklch(0.795 0.184 86.047);   /* amber-400 */
}
@theme inline {
  --color-success: var(--success);
  --color-warning: var(--warning);
}
```

Typography: set an explicit `--font-sans` (system-ui stack is correct —
platform fonts ship optical tuning) and `antialiased` on body. Stat/financial
numbers get `tabular-nums`. Hierarchy = weight + size + spacing, not color.

Destructive outline button (for standalone non-confirm destructive actions):

```ts
"outline-destructive":
  "border border-destructive/40 bg-background shadow-xs text-destructive hover:bg-destructive/10 hover:text-destructive dark:bg-input/30"
```

## Application workflow (this repo and similar)

1. **Audit first**: sweep pages for one-off paddings, hardcoded colors,
   missing page headers, color-only status, hardcoded strings. List findings
   before editing.
2. **Tokens and primitives before pages**: semantic color tokens →
   button/card adjustments → shared components (`PageHeader`, stat/list rows)
   → then per-page adoption. Never restyle pages one-off.
3. **i18n is part of UI work**: every new string goes through `t()` with
   complete `pl` + `en` keys; status/labels never color-only (icon + text).
4. **A11y gates**: decorative icons `aria-hidden`; loaders
   `role="status"`/`aria-busy`; errors `role="alert"`; semantic `ul`/`h1`.
   Biome a11y rules must pass.
5. **Verify**: lint + unit tests + build, then look at rendered pages in
   light AND dark mode before declaring done.

## Anti-patterns

- Raw `bg-green-500`, `bg-zinc-600`, `text-emerald-600` outside token files.
- Emoji as UI icons; gradient text logos next to serious data UI (use a plain
  wordmark or token-colored logo).
- Stat numbers colored red/green instead of a tinted chip.
- Three different list-row paddings in one app.
- Empty header bar with only a sidebar toggle; back-button-only wayfinding.
- Hand-rec colored outline buttons (`className="text-destructive"`) instead
  of a proper variant.
