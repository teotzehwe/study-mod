// The Reports design system (Amplify's look) for the surfaces that draw
// pictures: its tokens and five grounds, and its masthead, callout, priority
// box and page card, each an SVG. Values are the system's tokens.json; sizes
// are its CSS pixels doubled, since the pane draws these 720 wide and the
// surface fits them to the pane as it fits the page. Each SVG carries both
// themes and follows the reader's through prefers-color-scheme.

export const WIDTH = 720

export type Ground = 'cream' | 'lilac' | 'sage' | 'peach' | 'butter'
const GROUNDS: readonly Ground[] = ['cream', 'lilac', 'sage', 'peach', 'butter']

// Each ground swaps the page colour and its well; nothing else changes.
const GROUND: Record<Ground, { light: [string, string]; dark: [string, string] }> = {
  cream: { light: ['#F4F0E8', '#EFE9DF'], dark: ['#141518', '#2A2A2F'] },
  lilac: { light: ['#F4EEF6', '#ECE3F0'], dark: ['#17141A', '#2C2632'] },
  sage: { light: ['#ECF1E8', '#E1E9DC'], dark: ['#131714', '#252B26'] },
  peach: { light: ['#F8EDE6', '#F2E2D8'], dark: ['#1A1614', '#302824'] },
  butter: { light: ['#F8F1DC', '#F1E8CC'], dark: ['#181712', '#2D2A20'] },
}

const LIGHT = {
  paper: '#FFFFFF',
  'line-strong': 'rgba(142,73,154,0.28)',
  ink: '#1B1D21',
  'ink-muted': '#606161',
  'purple-ink': '#6B3475',
  press: '#5A2D66',
  'press-ink': '#1B1D21',
  'danger-ink': '#9A2E2E',
  'glow-orange': 'rgba(252,107,53,0.14)',
  'glow-purple': 'rgba(142,73,154,0.16)',
  'glow-yellow': 'rgba(253,195,35,0.16)',
}
const DARK: typeof LIGHT = {
  paper: '#1E1F23',
  'line-strong': 'rgba(200,139,211,0.32)',
  ink: '#F2EEE6',
  'ink-muted': '#B9B4AC',
  'purple-ink': '#D8AEE0',
  press: '#B583C0',
  'press-ink': '#000000',
  'danger-ink': '#F6A3A3',
  'glow-orange': 'rgba(252,107,53,0.10)',
  'glow-purple': 'rgba(200,139,211,0.12)',
  'glow-yellow': 'rgba(253,195,35,0.08)',
}
// The same in both themes: the priority box keeps dark text on yellow.
const YELLOW = '#FDC323'
const ON_YELLOW = '#1B1D21'

const DISPLAY = `"Inter Tight", "PP Neue Montreal", ui-sans-serif, system-ui, sans-serif`
const BODY = `Inter, "PP Neue Montreal", ui-sans-serif, system-ui, sans-serif`

