# Design Tokens

All visual values used in Heimdallone. Source of truth: `designs/styles/heimdall.css`.

> Port these into Tailwind v4's CSS-first config (or shadcn/ui's `globals.css`) **before** building any component. Every color, radius, and shadow in the designs comes from this table.

---

## Colors

### Dark mode (default)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#08090c` | Page background |
| `--bg-1` | `#0c0e13` | Cards, sidebar |
| `--bg-2` | `#11141b` | Subtle surface (hover row, input bg) |
| `--bg-3` | `#161a22` | Strong surface (badge, swatch) |
| `--bg-4` | `#1c212a` | Highest surface (segmented active) |
| `--line` | `#1f242e` | Default border |
| `--line-2` | `#2a3140` | Hover border, strong border |
| `--line-strong` | `#3a4253` | Emphasized border |
| `--fg` | `#e8ecf2` | Primary text |
| `--fg-2` | `#aab2c0` | Secondary text |
| `--fg-3` | `#6e7686` | Tertiary text / meta |
| `--fg-4` | `#4a5160` | Dimmest text / placeholders |

### Light mode

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#fbfaf6` | Warm off-white page bg (paired with gold accent) |
| `--bg-1` | `#ffffff` | Cards |
| `--bg-2` | `#ffffff` | (Same as bg-1 in light) |
| `--bg-3` | `#f6f4ee` | Subtle surface |
| `--bg-4` | `#eeebe2` | Strong surface |
| `--line` | `#e8e4d8` | Default border |
| `--line-2` | `#d8d2c1` | Hover border |
| `--line-strong` | `#b8b09a` | Emphasized border |
| `--fg` | `#14161c` | Primary text |
| `--fg-2` | `#4a5160` | Secondary text |
| `--fg-3` | `#6e7686` | Tertiary text |
| `--fg-4` | `#9aa0ad` | Dim text |

### Accent (gold) — both modes

| Token | Dark | Light | Use |
|---|---|---|---|
| `--accent` | `#e8b14c` | `#a87411` | Primary accent (buttons, links, highlights) |
| `--accent-2` | `#f0c069` | `#8c5f0d` | Hover state of accent |
| `--accent-ink` | `#1a1308` | `#fbfaf6` | Text on accent backgrounds |
| `--accent-soft` | `rgba(232,177,76,0.10)` | `rgba(168,116,17,0.10)` | Tinted background for accent surfaces |
| `--accent-ring` | `rgba(232,177,76,0.30)` | `rgba(168,116,17,0.25)` | Focus ring |

### Semantic colors

| Token | Dark | Light | Use |
|---|---|---|---|
| `--success` | `#4ade80` | `#16a34a` | Approved, sealed, operational |
| `--success-soft` | `rgba(74,222,128,0.12)` | `rgba(22,163,74,0.10)` | Tinted bg |
| `--warning` | `#f59e0b` | `#b45309` | Advisory, late, needs action |
| `--warning-soft` | `rgba(245,158,11,0.14)` | `rgba(180,83,9,0.10)` | Tinted bg |
| `--danger` | `#ef4444` | `#b91c1c` | Blocking, error, missing |
| `--danger-soft` | `rgba(239,68,68,0.12)` | `rgba(185,28,28,0.10)` | Tinted bg |
| `--info` | `#60a5fa` | `#2563eb` | NIS, system info, neutral signal |
| `--info-soft` | `rgba(96,165,250,0.12)` | `rgba(37,99,235,0.10)` | Tinted bg |

### Shadows

| Token | Dark | Light |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.35)` | `0 1px 2px rgba(20,22,28,0.06)` |
| `--shadow-md` | `0 8px 24px -8px rgba(0,0,0,0.55)` | `0 8px 24px -8px rgba(20,22,28,0.12)` |
| `--shadow-lg` | `0 24px 60px -20px rgba(0,0,0,0.75)` | `0 24px 60px -20px rgba(20,22,28,0.18)` |

---

## Typography

### Font families

- **Sans** — `"Inter", system-ui, -apple-system, "Segoe UI", sans-serif`
  - Features: `cv11, ss01, ss03`
- **Mono** — `"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace`
  - Features: `zero, ss01`
  - Used for: **every number** (payroll, dates, IDs, hashes, codes, counts, percentages, balances)
