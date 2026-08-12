// Creates Figma text styles text/xs … text/9xl with fontSize + lineHeight
// bound to the "Tailwind" collection's text/size/* and text/line-height/* variables.
//
// How to run (no MCP needed):
//   1. Open your Figma file (the one with the imported Tailwind variables)
//   2. Menu → Plugins → search "Scripter" → run it
//   3. Paste this whole file into Scripter and press Run
//
// Falls back to hard-coded px values if variable binding isn't available.

const SIZES = [
  ['xs', 12, 16], ['sm', 14, 20], ['base', 16, 24], ['lg', 18, 28],
  ['xl', 20, 28], ['2xl', 24, 32], ['3xl', 30, 36], ['4xl', 36, 40],
  ['5xl', 48, 48], ['6xl', 60, 60], ['7xl', 72, 72], ['8xl', 96, 96],
  ['9xl', 128, 128],
]

await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })

const varByName = {}
for (const v of await figma.variables.getLocalVariablesAsync()) varByName[v.name] = v

const existing = new Set((await figma.getLocalTextStylesAsync()).map((s) => s.name))
const results = []

for (const [step, sizePx, lhPx] of SIZES) {
  const name = `text/${step}`
  if (existing.has(name)) { results.push(`${name}: already exists, skipped`); continue }

  const style = figma.createTextStyle()
  style.name = name
  style.fontName = { family: 'Inter', style: 'Regular' }
  style.fontSize = sizePx
  style.lineHeight = { unit: 'PIXELS', value: lhPx }

  const sizeVar = varByName[`text/size/${step}`]
  const lhVar = varByName[`text/line-height/${step}`]
  let bound = []
  try { if (sizeVar) { style.setBoundVariable('fontSize', sizeVar); bound.push('size') } } catch (e) {}
  try { if (lhVar) { style.setBoundVariable('lineHeight', lhVar); bound.push('lineHeight') } } catch (e) {}
  results.push(`${name}: created${bound.length ? ' (bound: ' + bound.join(', ') + ')' : ' (raw px values, binding unavailable)'}`)
}

console.log(results.join('\n'))
