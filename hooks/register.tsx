import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Card, Progress, Tally } from '../types'
import { deckNames, grade, matchDeck, parseDeck, pickCard } from './cards'
import { STARTER_DECKS } from './decks'

const PANE = 'study'
const DECK_DIRS = ['.claude/study']

const card = atom({ plugin: 'study-mode', key: 'card' } as const, null)
const box = atom({ plugin: 'study-mode', key: 'box' } as const, 0)
const isRevealed = atom({ plugin: 'study-mode', key: 'isRevealed' } as const, false)
const isWorking = atom({ plugin: 'study-mode', key: 'isWorking' } as const, false)
const tally = atom({ plugin: 'study-mode', key: 'tally' } as const, { seen: 0, got: 0 })

// Starter decks, then every *.md under ~/.claude/study and <project>/.claude/study.
async function loadCards($: EngineInterface): Promise<Card[]> {
  const cards = STARTER_DECKS.flatMap((text, i) => parseDeck(text, `Starter ${i + 1}`))
  const home = await $.env.get('HOME')
  const dirs = home === undefined ? DECK_DIRS : [`${home}/.claude/study`, ...DECK_DIRS]

  for (const dir of dirs) {
    const entries = await $.fs.list(dir).catch(() => [])
    for (const entry of entries) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue
      const text = await $.fs.read(`${dir}/${entry.name}`).catch(() => '')
      cards.push(...parseDeck(text, entry.name.replace(/\.md$/, '')))
    }
  }

  const byId = new Map(cards.map(one => [one.id, one]))

  return [...byId.values()]
}

async function progressOf($: EngineInterface): Promise<Progress> {
  return ((await $.store.get('progress')) ?? {}) as Progress
}

async function showNext($: EngineInterface, skipId?: string): Promise<void> {
  const all = await loadCards($)
  const focus = await $.store.get('deck')
  const inFocus = all.filter(one => one.deck === focus)
  const pool = inFocus.length > 0 ? inFocus : all
  const progress = await progressOf($)
  const picked = pickCard(pool, progress, await $.clock.now(), skipId)

  await update($, card, () => picked)
  await update($, box, () => (picked === null ? 0 : (progress[picked.id]?.box ?? 0)))
  await update($, isRevealed, () => false)
}

async function reveal($: EngineInterface): Promise<void> {
  await update($, isRevealed, () => true)
  await $.ui.focus({ requestId: PANE, key: 'got' }).catch(() => undefined)
}

async function answer($: EngineInterface, isGot: boolean): Promise<void> {
  const current = await read($, card)
  if (current === null || !(await read($, isRevealed))) return
  await update($, isRevealed, () => false)

  const now = await $.clock.now()
  await $.store.set('progress', grade(await progressOf($), current.id, isGot, now))
  const totals = ((await $.store.get('totals')) ?? { seen: 0, got: 0 }) as Tally
  await $.store.set('totals', { seen: totals.seen + 1, got: totals.got + (isGot ? 1 : 0) })
  await update($, tally, t => ({ seen: t.seen + 1, got: t.got + (isGot ? 1 : 0) }))

  await showNext($, current.id)
  await $.ui.focus({ requestId: PANE, key: 'reveal' }).catch(() => undefined)
}

async function stopStudying($: EngineInterface): Promise<void> {
  await update($, isWorking, () => false)
  await $.ui.close({ id: PANE })
}