- **"Italic accent"** — `"Inter", serif` italic 500
  - Used sparingly on hero accent words (e.g. _command center_, _scales_, _Heimdallone_)

### Type scale (px)

| Class | Size | Line height | Letter spacing | Weight | Use |
|---|---|---|---|---|---|
| `h1` | 56 | 1.02 | −0.04em | 600 | Page titles (small heroes) |
| `hero h1` | clamp(48, 7vw, 88) | 0.98 | −0.045em | 600 | Marketing hero |
| `h2` | 36 | 1.08 | −0.032em | 600 | Section heads |
| `h2 (clamp)` | clamp(36, 5vw, 56) | 1.02 | −0.035em | 600 | Marketing section heads |
| `h3` | 22 | 1.2 | −0.02em | 600 | Card titles |
| `h4` | 16 | 1.3 | −0.015em | 600 | Subsection labels |
| body | 14 | 1.5 | −0.005em | 400 | Default |
| `.tiny` | 11 | – | 0.04em | 500 | Uppercase eyebrows in cards |
| `.eyebrow` | 11.5 | – | 0.12em | 500 | Section eyebrows (gold) |
| label / small | 11–12 | 1.45 | – | 500 | Form labels, metadata |
| stat value | 28 | 1 | −0.025em | 600 (mono) | KPI numbers |
| hero counter | 30+ | 1 | −0.025em | 600 (mono) | Animated count-up stats |

### Tabular numerics

**Every** numeric display must use `font-variant-numeric: tabular-nums` to keep columns aligned. The `.num`, `.mono`, `.tabular` and `.kv-v` classes do this.

---

## Spacing

The designs use Tailwind-compatible spacing. No custom values — stick to `4, 8, 12, 14, 16, 18, 20, 22, 24, 28, 32, 40, 48, 56, 64, 80, 96, 120` (px). The `gap` utility classes in `heimdall.css` cover 4–40 explicitly.

Common page paddings:
- App page wrapper: `28px 32px 48px` (top right/left bottom)
- Card body: `20px` (default) / `14px 16px` (compact) / `28px` (large hero card)
- Sidebar item: `7px 10px`
- Topbar height: `56px`
- Sidebar width: `248px`

---

## Border radii

| Token / class | px | Use |
|---|---|---|
| `border-radius: 5px` | 5 | KBD, tiny pills |
| `border-radius: 8px` | 8 | Inputs in compact contexts, sm pills |
| `border-radius: 9–10px` | 9–10 | Buttons, icon buttons, menu items |
| `border-radius: 11–12px` | 11–12 | Tooltips, alert blocks |
| `border-radius: 14px` | 14 | Cards (small), tabs container |
| `border-radius: 16px` | 16 | **Cards / widgets / KPIs / surfaces (DEFAULT)** |
| `border-radius: 18px` | 18 | Big cards (bento, briefing hero) |
| `border-radius: 28px` | 28 | CTA mega-card |
| `border-radius: 99px` (pill) | – | Badges, chips, segmented, theme toggle, search |
| `border-radius: 50%` | – | Avatars, dots |

Default is **16px for cards**. Default is **10px for buttons**. Use **99px (pill)** for badges, chips, and all segmented controls.

---

## Tailwind v4 config (drop-in)

