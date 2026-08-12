# Tailwind v4 → Figma Variables JSON

Converts the Tailwind CSS default theme (`tailwindcss/theme.css`) into a JSON
file you can import straight into Figma as variables — using Figma's native
variable import. Pinned to whatever `tailwindcss` version is installed
(currently **4.3.3**).

## Download

Don't want to clone? Grab the generated JSON directly:

- [`tailwind-v4.3.3.json`](https://github.com/mhernesniemi/tailwind-figma-variables/releases/download/v4.3.3/tailwind-v4.3.3.json)

All versions are on the [releases page](https://github.com/mhernesniemi/tailwind-figma-variables/releases).

## Import into Figma

1. In your Figma file, open the **Variables** view
2. Import the JSON file — a **Tailwind** collection appears with all 417 variables
3. Bind away: fills and strokes offer `color/*`, corner radius offers
   `radius/*`, gaps and padding offer `spacing/*`, and so on

## Or build it yourself

```sh
npm install
npm run build
```

Outputs `dist/tailwind-v4.3.3.json`.

## What gets converted

417 variables:

- **`color/*`** (288) — all 26 palettes × 11 shades + black/white. oklch →
  sRGB, gamut-clamped, in Figma's native color object format.
- **`spacing/*`** — the base `--spacing` multiplier (4px) plus the standard
  0–96 step scale and `px`, precomputed in px. Fractional steps use `_`
  (`spacing/0_5`) because Figma rejects dots in variable names.
- **`text/size/*`, `text/line-height/*`** — font sizes in px; line-height
  `calc()` ratios resolved to px for their size (e.g. `base` = 16/24).
- **`radius/*`, `breakpoint/*`, `container/*`, `blur/*`, `perspective/*`** —
  rem → px.
- **`font/weight/*`**, **`leading/*`** (unitless multipliers).
- **`tracking/*`** — em converted to percent of font size (e.g. `tight` =
  −2.5).
- **`font/family/*`**, **`ease/*`**, **`aspect/video`** — strings.

Not converted: `--shadow-*` and friends (Figma variables can't represent
effects — recreate them as effect styles), `--animate-*` keyframe shorthands,
and internal `--default-*` references.

## Updating to a new Tailwind release

```sh
npm install tailwindcss@latest && npm run build
```

The output filename picks up the installed version automatically.
