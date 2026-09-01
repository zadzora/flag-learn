/**
 * The "Paint the Flag" SVG engine: turns a flag SVG into a set of grayed-out,
 * individually paintable regions plus the palette of colors they should end up.
 *
 * Extracted from the Paint mode so the Daily Gauntlet can run the exact same
 * mechanic without a second copy of this (rather fiddly) DOM surgery.
 */

export interface Region {
  id: string
  primaryColor: string
  colorAttr: 'fill' | 'stroke'
  grayColor: string
}

export interface ProcessedFlag {
  svgString: string
  regions: Region[]
  palette: string[]
}

export const GRAY_COLOR = '#9ca3af'
export const GRAY_STROKE_COLOR = '#374151'
const GRAY_VARIANTS = ['#9ca3af', '#d1d5db', '#6b7280', '#c4cad3']
const GRAY_STROKE_VARIANTS = ['#374151', '#64748b', '#2a3447', '#8b9eb0']
const MAX_PALETTE_COLORS = 7
const MIN_REGIONS = 2

/** Flags simple enough to be broken into paintable regions. */
export const PAINTABLE_CODES = [
  'de', 'fr', 'it', 'ie', 'be', 'nl', 'ru', 'pl', 'at', 'hu', 'ro',
  'lt', 'lv', 'ee', 'ua', 'id', 'ng', 'am', 'bg',
  'dk', 'se', 'no', 'fi', 'ch', 'is',
  'jp', 'bd', 'az', 'tr', 'gr', 'th',
  'ca', 'dz', 'al', 'bs', 'bf', 'bh', 'bj', 'bw', 'cm', 'td', 'co', 'cg',
  'cu', 'cz', 'dj', 'ga', 'gn', 'ci', 'kw', 'la', 'lu', 'mg', 'ml',
  'mu', 'mc', 'ne', 'pw', 'ps', 'pe', 'lc', 'sc', 'sl', 'sd',
  'sr', 'tg', 'ae', 'vn', 'ye', 'gb-eng', 'gb-sct', 'cf', 'gm', 'cl', 'cn',
  'tl', 'gh', 'gw', 'mm', 'mk', 'ss', 'jm', 'mr', 'ma',
]

export function normalizeColor(c: string): string {
  if (!c || c === 'none') return ''
  c = c.trim()
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]
  }
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase()
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = c
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    if (a === 0) return ''
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  } catch { return '' }
}

const SKIP_VALUES = new Set(['none', 'inherit', 'currentcolor', 'transparent'])

export function applyStroke(el: Element) {
  el.setAttribute('stroke', '#000000')
  el.setAttribute('stroke-opacity', '1')
  el.setAttribute('stroke-width', '3')
  el.setAttribute('vector-effect', 'non-scaling-stroke')
  el.setAttribute('paint-order', 'stroke fill markers')
}

export function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 160
}

