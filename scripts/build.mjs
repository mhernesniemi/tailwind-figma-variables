#!/usr/bin/env node
/**
 * Tailwind CSS v4 default theme -> Figma Variables JSON
 *
 * Reads node_modules/tailwindcss/theme.css and emits dist/tailwind-v<version>.json —
 * a DTCG design-tokens file in the exact dialect Figma's native variable importer
 * expects (colors as {colorSpace, components, alpha, hex} objects).
 *
 * Conventions:
 *   - rem values are converted to px at 16px root font size
 *   - colors are converted from oklch to sRGB (clamped to gamut)
 *   - tracking (letter-spacing) is exported as percent (em * 100)
 *   - text/line-height/* resolve to px for their font size
 *   - "." is replaced with "_" in token names (Figma rejects dots): spacing/0_5
 *   - shadows are excluded: Figma variables cannot represent effects
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

function colorToFigma(value) {
  const parsed = parseColor(value)
  if (!parsed) throw new Error(`Unparseable color: ${value}`)
  const { r, g, b, alpha = 1 } = toRgb(parsed)
  const clamp = (n) => Math.min(1, Math.max(0, n))
  const components = [clamp(r), clamp(g), clamp(b)]
  const hex = '#' + components.map((n) => Math.round(n * 255).toString(16).padStart(2, '0')).join('')
  return { colorSpace: 'srgb', components, alpha: clamp(alpha), hex }
}

// ---------------------------------------------------------------------------
// Build the token list
// ---------------------------------------------------------------------------
const tokens = []
// Figma rejects "." in variable names (e.g. spacing/0.5), so use "_" instead
const add = (name, type, value, description) =>
  tokens.push({ name: name.replace(/\./g, '_'), type, value, ...(description ? { description } : {}) })

// Tailwind's static spacing utility steps (v4 spacing is --spacing * n)
const SPACING_STEPS = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20,
  24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
]

const skipped = []

for (const [prop, value] of decls) {
  let m
  if ((m = prop.match(/^color-(.+)$/))) {
    add(`color/${m[1].split('-').join('/')}`, 'color', colorToFigma(value))
    continue
  }

  if (prop === 'spacing') {
    const base = remToPx(value)
    add('spacing/base', 'number', base, `Spacing multiplier (${value})`)
    add('spacing/px', 'number', 1, 'The `*-px` utilities')
    for (const step of SPACING_STEPS) {
      add(`spacing/${step}`, 'number', step * base, `--spacing * ${step}`)
    }
    continue
  }

  if ((m = prop.match(/^(breakpoint|container|radius|blur|perspective)-(.+)$/))) {
    add(`${m[1]}/${m[2]}`, 'number', lengthToPx(value), `${value}`)
    continue
  }

  if ((m = prop.match(/^text-([\w]+)$/))) {
    add(`text/size/${m[1]}`, 'number', remToPx(value), `${value}`)
    continue
  }
  if ((m = prop.match(/^text-([\w]+)--line-height$/))) {
    const size = remToPx(decls.get(`text-${m[1]}`))
    const ratio = evalRatio(value)
    add(
      `text/line-height/${m[1]}`,
      'number',
      Math.round(ratio * size * 100) / 100,
      `${value} of ${m[1]} (${size}px)`
    )
    continue
  }

  if ((m = prop.match(/^font-weight-(.+)$/))) {
    add(`font/weight/${m[1]}`, 'number', parseFloat(value))
    continue
  }

  if ((m = prop.match(/^font-(sans|serif|mono)$/))) {
    add(`font/family/${m[1]}`, 'string', value, 'CSS font stack')
    continue
  }

  if ((m = prop.match(/^tracking-(.+)$/))) {
    const em = parseFloat(value)
    add(`tracking/${m[1]}`, 'number', em * 100, `${value} — percent of font size`)
    continue
  }

  if ((m = prop.match(/^leading-(.+)$/))) {
    add(`leading/${m[1]}`, 'number', parseFloat(value), 'Unitless multiplier')
    continue
  }

  if ((m = prop.match(/^ease-(.+)$/))) {
    add(`ease/${m[1]}`, 'string', value)
    continue
  }

  if (prop === 'aspect-video') {
    add('aspect/video', 'string', value)
    continue
  }

  if (prop === 'default-transition-duration') {
    add('transition/duration', 'number', parseFloat(value), `${value} (ms)`)
    continue
  }
  if (prop === 'default-transition-timing-function') {
    add('transition/timing-function', 'string', value)
    continue
  }

  // shadows (not representable as Figma variables), animate-* keyframe
  // shorthands, and --default-* --theme() references
  skipped.push(prop)
}

// ---------------------------------------------------------------------------
// Emit DTCG tree in Figma's native-import dialect
// ---------------------------------------------------------------------------
const out = { $description: `Tailwind CSS v${twPkg.version} default theme` }
for (const t of tokens) {
  const path = t.name.split('/')
  let node = out
  for (const part of path.slice(0, -1)) node = node[part] ??= {}
  node[path.at(-1)] = {
    $type: t.type,
    $value: t.value,
    ...(t.description ? { $description: t.description } : {}),
  }
}

mkdirSync(join(root, 'dist'), { recursive: true })
const outPath = join(root, 'dist', `tailwind-v${twPkg.version}.json`)
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n')

const byType = tokens.reduce((acc, t) => ((acc[t.type] = (acc[t.type] ?? 0) + 1), acc), {})
console.log(`Tailwind v${twPkg.version} -> ${tokens.length} variables`)
console.log(`  ${Object.entries(byType).map(([k, n]) => `${k}: ${n}`).join(', ')}`)
console.log(`  ${outPath}`)
console.log(`  Skipped (not variable-shaped): ${skipped.join(', ')}`)