// A ground per subject, so subjects are told apart at a glance; the ground
// carries no meaning. No subject (the top folder) is cream, the default.
export function groundFor(subjectId: string | undefined): Ground {
  if (subjectId === undefined) return 'cream'
  let hash = 0
  for (const char of subjectId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0

  return GROUNDS[hash % GROUNDS.length] ?? 'cream'
}

function vars(tokens: typeof LIGHT, ground: [string, string]): string {
  const pairs = { ...tokens, ground: ground[0], well: ground[1] }

  return Object.entries(pairs)
    .map(([name, value]) => `--${name}:${value}`)
    .join(';')
}

function style(ground: Ground): string {
  return (
    `<style>` +
    `svg{${vars(LIGHT, GROUND[ground].light)}}` +
    `@media (prefers-color-scheme:dark){svg{${vars(DARK, GROUND[ground].dark)}}}` +
    `text{font-family:${BODY}}` +
    `.d{font-family:${DISPLAY}}` +
    `</style>`
  )
}

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`)
}

// Width of a line of text, estimated from its characters, at `size` px.
// Conservative, so a wrapped line fits whichever face of the stack draws it.
export function measure(text: string, size: number, opts: { bold?: boolean; tracking?: number } = {}): number {
  let ems = 0
  for (const char of text) {
    if (char === ' ') ems += 0.28
    else if (/[A-Z]/.test(char)) ems += /[MW]/.test(char) ? 0.84 : /[IJ]/.test(char) ? 0.3 : 0.64
    else if (/[0-9]/.test(char)) ems += 0.56
    else if (/[a-z]/.test(char)) ems += /[iljtf]/.test(char) ? 0.28 : /[mw]/.test(char) ? 0.8 : 0.52
    else ems += 0.34
  }
  const chars = [...text].length

  return size * (ems * (opts.bold === true ? 1.06 : 1) + (opts.tracking ?? 0) * chars)
}

// Words into lines of at most `width`, at most `maxLines`, the last cut with
// an ellipsis when the words run over.
export function wrap(
  text: string,
  width: number,
  size: number,
  opts: { bold?: boolean; tracking?: number; maxLines?: number } = {},
): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line === '' ? word : `${line} ${word}`
    if (line !== '' && measure(next, size, opts) > width) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line !== '') lines.push(line)

  const max = opts.maxLines ?? Infinity
  if (lines.length <= max) return lines
  const kept = lines.slice(0, max)
  let last = `${kept[max - 1]} ${lines[max]}`
  while (last.length > 1 && measure(`${last}…`, size, opts) > width) last = last.slice(0, -1).trimEnd()
  kept[max - 1] = `${last}…`

  return kept
}

export type Chip = { text: string; isWarning?: boolean }

export type Drawing = { source: string; alt: string; height: number }

// The masthead: eyebrow, title, pressed meta chips, on the ground with its
// glow. The glow belongs to the masthead only.
export function masthead(input: { ground: Ground; eyebrow: string[]; title: string; chips: Chip[] }): Drawing {
  const pad = 40
  const inner = WIDTH - pad * 2
  const eyebrow = input.eyebrow.join(' · ').toUpperCase()
  const eyebrowLine = wrap(eyebrow, inner, 24, { bold: true, tracking: 0.12, maxLines: 1 })[0] ?? ''
  const titleLines = wrap(input.title, inner, 44, { bold: true, tracking: -0.03, maxLines: 3 })

  let y = pad
  let body = ''
  if (eyebrowLine !== '') {
    y += 24
    body += `<text x="${pad}" y="${y}" font-size="24" font-weight="700" letter-spacing="2.9" fill="var(--purple-ink)">${escapeXml(eyebrowLine)}</text>`
    y += 22
  }
  for (const [index, line] of titleLines.entries()) {
    y += index === 0 ? 44 : 50
    body += `<text class="d" x="${pad}" y="${y}" font-size="44" font-weight="700" letter-spacing="-1.3" fill="var(--ink)">${escapeXml(line)}</text>`
  }

  // Chips: 3px press border, the hard 5px press under it, 16px corners.
  const chipHeight = 58
  let x = pad
  let rowTop = y + 28
  let chips = ''
  for (const chip of input.chips) {
    const width = Math.ceil(measure(chip.text, 26, { bold: true }) + 2 * 24 + 2 * 6)
    if (x > pad && x + width > WIDTH - pad) {
      x = pad
      rowTop += chipHeight + 10 + 16
    }
    const edge = chip.isWarning === true ? 'var(--danger-ink)' : 'var(--press)'
    const ink = chip.isWarning === true ? 'var(--danger-ink)' : 'var(--ink)'
    chips +=
      `<rect x="${x}" y="${rowTop + 10}" width="${width}" height="${chipHeight}" rx="32" fill="${edge}"/>` +
      `<rect x="${x + 3}" y="${rowTop + 3}" width="${width - 6}" height="${chipHeight - 6}" rx="29" fill="var(--paper)" stroke="${edge}" stroke-width="6"/>` +
      `<text x="${x + width / 2}" y="${rowTop + 38}" text-anchor="middle" font-size="26" font-weight="600" fill="${ink}">${escapeXml(chip.text)}</text>`
    x += width + 16
  }
  const height = (input.chips.length > 0 ? rowTop + chipHeight + 10 : y) + pad

  const glow = (id: string, cx: string, cy: string, r: string, token: string) =>
    `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"><stop offset="0" stop-color="var(--${token})"/><stop offset="1" stop-color="var(--${token})" stop-opacity="0"/></radialGradient>`
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}">` +
    style(input.ground) +
    `<defs>${glow('o', '0', '0', '0.7', 'glow-orange')}${glow('p', '1', '0', '0.65', 'glow-purple')}${glow('y', '0.75', '1', '0.6', 'glow-yellow')}</defs>` +
    `<rect width="${WIDTH}" height="${height}" rx="44" fill="var(--ground)"/>` +
    `<rect width="${WIDTH}" height="${height}" rx="44" fill="url(#o)"/>` +
    `<rect width="${WIDTH}" height="${height}" rx="44" fill="url(#p)"/>` +
    `<rect width="${WIDTH}" height="${height}" rx="44" fill="url(#y)"/>` +
    body +
    chips +
    `</svg>`
  const chipLine = input.chips.map(chip => chip.text).join(' · ')
  const alt = `${input.eyebrow.join(' · ')}: ${input.title}.${chipLine === '' ? '' : ` ${chipLine}.`}`

  return { source, alt, height }
}

