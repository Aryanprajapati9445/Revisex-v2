# Design Map

Source: https://www.notion.com/ — captured at 1440×900, page height 4488px.

## Spacing Scale

- **Macro (strict 8-base):** 8px, 16px, 24px, 32px, 64px, 96px — section gap measured 108px, footer padding `80px 0 24px`
- **Micro (optical, off-grid):** 3px (46 uses), 5px, 6px (54 uses), 10px, 12px (25 uses)
- **Frequency ranking:** 8px×55, 6px×54, 3px×46, 24px×29, 12px×25, 16px×14
- **Method:** `gap` on flex rows and buttons (8px); `margin` on headings (`0 0 12px`); `padding` on sections
- **Horizontal-only inset:** `0px 8px` (23 uses)

## Font Hierarchy

| Size | Weight | Line height | Letter-spacing | Role |
|---|---|---|---|---|
| 96px | 600 | 100px | -4.6px | hero display (1 use) |
| 72px | 700 | — | — | secondary display |
| 54px | 700 | 56px | -1.875px | section display (2 uses) |
| 42px | 700 | — | — | tertiary display |
| 20px | 400 | 28px | normal | lead paragraph |
| 16px | 400 | — | normal | body |
| 14px | 500 | 20px | normal | UI default (63 uses, dominant) |
| 12px | 400 | — | normal | caption |

Weight distribution: 500×58, 400×20, 700×16, 600×4.
Families: `NotionInter` (480 uses, all roles), `Lyon Text` (4 uses, incidental serif).

## Color Palette

| Value | Role | Surface area |
|---|---|---|
| `#FFFFFF` | page background | 67.3% |
| `#F9F9F8` | secondary surface (warm) | 11.6% |
| `rgba(0,0,0,0.898)` | text primary (34 uses) | — |
| `#615D59` | text muted (warm gray, 15 uses) | — |
| `rgba(0,0,0,0.54)` | text tertiary (9 uses) | — |
| `#0075DE` | accent — CTA fill only (3 elements) | 0.2% |
| `#E6F3FE` | accent-subtle — secondary CTA fill | — |

Decorative-only, not palette colors: `#FFB110` amber, mint-teal highlight pill (~2% area, single hero use).

## Image Ratios

- **1.9:1** — hero product screenshot (~960px rendered, largest visual element)
- **1.35:1** — nav dropdown thumbnails (256×189 natural, 220px rendered)
- **1:1** — decorative sprites (225×225)

## Component Tokens

- **Radius:** 8px (52 uses, default) · 4px (23, small controls) · 12px (17, large surfaces) · 9999px (7, pill buttons) · 50% (avatars)
- **Nesting rule:** 12px outer → 8px inner → 4px innermost
- **Shadow (elevated):** `0 0.175px 1.041px rgba(0,0,0,0.01), 0 0.8px 2.925px rgba(0,0,0,0.02), 0 2.025px 7.847px rgba(0,0,0,0.027), 0 4px 12px rgba(0,0,0,0.04)`
- **Shadow (floating):** `0 0.667px 3.502px rgba(0,0,0,0.008), 0 2.933px 7.252px rgba(0,0,0,0.016), 0 7.2px 14.462px rgba(0,0,0,0.02), 0 14px 26px rgba(0,0,0,0.024)`
- **Borders:** none — zero bordered components found across 2000 sampled viewport elements
- **Buttons:** 14px/500/`9999px` radius/`8px 16px` padding (primary pill) · 16px/400/`4px` radius/`5px 10px` padding (secondary)
- **Grid:** container 1425px, `max-width: none`, 21 named-line columns, 24px gutters, 9 grids on page
- **Motion:** `background-color 0.15s` · `box-shadow 0.2s cubic-bezier(0.42,0,1,1)` · `transform 0.3s` · `inline-size 0.3s cubic-bezier(0.86,0,0.07,1)`
- **A11y:** `:focus-visible` present · `prefers-reduced-motion` respected

---

# Taste DNA

### Borderless Depth

- **Trigger**: When content blocks needed to read as distinct objects on a white page
- **Decision**: A 4-layer shadow with alphas ramping 0.01 → 0.02 → 0.027 → 0.04, over a 1px border — with **no** visible borders anywhere on the page
- **Reason**: A border is a drawn line the eye must parse as content; a shadow is light behavior the eye already knows how to ignore. Readers register "this is a separate thing" without registering that anything was added.
- **Evidence**: 0 of 2000 viewport elements matched radius+border/shadow+sizing · blur ramps 1.04px → 2.93px → 7.85px · sub-pixel offsets 0.175px, 0.667px, 2.025px indicate computed rather than hand-authored values · the only single-layer shadow is `0 1px 0 rgba(0,0,0,0)` — zero alpha, imperceptible

### Accent Rationing

- **Trigger**: When a brand blue was available for headings, links, icons, borders, and section backgrounds
- **Decision**: Spent it on the primary CTA fill alone, with `#E6F3FE` as a desaturated echo for the secondary action — over threading brand color through headings and iconography
- **Reason**: Color as decoration teaches the reader that color means nothing; color spent only on the next action means a first-time visitor never has to ask what to click.
- **Evidence**: `#0075DE` covers 0.2% of surface area across exactly 3 elements · `#FFFFFF` (67.3%) + `#F9F9F8` (11.6%) hold 78.9% between them · body text `rgba(0,0,0,0.898)`, muted `#615D59` — no chromatic text anywhere

### Warm Paper, Cool Action

- **Trigger**: When choosing the neutral ramp for backgrounds, secondary surfaces, and muted text
- **Decision**: Warm-tinted neutrals under a cool accent, over a hue-neutral gray scale
- **Reason**: Warm neutrals read as paper stock rather than unlit screen — the right feeling for a product people write documents in. The warm/cool split also makes a 0.2%-coverage blue punch harder than its area should permit, because it is the only cool thing on the page.
- **Evidence**: `#F9F9F8` is R249 G249 B248 (blue one step down) · `#615D59` is R97 G93 B89, an 8-point R→B warm spread · accent `#0075DE` is cool · shadows stay pure `rgba(0,0,0,x)` with no hue tint, confining warmth to surfaces and text

### Optical Spacing Beats Grid Purity

- **Trigger**: When setting padding inside buttons, chips, and nav items, where a strict 8px grid prescribes 8px or 16px
- **Decision**: 3px, 5px, 6px, and 10px inside components — tuned to the text each wraps — while keeping macro layout strictly 8-based, over one grid governing every value
- **Reason**: An 8px grid applied to a 14px button label produces padding that *measures* correct and *looks* loose. The reader never sees the grid, only whether the label sits centered in its container.
- **Evidence**: 6px appears 54× and 3px 46×, statistically tied with 8px at 55× — a parallel system, not exceptions · button padding `5px 10px` and `8px 16px` · section values stay pure: 24px×29, 96px×4, 64px×3, footer `80px 0 24px`