/** Grays out every colored shape and records the color it must be painted back to. */
export function processFlag(svgText: string): ProcessedFlag | null {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')
  const svg = doc.querySelector('svg')
  if (!svg) return null

  const origW = svg.getAttribute('width') || '900'
  const origH = svg.getAttribute('height') || '600'
  if (!svg.getAttribute('viewBox')) {
    svg.setAttribute('viewBox', `0 0 ${parseFloat(origW)} ${parseFloat(origH)}`)
  }
  svg.setAttribute('width', '100%')
  svg.removeAttribute('height')
  svg.removeAttribute('preserveAspectRatio')

  const regions: Region[] = []
  let idx = 0

  // If the <svg> root has an inherited fill (e.g. fill="#fff" on Cuba's flag),
  // elements without an explicit fill attribute inherit that color, not black.
  const svgRootFill = svg.getAttribute('fill')
  const svgDefaultFill = (svgRootFill && !SKIP_VALUES.has(svgRootFill.toLowerCase()) && !svgRootFill.toLowerCase().startsWith('url('))
    ? normalizeColor(svgRootFill) || '#000000'
    : '#000000'

  svg.querySelectorAll('path, rect, polygon, circle, ellipse, polyline').forEach(el => {
    if (el.closest('defs')) return
    const rawFill = el.getAttribute('fill')
    const rawStroke = el.getAttribute('stroke')

    const fillVal = rawFill?.toLowerCase() ?? null
    const strokeVal = rawStroke?.toLowerCase() ?? null

    const hasExplicitFill = fillVal !== null && !SKIP_VALUES.has(fillVal) && !fillVal.startsWith('url(')
    const hasImplicitFill = fillVal === null && strokeVal === null
    const hasStroke = strokeVal !== null && !SKIP_VALUES.has(strokeVal) && !strokeVal.startsWith('url(')

    let fillColor: string | null = null
    let strokeColor: string | null = null

    if (hasExplicitFill) fillColor = normalizeColor(rawFill!) || null
    else if (hasImplicitFill) fillColor = svgDefaultFill

    if (hasStroke) strokeColor = normalizeColor(rawStroke!) || null

    if (!fillColor && !strokeColor) return

    const id = `r${idx++}`
    el.setAttribute('data-rid', id)

    if (fillColor) {
      el.setAttribute('fill', GRAY_COLOR)
      applyStroke(el)
      regions.push({ id, primaryColor: fillColor, colorAttr: 'fill', grayColor: GRAY_COLOR })
    } else if (strokeColor) {
      el.setAttribute('stroke', GRAY_STROKE_COLOR)
      if (rawFill === null) el.setAttribute('fill', 'none')
      regions.push({ id, primaryColor: strokeColor, colorAttr: 'stroke', grayColor: GRAY_STROKE_COLOR })
    }
  })

  if (regions.length < MIN_REGIONS) return null
  const palette = [...new Set(regions.map(r => r.primaryColor))]
  if (palette.length > MAX_PALETTE_COLORS) return null

  // Assign a distinct gray shade per palette color so adjacent regions are visually distinguishable
  const colorToGray = new Map(palette.map((c, i) => [c, GRAY_VARIANTS[i % GRAY_VARIANTS.length]]))
  const colorToGrayStroke = new Map(palette.map((c, i) => [c, GRAY_STROKE_VARIANTS[i % GRAY_STROKE_VARIANTS.length]]))
  for (const region of regions) {
    if (region.colorAttr === 'fill') {
      const gc = colorToGray.get(region.primaryColor) ?? GRAY_COLOR
      region.grayColor = gc
      svg.querySelector(`[data-rid="${region.id}"]`)?.setAttribute('fill', gc)
    } else {
      const gc = colorToGrayStroke.get(region.primaryColor) ?? GRAY_STROKE_COLOR
      region.grayColor = gc
      svg.querySelector(`[data-rid="${region.id}"]`)?.setAttribute('stroke', gc)
    }
  }

  return { svgString: new XMLSerializer().serializeToString(svg), regions, palette }
}

/**
 * Detects fill regions whose visible area is split into multiple disconnected
 * horizontal strips (e.g. Austria: red background visible top AND bottom, with
 * a white stripe in the middle). Replaces the original element with separate
 * <rect> elements per visible strip so each can be painted independently.
 */
export function splitOverlappingRegions(svgEl: SVGSVGElement, initialRegions: Region[]): Region[] {
  const TOLERANCE = 0.5
  type Info = { region: Region; el: SVGGraphicsElement | null; bbox: SVGRect | null }

  const infos: Info[] = initialRegions.map(region => {
    const el = svgEl.querySelector(`[data-rid="${region.id}"]`) as SVGGraphicsElement | null
    try { return { region, el, bbox: el ? el.getBBox() : null } }
    catch { return { region, el, bbox: null } }
  })

  const finalRegions: Region[] = []

  infos.forEach(({ region, el, bbox }, i) => {
    if (!el || !bbox || region.colorAttr !== 'fill') { finalRegions.push(region); return }

    // Find later fill elements that span the full x-width (horizontal coverers)
    const coverYRanges: { y1: number; y2: number }[] = []
    infos.slice(i + 1).forEach(({ el: le, bbox: lb, region: lr }) => {
      if (!le || !lb || lr.colorAttr !== 'fill') return
      if (lb.x > bbox.x + TOLERANCE || lb.x + lb.width < bbox.x + bbox.width - TOLERANCE) return
      const oy1 = Math.max(lb.y, bbox.y), oy2 = Math.min(lb.y + lb.height, bbox.y + bbox.height)
      if (oy2 > oy1 + TOLERANCE) coverYRanges.push({ y1: oy1, y2: oy2 })
    })

    if (coverYRanges.length === 0) { finalRegions.push(region); return }

    coverYRanges.sort((a, b) => a.y1 - b.y1)
    const merged: { y1: number; y2: number }[] = []
    coverYRanges.forEach(cv => {
      if (merged.length > 0 && cv.y1 <= merged[merged.length - 1].y2 + TOLERANCE)
        merged[merged.length - 1].y2 = Math.max(merged[merged.length - 1].y2, cv.y2)
      else merged.push({ ...cv })
    })

    const visStrips: { y1: number; y2: number }[] = []
    let curY = bbox.y
    merged.forEach(cv => {
      if (cv.y1 > curY + TOLERANCE) visStrips.push({ y1: curY, y2: cv.y1 })
      curY = Math.max(curY, cv.y2)
    })
    if (curY < bbox.y + bbox.height - TOLERANCE) visStrips.push({ y1: curY, y2: bbox.y + bbox.height })

    if (visStrips.length <= 1) { finalRegions.push(region); return }

    visStrips.forEach((strip, si) => {
      const newId = `${region.id}_s${si}`
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      rect.setAttribute('x', String(bbox.x))
      rect.setAttribute('y', String(strip.y1))
      rect.setAttribute('width', String(bbox.width))
      rect.setAttribute('height', String(strip.y2 - strip.y1))
      rect.setAttribute('fill', region.grayColor)
      rect.setAttribute('data-rid', newId)
      applyStroke(rect)
      el.parentNode?.insertBefore(rect, el)
      finalRegions.push({ id: newId, primaryColor: region.primaryColor, colorAttr: 'fill', grayColor: region.grayColor })
    })
    el.remove()
  })

  return finalRegions
}