// A callout on the ground's well, opened by a bold purple lead-in; or, with
// `isPriority`, the one yellow box: yellow fill, dark text and border, the
// hard ink press.
export function callout(input: { ground: Ground; lead: string; text: string; isPriority?: boolean }): Drawing {
  const padX = 48
  const padY = 32
  const size = 32
  const leading = 48
  const isPriority = input.isPriority === true
  const lines = wrap(`${input.lead} ${input.text}`, WIDTH - padX * 2 - (isPriority ? 12 : 0), size)
  const boxHeight = padY * 2 + lines.length * leading - (leading - size)
  const height = boxHeight + (isPriority ? 10 : 0)

  const leadInk = isPriority ? ON_YELLOW : 'var(--purple-ink)'
  const ink = isPriority ? ON_YELLOW : 'var(--ink)'
  let text = ''
  let leadLeft = input.lead.split(/\s+/).filter(Boolean).length
  for (const [index, line] of lines.entries()) {
    const words = line.split(' ')
    const leadWords = Math.min(leadLeft, words.length)
    leadLeft -= leadWords
    const lead = words.slice(0, leadWords).join(' ')
    const rest = words.slice(leadWords).join(' ')
    const y = padY + size * 0.82 + index * leading + (isPriority ? 3 : 0)
    text +=
      `<text x="${padX}" y="${y}" font-size="${size}" fill="${ink}">` +
      (lead === '' ? '' : `<tspan font-weight="700" fill="${leadInk}">${escapeXml(lead)}</tspan>`) +
      (rest === '' ? '' : `${lead === '' ? '' : ' '}${escapeXml(rest)}`) +
      `</text>`
  }

  const box = isPriority
    ? `<rect x="0" y="10" width="${WIDTH}" height="${boxHeight}" rx="32" fill="var(--press-ink)"/>` +
      `<rect x="3" y="3" width="${WIDTH - 6}" height="${boxHeight - 6}" rx="29" fill="${YELLOW}" stroke="${ON_YELLOW}" stroke-width="6"/>`
    : `<rect width="${WIDTH}" height="${boxHeight}" rx="28" fill="var(--well)"/>`
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}">` +
    style(input.ground) +
    box +
    text +
    `</svg>`

  return { source, alt: `${input.lead} ${input.text}`, height }
}

// The page as a card: the rendered JPEG clipped to 14px corners inside the
// 2px line-strong border cards carry. Borders, not shadows, separate cards.
export function pageCard(jpegBase64: string, width: number, height: number): string {
  const r = Math.round((28 * width) / WIDTH)
  const border = Math.max(2, Math.round((4 * width) / WIDTH))

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
    style('cream') +
    `<defs><clipPath id="c"><rect width="${width}" height="${height}" rx="${r}"/></clipPath></defs>` +
    `<image href="data:image/jpeg;base64,${jpegBase64}" width="${width}" height="${height}" clip-path="url(#c)"/>` +
    `<rect x="${border / 2}" y="${border / 2}" width="${width - border}" height="${height - border}" rx="${r - border / 2}" fill="none" stroke="var(--line-strong)" stroke-width="${border}"/>` +
    `</svg>`
  )
}
