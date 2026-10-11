import type { Card, Progress } from '../types'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

// Leitner boxes: a miss drops a card to box 1 (back within minutes), a hit
// moves it up one box, each box waiting longer before the card is due again.
const WAIT_BY_BOX = [0, 2 * MINUTE, DAY, 3 * DAY, 7 * DAY, 21 * DAY]
const TOP_BOX = WAIT_BY_BOX.length - 1

// FNV-1a: a stable id for a card from its deck and question, so progress
// survives edits to the answer and reordering of the file.
function cardId(deck: string, q: string): string {
  let hash = 0x811c9dc5
  for (const ch of `${deck}\n${q}`) {
    hash ^= ch.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return hash.toString(16).padStart(8, '0')
}

// A deck is Markdown: an optional `# Name` heading, then `Q:` / `A:` pairs.
// A line that starts neither continues the field above it.
export function parseDeck(text: string, fallbackName: string): Card[] {
  let deck = fallbackName
  const cards: Card[] = []
  let q: string[] | null = null
  let a: string[] | null = null
  let field: 'q' | 'a' | null = null

  const flush = () => {
    const question = q?.join('\n').trim() ?? ''
    const answer = a?.join('\n').trim() ?? ''
    if (question !== '' && answer !== '') {
      cards.push({ id: cardId(deck, question), deck, q: question, a: answer })
    }
    q = null
    a = null
    field = null
  }

  for (const line of text.split(/\r?\n/)) {
    const heading = /^#\s+(.+)$/.exec(line)
    if (heading !== null && cards.length === 0 && q === null) {
      deck = (heading[1] ?? deck).trim()
      continue
    }
    const qLine = /^Q:\s?(.*)$/.exec(line)
    if (qLine !== null) {
      flush()
      q = [qLine[1] ?? '']
      field = 'q'
      continue
    }
    const aLine = /^A:\s?(.*)$/.exec(line)
    if (aLine !== null && q !== null) {
      a = [aLine[1] ?? '']
      field = 'a'
      continue
    }
    if (field === 'q') q?.push(line)
    if (field === 'a') a?.push(line)
  }
  flush()

  return cards
}

export function deckNames(cards: readonly Card[]): string[] {
  return [...new Set(cards.map(card => card.deck))]
}

// Matches `/study phys` to "H2 Physics": case-insensitive substring.
export function matchDeck(cards: readonly Card[], query: string): string | undefined {
  const needle = query.trim().toLowerCase()

  return deckNames(cards).find(name => name.toLowerCase().includes(needle))
}

// Due cards first (lowest box, then oldest), then cards never seen, then the
// card due soonest, so there is always something to study.
export function pickCard(
  cards: readonly Card[],
  progress: Progress,
  now: number,
  skipId?: string,
): Card | null {
  const pool = cards.length > 1 ? cards.filter(card => card.id !== skipId) : cards
  const seen = pool.flatMap(card => {
    const state = progress[card.id]

    return state === undefined ? [] : [{ card, ...state }]
  })
  const due = seen.filter(one => one.due <= now).sort((x, y) => x.box - y.box || x.due - y.due)
  const fresh = pool.filter(card => progress[card.id] === undefined)
  const soonest = [...seen].sort((x, y) => x.due - y.due)

  return (
    due[0]?.card ??
    fresh[Math.floor(Math.random() * fresh.length)] ??
    soonest[0]?.card ??
    null
  )
}

export function grade(progress: Progress, id: string, isGot: boolean, now: number): Progress {
  const box = isGot ? Math.min(TOP_BOX, Math.max(2, (progress[id]?.box ?? 0) + 1)) : 1

  return { ...progress, [id]: { box, due: now + (WAIT_BY_BOX[box] ?? 0) } }
}
