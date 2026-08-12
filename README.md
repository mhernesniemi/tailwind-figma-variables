# Tailwind v4.3.3 → Figma Variables JSON

Converts the Tailwind CSS default theme (`tailwindcss/theme.css`) into Figma
Variables JSON. Pinned to whatever `tailwindcss` version is installed
(currently **4.3.3**).

## Usage

```sh
npm install
npm run build
```

Outputs to `dist/`:

| File | Format | Use with |
| --- | --- | --- |
| `tailwind-v4.3.3.tokens.json` | W3C DTCG design tokens | Import plugins: Tokens Studio, Figma's `variables-import` sample plugin, Style Dictionary |
| `tailwind-v4.3.3.figma-rest.json` | Figma Variables REST API payload | `POST https://api.figma.com/v1/files/:file_key/variables` (requires an Enterprise plan token with `file_variables:write`) |

To push via the REST API:

```sh
curl -X POST "https://api.figma.com/v1/files/$FILE_KEY/variables" \
  -H "X-Figma-Token: $FIGMA_TOKEN" \
  -H "Content-Type: application/json" \
  -d @dist/tailwind-v4.3.3.figma-rest.json
```

## What gets converted

438 tokens total (417 as Figma variables — shadows are DTCG-only, since Figma
variables can't represent effects):

- **`color/*`** (288) — all 26 palettes × 11 shades + black/white. oklch →
  sRGB, gamut-clamped. COLOR variables.
- **`spacing/*`** — the base `--spacing` multiplier (4px) plus the standard
  0–96 step scale and `px`, precomputed in px. FLOAT.
- **`text/size/*`, `text/line-height/*`** — font sizes in px; line-height
  `calc()` ratios resolved to px for their size (e.g. `base` = 16/24). FLOAT.
- **`radius/*`, `breakpoint/*`, `container/*`, `blur/*`, `perspective/*`** —
  rem → px. FLOAT.
- **`font/weight/*`**, **`leading/*`** (unitless multipliers) — FLOAT.
- **`tracking/*`** — em converted to percent of font size (e.g. `tight` =
  −2.5). FLOAT.
- **`font/family/*`**, **`ease/*`**, **`aspect/video`** — STRING.
- **`shadow/*`, `inset-shadow/*`, `drop-shadow/*`, `text-shadow/*`** — parsed
  into structured DTCG `shadow` layers (DTCG file only).

Skipped: `--animate-*` (keyframe shorthands) and `--default-*` (internal
`--theme()` references).

## Conventions

- 1rem = **16px**
- REST payload creates one collection, `Tailwind v4.3.3`, with a single
  `Value` mode; variable names use `/` grouping (`color/red/500`).

## Updating to a new Tailwind release

```sh
npm install tailwindcss@latest && npm run build
```

Output filenames pick up the installed version automatically.
