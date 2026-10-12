import type { Part } from '../types'

// An Svg's source is capped at 131,072 characters: JPEG widths and qualities
// to try, sharpest first, until the page fits with room for the card around
// it (look.ts).
export const SVG_ROOM = 125_000
export const JPEG_TRIES = [
  [720, 45],
  [680, 40],
  [600, 40],
  [520, 35],
  [440, 30],
] as const
export const PNG_WIDTH = 1000

const PRACTICE = /\b(ptq|plq|tut|tutorials?|practice|quiz(zes)?|worksheets?|papers?|tys|exercises?|questions?|prelims?|exams?)\b/i

export function isPractice(title: string): boolean {
  return PRACTICE.test(title)
}

// Every page's size from `pdfinfo -f 1 -l N`. A landscape page (a 2-up
// handout) becomes two parts, its halves, so each reads at sidebar width.
export function parseParts(pdfinfo: string): Part[] {
  const rotation = new Map<number, number>()
  for (const match of pdfinfo.matchAll(/^Page\s+(\d+) rot:\s+(\d+)/gm)) {
    rotation.set(Number(match[1]), Number(match[2]))
  }

  const parts: Part[] = []
  for (const match of pdfinfo.matchAll(/^Page\s+(\d+) size:\s+([\d.]+) x ([\d.]+)/gm)) {
    const page = Number(match[1])
    const isTurned = (rotation.get(page) ?? 0) % 180 !== 0
    const width = Number(isTurned ? match[3] : match[2])
    const height = Number(isTurned ? match[2] : match[3])
    if (width > height * 1.15) {
      parts.push({ page, half: 'left', width, height }, { page, half: 'right', width, height })
    } else {
      parts.push({ page, width, height })
    }
  }

  return parts
}

// pdftoppm arguments that render `part` `pixels` wide: the page at the DPI
// that makes it so, cropped to one half for a landscape page.
export function geometry(part: Part, pixels: number): { args: string[]; height: number } {
  const shownWidth = part.half === undefined ? part.width : part.width / 2
  const dpi = (pixels * 72) / shownWidth
  const height = Math.floor((part.height * dpi) / 72)
  const crop =
    part.half === undefined
      ? []
      : ['-x', part.half === 'left' ? '0' : String(pixels), '-y', '0', '-W', String(pixels), '-H', String(height)]
  const page = String(part.page)

  return { args: ['-f', page, '-l', page, '-r', dpi.toFixed(3), ...crop], height }
}