async function statusText($: EngineInterface): Promise<string> {
  const all = await loadCards($)
  const progress = await progressOf($)
  const now = await $.clock.now()
  const isOn = (await $.store.get('enabled')) !== false
  const focus = await $.store.get('deck')
  const totals = ((await $.store.get('totals')) ?? { seen: 0, got: 0 }) as Tally
  const due = all.filter(one => (progress[one.id]?.due ?? Infinity) <= now).length
  const fresh = all.filter(one => progress[one.id] === undefined).length
  const decks = deckNames(all).map(name => `${name} (${all.filter(one => one.deck === name).length})`)
  const rate = totals.seen === 0 ? '' : `, ${Math.round((100 * totals.got) / totals.seen)}% got`

  return [
    `Study mode: ${isOn ? 'on' : 'off'} · deck: ${typeof focus === 'string' ? focus : 'all'}`,
    `Decks: ${decks.join(', ')}`,
    `Due now: ${due} · new: ${fresh} · studied so far: ${totals.seen}${rate}`,
    'Add your own: Q:/A: Markdown files in ~/.claude/study/ or .claude/study/',
    'Usage: /study on | off | all | <deck name>',
  ].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'study',
      description: 'Flashcards while Claude works: on, off, all, or a deck name',
      argumentHint: '[on|off|all|<deck>]',
      immediate: true,
    })

    return next(e)
  })

  // Claude starts working: open the cards. A subagent's run raises no turn.start.
  on('turn.start', async ($, e, next) => {
    if ((await $.store.get('enabled')) !== false) {
      await update($, tally, () => ({ seen: 0, got: 0 }))
      await update($, isWorking, () => true)
      await showNext($)
      const opened = await $.ui.open({ id: PANE, title: 'Study', focus: true })
      if (!opened.isPlaced) $.ui.toast(`study-mode: pane waiting (${opened.reason})`)
    }

    return next(e)
  })

  // Claude is done: close the cards and send the person back to the code.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && (await read($, isWorking))) {
      await stopStudying($)
      const { seen, got } = await read($, tally)
      $.ui.toast(
        seen === 0
          ? "Claude's done. Go check the changes."
          : `Claude's done: ${seen} card${seen === 1 ? '' : 's'}, ${got} got. Go check the changes.`,
      )
    }

    return next(e)
  })

  // No closing the pane by hand while Claude works; /study off is the way out.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person' && (await read($, isWorking))) {
      $.ui.toast('Cards stay up until Claude is done. /study off to turn study mode off.')

      return { value: undefined }
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'study' }, async ($, e) => {
    const arg = e.args.trim()

    if (arg === 'off') {
      await $.store.set('enabled', false)
      if (await read($, isWorking)) await stopStudying($)

      return { text: 'Study mode off. /study on to turn it back on.' }
    }
    if (arg === 'on') {
      await $.store.set('enabled', true)

      return { text: 'Study mode on: flashcards open each time Claude starts working.' }
    }
    if (arg === 'all') {
      await $.store.delete('deck')

      return { text: 'Studying every deck.' }
    }
    if (arg !== '') {
      const all = await loadCards($)
      const name = matchDeck(all, arg)
      if (name === undefined) {
        return { text: `No deck matches "${arg}". Decks: ${deckNames(all).join(', ')}` }
      }
      await $.store.set('deck', name)

      return { text: `Studying ${name} only. /study all to mix every deck.` }
    }

    return { text: await statusText($) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const current = await read($, card)
    const shown = await read($, isRevealed)
    const level = await read($, box)
    const { seen, got } = await read($, tally)

    if (!(await read($, isWorking))) {
      return <Text dimColor>Claude is done. Back to the code.</Text>
    }
    if (current === null) {
      return (
        <Box flexDirection="column">
          <Text>No cards yet.</Text>
          <Text dimColor>Add Q:/A: Markdown decks to ~/.claude/study/</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>
          {current.deck} · {level === 0 ? 'new' : `box ${level}`} · this wait: {seen} done, {got} got
        </Text>
        <Markdown key="q" text={`**${current.q}**`} />
        {shown ? (
          <Box flexDirection="column" gap={1}>
            <Markdown key="a" text={current.a} />
            <Box flexDirection="row" gap={2}>
              <Button
                key="got"
                label="Got it"
                hotkey="y"
                variant="primary"
                autoFocus
                onPress={() => answer($, true)}
              />
              <Button key="missed" label="Missed" hotkey="n" onPress={() => answer($, false)} />
            </Box>
          </Box>
        ) : (
          <Button
            key="reveal"
            label="Reveal answer"
            hotkey="r"
            variant="primary"
            autoFocus
            onPress={() => reveal($)}
          />
        )}
        <Text dimColor>Closes when Claude is done.</Text>
      </Box>
    )
  })
}