/**
 * Splits compound <path> elements that draw multiple visually disconnected shapes
 * (e.g. a combined yellow stripe + yellow star path) into separate elements so
 * each can be painted independently. Leaves hole-patterns (like crescents made
 * of two overlapping circles) intact by only splitting when subpath bboxes are
 * fully disjoint.
 */
export function splitCompoundPaths(svgEl: SVGSVGElement, initialRegions: Region[]): Region[] {
  function getSubpaths(d: string): string[] {
    // Insert separator after each Z/z that's immediately followed by M/m
    const sep = d.replace(/([Zz])\s*([Mm])/g, '$1\x00$2')
    return sep.split('\x00').map(s => s.trim()).filter(Boolean)
  }

  function bboxDisjoint(a: SVGRect, b: SVGRect): boolean {
    return a.x + a.width <= b.x || b.x + b.width <= a.x ||
           a.y + a.height <= b.y || b.y + b.height <= a.y
  }

  const finalRegions: Region[] = []

  for (const region of initialRegions) {
    if (region.colorAttr !== 'fill') { finalRegions.push(region); continue }
    const el = svgEl.querySelector(`[data-rid="${region.id}"]`) as SVGGraphicsElement | null
    if (!el || el.tagName.toLowerCase() !== 'path') { finalRegions.push(region); continue }
    const d = el.getAttribute('d')
    if (!d) { finalRegions.push(region); continue }

    const subpaths = getSubpaths(d)
    if (subpaths.length <= 1) { finalRegions.push(region); continue }

    // Non-first subpaths starting with lowercase `m` are positioned relative to
    // the end of the previous subpath — measuring their bbox in isolation gives a
    // wrong position, so we must not split such compound paths.
    if (subpaths.slice(1).some(sp => /^m/.test(sp))) { finalRegions.push(region); continue }

    // Measure each subpath's bbox via a temporary element
    const temps = subpaths.map(sp => {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      p.setAttribute('d', sp)
      svgEl.appendChild(p)
      return p
    })
    const bboxes = temps.map(p => { try { return p.getBBox() } catch { return null } })
    temps.forEach(p => p.remove())

    // Only split when all subpaths are visually disjoint — skips cutout/hole patterns
    const allDisjoint = bboxes.every((a, i) =>
      bboxes.every((b, j) => i === j || !a || !b || bboxDisjoint(a, b))
    )
    if (!allDisjoint) { finalRegions.push(region); continue }

    subpaths.forEach((sp, si) => {
      const newId = `${region.id}_p${si}`
      const newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      newPath.setAttribute('d', sp)
      newPath.setAttribute('fill', region.grayColor)
      newPath.setAttribute('data-rid', newId)
      applyStroke(newPath)
      el.parentNode?.insertBefore(newPath, el)
      finalRegions.push({ id: newId, primaryColor: region.primaryColor, colorAttr: 'fill', grayColor: region.grayColor })
    })
    el.remove()
  }

  return finalRegions
}

/**
 * Runs both splitters over an injected <svg>, returning the region list the
 * caller should keep. Both games do this right after mounting the markup.
 */
export function refineInjectedRegions(svgEl: SVGSVGElement, regions: Region[]): Region[] {
  return splitOverlappingRegions(svgEl, splitCompoundPaths(svgEl, regions))
}

/** Fetches `/flags/{code}.svg` and prepares it for painting. Null when unpaintable. */
export async function loadPaintableFlag(code: string): Promise<ProcessedFlag | null> {
  try {
    const resp = await fetch(`/flags/${code}.svg`)
    if (!resp.ok) return null
    return processFlag(await resp.text())
  } catch {
    return null
  }
}
