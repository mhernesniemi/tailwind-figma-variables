#!/usr/bin/env node
/**
 * Tailwind CSS v4 default theme -> Figma Variables JSON
 *
 * Reads node_modules/tailwindcss/theme.css and emits:
 *   dist/tailwind-v<version>.tokens.json          W3C DTCG design tokens
 *   dist/tailwind-v<version>.figma-rest.json      POST /v1/files/:key/variables payload
 *
 * Conventions:
 *   - rem values are converted to px at 16px root font size
 *   - colors are converted from oklch to sRGB (clamped to gamut)
 *   - tracking (letter-spacing) is exported as percent (em * 100)
 *   - leading and text-*--line-height resolve to px per font size where possible
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parse as parseColor, rgb as toRgb } from 'culori'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const twPkg = require('tailwindcss/package.json')
const themeCss = readFileSync(require.resolve('tailwindcss/theme.css'), 'utf8')

const REM = 16

// ---------------------------------------------------------------------------
// Parse the first @theme block (the second one is deprecated aliases)
// ---------------------------------------------------------------------------
const activeCss = themeCss.split('/* Deprecated */')[0]
const decls = new Map()
for (const m of activeCss.matchAll(/--([\w-]+(?:--[\w-]+)?)\s*:\s*([^;]+);/g)) {
  decls.set(m[1], m[2].replace(/\s+/g, ' ').trim())
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------
function remToPx(value) {
  const m = value.match(/^(-?[\d.]+)rem$/)
  return m ? parseFloat(m[1]) * REM : null
}

function pxValue(value) {
  const m = value.match(/^(-?[\d.]+)px$/)
  return m ? parseFloat(m[1]) : null
}

function lengthToPx(value) {
  const px = pxValue(value)
  if (px !== null) return px
  return remToPx(value)
}

function evalRatio(value) {
  if (/^[\d.]+$/.test(value)) return parseFloat(value)
  const m = value.match(/^calc\(\s*([\d.]+)\s*\/\s*([\d.]+)\s*\)$/)
  return m ? parseFloat(m[1]) / parseFloat(m[2]) : null
}

function colorToRgba(value) {
  const parsed = parseColor(value)
  if (!parsed) throw new Error(`Unparseable color: ${value}`)
  const { r, g, b, alpha = 1 } = toRgb(parsed)
  const clamp = (n) => Math.min(1, Math.max(0, n))
  return { r: clamp(r), g: clamp(g), b: clamp(b), a: clamp(alpha) }
}

function rgbaToHex({ r, g, b, a }) {
  const h = (n) => Math.round(n * 255).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}${a < 1 ? h(a) : ''}`
}

// Parse a CSS box-shadow list into DTCG shadow objects
function parseShadows(value) {
  const layers = value.split(/,(?![^()]*\))/).map((s) => s.trim())
  return layers.map((layer) => {
    const inset = /\binset\b/.test(layer)
    const color = layer.match(/rgb\([^)]*\)|#[0-9a-fA-F]+/)?.[0] ?? '#000'
    const lengths = layer
      .replace(/\binset\b/, '')
      .replace(/rgb\([^)]*\)|#[0-9a-fA-F]+/, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((l) => (l === '0' ? 0 : lengthToPx(l) ?? 0))
    const [x = 0, y = 0, blur = 0, spread = 0] = lengths
    const shadow = {
      color: rgbaToHex(colorToRgba(color)),
      offsetX: `${x}px`,
      offsetY: `${y}px`,
      blur: `${blur}px`,
      spread: `${spread}px`,
    }
    if (inset) shadow.inset = true
    return shadow
  })
}

// ---------------------------------------------------------------------------
// Build the token list: { name: "color/red/500", type, value, description? }
// type: COLOR | FLOAT | STRING (Figma resolved types); DTCG type derived from it
// ---------------------------------------------------------------------------
const tokens = []
const add = (name, type, value, description) =>
  tokens.push({ name, type, value, ...(description ? { description } : {}) })

// Tailwind's static spacing utility steps (v4 spacing is --spacing * n)
const SPACING_STEPS = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20,
  24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
]

const skipped = []

for (const [prop, value] of decls) {
  // Colors -------------------------------------------------------------
  let m
  if ((m = prop.match(/^color-(.+)$/))) {
    const parts = m[1].split('-') // e.g. red-500 -> color/red/500
    add(`color/${parts.join('/')}`, 'COLOR', colorToRgba(value))
    continue
  }

  // Spacing: emit base plus the standard scale --------------------------
  if (prop === 'spacing') {
    const base = remToPx(value)
    add('spacing/base', 'FLOAT', base, `Spacing multiplier (${value})`)
    add('spacing/px', 'FLOAT', 1, 'The `*-px` utilities')
    for (const step of SPACING_STEPS) {
      add(`spacing/${step}`, 'FLOAT', step * base, `--spacing * ${step}`)
    }
    continue
  }

  // Simple rem/px lengths -> px ------------------------------------------
  if ((m = prop.match(/^(breakpoint|container|radius|blur|perspective)-(.+)$/))) {
    add(`${m[1]}/${m[2]}`, 'FLOAT', lengthToPx(value), `${value}`)
    continue
  }

  // Font sizes and their line heights -------------------------------------
  if ((m = prop.match(/^text-([\w]+)$/))) {
    add(`text/size/${m[1]}`, 'FLOAT', remToPx(value), `${value}`)
    continue
  }
  if ((m = prop.match(/^text-([\w]+)--line-height$/))) {
    const size = remToPx(decls.get(`text-${m[1]}`))
    const ratio = evalRatio(value)
    add(
      `text/line-height/${m[1]}`,
      'FLOAT',
      Math.round(ratio * size * 100) / 100,
      `${value} of ${m[1]} (${size}px)`
    )
    continue
  }

  // Font weights -----------------------------------------------------------
  if ((m = prop.match(/^font-weight-(.+)$/))) {
    add(`font/weight/${m[1]}`, 'FLOAT', parseFloat(value))
    continue
  }

  // Font families ------------------------------------------------------------
  if ((m = prop.match(/^font-(sans|serif|mono)$/))) {
    add(`font/family/${m[1]}`, 'STRING', value, 'CSS font stack')
    continue
  }

  // Letter spacing: em -> percent ---------------------------------------------
  if ((m = prop.match(/^tracking-(.+)$/))) {
    const em = parseFloat(value)
    add(`tracking/${m[1]}`, 'FLOAT', em * 100, `${value} — percent of font size`)
    continue
  }

  // Line-height multipliers ------------------------------------------------
  if ((m = prop.match(/^leading-(.+)$/))) {
    add(`leading/${m[1]}`, 'FLOAT', parseFloat(value), 'Unitless multiplier')
    continue
  }

  // Shadows (DTCG only; Figma variables cannot hold effects) ----------------
  if ((m = prop.match(/^(shadow|inset-shadow|drop-shadow|text-shadow)-(.+)$/))) {
    add(`${m[1]}/${m[2]}`, 'SHADOW', parseShadows(value), value)
    continue
  }

  // Easing curves ------------------------------------------------------------
  if ((m = prop.match(/^ease-(.+)$/))) {
    add(`ease/${m[1]}`, 'STRING', value)
    continue
  }

  if (prop === 'aspect-video') {
    add('aspect/video', 'STRING', value)
    continue
  }

  if (prop === 'default-transition-duration') {
    add('transition/duration', 'FLOAT', parseFloat(value), `${value} (ms)`)
    continue
  }
  if (prop === 'default-transition-timing-function') {
    add('transition/timing-function', 'STRING', value)
    continue
  }

  // animate-* keyframe shorthands and --default-* --theme() references
  skipped.push(prop)
}

// ---------------------------------------------------------------------------
// Output 1: W3C DTCG design tokens (nested groups)
// ---------------------------------------------------------------------------
const DTCG_TYPES = { COLOR: 'color', FLOAT: 'number', STRING: 'string', SHADOW: 'shadow' }
const dtcg = {
  $description: `Tailwind CSS v${twPkg.version} default theme`,
}
for (const t of tokens) {
  const path = t.name.split('/')
  let node = dtcg
  for (const part of path.slice(0, -1)) node = node[part] ??= {}
  node[path.at(-1)] = {
    $type: DTCG_TYPES[t.type],
    $value: t.type === 'COLOR' ? rgbaToHex(t.value) : t.value,
    ...(t.description ? { $description: t.description } : {}),
  }
}

// ---------------------------------------------------------------------------
// Output 2: Figma Variables REST API payload
//   POST https://api.figma.com/v1/files/:file_key/variables
// ---------------------------------------------------------------------------
const SCOPES = {
  COLOR: ['ALL_SCOPES'],
  FLOAT: ['ALL_SCOPES'],
  STRING: ['ALL_SCOPES'],
}
const collectionId = 'tw_collection'
const modeId = 'tw_mode'
const rest = {
  variableCollections: [
    {
      action: 'CREATE',
      id: collectionId,
      name: `Tailwind v${twPkg.version}`,
      initialModeId: modeId,
    },
  ],
  variableModes: [
    {
      action: 'UPDATE',
      id: modeId,
      name: 'Value',
      variableCollectionId: collectionId,
    },
  ],
  variables: [],
  variableModeValues: [],
}
let i = 0
for (const t of tokens) {
  if (t.type === 'SHADOW') continue // not representable as a Figma variable
  const id = `tw_var_${i++}`
  rest.variables.push({
    action: 'CREATE',
    id,
    name: t.name,
    variableCollectionId: collectionId,
    resolvedType: t.type,
    scopes: SCOPES[t.type],
    ...(t.description ? { description: t.description } : {}),
  })
  rest.variableModeValues.push({ variableId: id, modeId, value: t.value })
}

// ---------------------------------------------------------------------------
// Write files
// ---------------------------------------------------------------------------
mkdirSync(join(root, 'dist'), { recursive: true })
const v = twPkg.version
const tokensPath = join(root, 'dist', `tailwind-v${v}.tokens.json`)
const restPath = join(root, 'dist', `tailwind-v${v}.figma-rest.json`)
writeFileSync(tokensPath, JSON.stringify(dtcg, null, 2) + '\n')
writeFileSync(restPath, JSON.stringify(rest, null, 2) + '\n')

const byType = tokens.reduce((acc, t) => ((acc[t.type] = (acc[t.type] ?? 0) + 1), acc), {})
console.log(`Tailwind v${v} -> ${tokens.length} tokens`)
console.log(`  ${Object.entries(byType).map(([k, n]) => `${k}: ${n}`).join(', ')}`)
console.log(`  DTCG tokens:      ${tokensPath}`)
console.log(`  Figma REST body:  ${restPath} (${rest.variables.length} variables)`)
if (skipped.length) console.log(`  Skipped (not variable-shaped): ${skipped.join(', ')}`)
