import { expect, mock, test } from 'claude-code/testing'
import type { On, RenderPropsOf } from 'claude-code'

const PANE_PROPS: RenderPropsOf['Pane'] = {
  title: 'Study',
  isFocused: true,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
}

const PANE = { plugin: 'study-mode', component: 'Pane', requestId: 'study', props: PANE_PROPS } as const

const STUDY = {
  command: 'study',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const

const TURN_DONE = { answer: '', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as const

// The world beneath the plugin: what the engine would answer for each call.
function world(on: On, env: Record<string, string> = {}) {
  const seen = { opened: 0, closed: 0, toasts: [] as string[] }
  mock.store(on)
  mock.clock(on, { now: 1_000_000 })
  mock.env(on, env)
  on('fs.list', () => ({ value: [] }))
  on('command.register', () => ({ value: { command: 'study' } }))
  on('ui.open', () => {
    seen.opened += 1

    return { value: { isPlaced: true } }
  })
  on('ui.close', () => {
    seen.closed += 1

    return { value: undefined }
  })
  on('ui.focus', () => ({}))
  on('ui.toast', (_$, e) => {
    seen.toasts.push(e.text)

    return { value: undefined }
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))

  return seen
}

test('opens cards when Claude starts, grades them, closes when Claude is done', async ($, on) => {
  const seen = world(on)

  await $.turn.start({ text: 'fix the bug', turnId: 't1' })
  expect(seen.opened).toBe(1)

  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ key: 'reveal' })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'reveal' })
  expect(await ui.find({ key: 'got' })).toBeDefined()
  await ui.press({ key: 'got' })
  expect(await ui.find({ type: 'Text', text: /1 done, 1 got/ })).toBeDefined()
  await ui.press({ key: 'reveal' })
  await ui.press({ key: 'missed' })
  expect(await ui.find({ type: 'Text', text: /2 done, 1 got/ })).toBeDefined()

  await $.turn.complete(TURN_DONE)
  expect(seen.closed).toBe(1)
  expect(seen.toasts.at(-1)).toContain('2 cards, 1 got')
  expect(await ui.find({ type: 'Text', text: /Claude is done/ })).toBeDefined()
  await ui.unmount()
})

test("a subagent finishing does not close the cards", async ($, on) => {
  const seen = world(on)

  await $.turn.start({ text: 'research this', turnId: 't1' })
  await $.turn.complete({ ...TURN_DONE, turnId: 't2', agentId: 'a1' })
  expect(seen.closed).toBe(0)
})

test('/study off keeps the pane shut; /study phys focuses a deck', async ($, on) => {
  const seen = world(on)

  const off = await $.command.run({ ...STUDY, args: 'off' })
  expect(off.text).toContain('off')
  await $.turn.start({ text: 'refactor', turnId: 't1' })
  expect(seen.opened).toBe(0)

  await $.command.run({ ...STUDY, args: 'on' })
  const focus = await $.command.run({ ...STUDY, args: 'phys' })
  expect(focus.text).toContain('H2 Physics')
  await $.turn.start({ text: 'refactor', turnId: 't2' })
  expect(seen.opened).toBe(1)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /H2 Physics/ })).toBeDefined()
  await ui.unmount()
})

test("reads the person's own Q:/A: deck from ~/.claude/study", async ($, on) => {
  on('fs.list', { path: '/home/ashton/.claude/study' }, () => ({
    value: [{ name: 'gp.md', kind: 'file', size: 1, mtimeMs: 0, isLink: false }],
  }))
  on('fs.read', { path: '/home/ashton/.claude/study/gp.md' }, () => ({
    value: '# H1 GP\n\nQ: What is a counter-argument?\nA: An opposing view,\nthen rebutted.\n',
  }))
  world(on, { HOME: '/home/ashton' })

  const focus = await $.command.run({ ...STUDY, args: 'gp' })
  expect(focus.text).toContain('H1 GP')
  await $.turn.start({ text: 'go', turnId: 't1' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Markdown', text: /counter-argument/ })).toBeDefined()
  await ui.press({ key: 'reveal' })
  expect(await ui.find({ type: 'Markdown', text: /An opposing view,\nthen rebutted\./ })).toBeDefined()
  await ui.unmount()
})