Add this to your `app.css` (or whatever Tailwind v4's CSS entry is). It exposes every token both as a CSS variable AND as a Tailwind utility.

```css
@import "tailwindcss";

@theme {
  /* Color tokens — these become `bg-bg`, `text-fg`, `border-line`, etc. */
  --color-bg:           #08090c;
  --color-bg-1:         #0c0e13;
  --color-bg-2:         #11141b;
  --color-bg-3:         #161a22;
  --color-bg-4:         #1c212a;
  --color-line:         #1f242e;
  --color-line-2:       #2a3140;
  --color-line-strong:  #3a4253;
  --color-fg:           #e8ecf2;
  --color-fg-2:         #aab2c0;
  --color-fg-3:         #6e7686;
  --color-fg-4:         #4a5160;

  --color-accent:       #e8b14c;
  --color-accent-2:     #f0c069;
  --color-accent-ink:   #1a1308;
  --color-accent-soft:  rgba(232, 177, 76, 0.10);
  --color-accent-ring:  rgba(232, 177, 76, 0.30);

  --color-success:      #4ade80;
  --color-success-soft: rgba(74, 222, 128, 0.12);
  --color-warning:      #f59e0b;
  --color-warning-soft: rgba(245, 158, 11, 0.14);
  --color-danger:       #ef4444;
  --color-danger-soft:  rgba(239, 68, 68, 0.12);
  --color-info:         #60a5fa;
  --color-info-soft:    rgba(96, 165, 250, 0.12);

  /* Radii */
  --radius-sm:  8px;
  --radius:     10px;   /* buttons */
  --radius-md:  14px;
  --radius-lg:  16px;   /* cards (DEFAULT) */
  --radius-xl:  18px;   /* big cards */
  --radius-2xl: 28px;   /* CTA */

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.35);
  --shadow-md: 0 8px 24px -8px rgba(0, 0, 0, 0.55);
  --shadow-lg: 0 24px 60px -20px rgba(0, 0, 0, 0.75);

  /* Fonts */
  --font-sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
}

/* Light-mode overrides — same token names, switched at the document root */
[data-theme="light"] {
  --color-bg:           #fbfaf6;
  --color-bg-1:         #ffffff;
  --color-bg-2:         #ffffff;
  --color-bg-3:         #f6f4ee;
  --color-bg-4:         #eeebe2;
  --color-line:         #e8e4d8;
  --color-line-2:       #d8d2c1;
  --color-line-strong:  #b8b09a;
  --color-fg:           #14161c;
  --color-fg-2:         #4a5160;
  --color-fg-3:         #6e7686;
  --color-fg-4:         #9aa0ad;

  --color-accent:       #a87411;
  --color-accent-2:     #8c5f0d;
  --color-accent-ink:   #fbfaf6;
  --color-accent-soft:  rgba(168, 116, 17, 0.10);
  --color-accent-ring:  rgba(168, 116, 17, 0.25);

  --color-success:      #16a34a;
  --color-warning:      #b45309;
  --color-danger:       #b91c1c;
  --color-info:         #2563eb;
}
```

After this is in place, every token is reachable as a Tailwind utility:
- `bg-bg-1`, `text-fg`, `border-line`, `text-accent`, `bg-accent-soft`
- `rounded`, `rounded-lg` (card default), `rounded-xl` (big card), `rounded-2xl` (CTA), `rounded-full` (pill)
- `shadow-sm`, `shadow-md`, `shadow-lg`
- `font-sans`, `font-mono`

---

## shadcn/ui token override

shadcn/ui generates CSS variables like `--background`, `--foreground`, `--primary`, etc. Override the generated `globals.css` so its variables resolve to **our** tokens, not its defaults:

```css
:root {
  --background: var(--color-bg);
  --foreground: var(--color-fg);
  --card:       var(--color-bg-1);
  --card-foreground: var(--color-fg);
  --popover:    var(--color-bg-3);
  --popover-foreground: var(--color-fg);
  --primary:    var(--color-accent);
  --primary-foreground: var(--color-accent-ink);
  --secondary:  var(--color-bg-3);
  --secondary-foreground: var(--color-fg);
  --muted:      var(--color-bg-2);
  --muted-foreground: var(--color-fg-3);
  --accent:     var(--color-accent-soft);
  --accent-foreground: var(--color-accent);
  --destructive: var(--color-danger);
  --destructive-foreground: #ffffff;
  --border:     var(--color-line);
  --input:      var(--color-line-2);
  --ring:       var(--color-accent-ring);
  --radius:     10px;
}
```

Doing this means every shadcn primitive (Button, Card, Dialog, Tabs, DropdownMenu, etc.) instantly matches the Heimdall designs.

---

## Animation timings (also from `heimdall.css`)

| Use | Duration | Easing |
|---|---|---|
| Hover state transitions (color, bg, border) | 120ms | `ease` |
| Button press, focus ring | 120ms | `ease` |
| Drawer slide in/out | 280ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Dropdown menu open | 140ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Tab panel switch | 240ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Reveal on scroll | 700ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Count-up animation | 1400ms | cubic ease-out |
| Marquee (logo strip) | 40s | linear infinite |
| Aurora gradient pan | 24s | linear infinite |
| Border-beam rotation | 6s | linear infinite |
| Grid background shift | 30–35s | linear infinite |
| Shimmer pan | 2.6–3.2s | ease-in-out infinite |

The standard easing throughout is **`cubic-bezier(0.16, 1, 0.3, 1)`** — name it `--ease-snap` if you want a token for it.
