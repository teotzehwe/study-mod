import { expect, mock, test } from 'claude-code/testing'
import type { On, RenderPropsOf, RenderSurface } from 'claude-code'

const PANE_PROPS: RenderPropsOf['Pane'] = {
  title: 'Study',
  isFocused: true,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}
const PANE = { plugin: 'study-mode', component: 'Pane', requestId: 'study', props: PANE_PROPS } as const
const STUDY = {
  command: 'study',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const
const TURN_DONE = { answer: '', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as const

// A Drive: GoodNotes / H2 Physics / two PDFs, one a 2-page portrait set of
// notes, one a 1-page landscape (2-up) practice quiz.
const DRIVE: Record<string, object[]> = {
  root: [{ id: 'gn', title: 'GoodNotes', mimeType: 'application/vnd.google-apps.folder' }],
  gn: [{ id: 'phys', title: 'H2 Physics', mimeType: 'application/vnd.google-apps.folder' }],
  phys: [
    { id: 'ptq', title: 'Oscillations PTQ 2026.pdf', mimeType: 'application/pdf', modifiedTime: '2026-08-25T08:35:40Z' },
    { id: 'notes', title: '07 Oscillations Notes.pdf', mimeType: 'application/pdf', modifiedTime: '2026-08-25T08:35:36Z' },
    { id: 'jpg', title: 'photo.jpg', mimeType: 'image/jpeg' },
  ],
}
const PDFINFO: Record<string, string> = {
  notes: 'Page    1 size: 595.32 x 841.92 pts (A4)\nPage    2 size: 595.32 x 841.92 pts (A4)\n',
  ptq: 'Page    1 size: 841.92 x 595.32 pts (A4)\n',
}

type Seen = { opened: number; closed: number; toasts: string[]; downloads: string[]; renders: string[][] }

// The Drive connector as a local session names it, unlike the cloud's.
const LOCAL_DRIVE = 'claude_ai_Google_Drive'
// As the desktop app's sessions name it: by the connector's id alone.
const DESKTOP_DRIVE = '0f3c2a9e-5b1d-4c7a-9e2f-6d8b1a4c3e70'

function world(on: On, surfaces: readonly RenderSurface[] = ['desktop'], drive: string | null = LOCAL_DRIVE) {
  const seen: Seen = { opened: 0, closed: 0, toasts: [], downloads: [], renders: [] }
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  mock.env(on, { HOME: '/home/ashton' })

  on('tool.list', () => ({
    value: [
      { name: 'Read', description: 'Reads a file.', mcp: false },
      // Another server with a search_files of its own, listed first: not Drive.
      { name: 'mcp__notes_app__search_files', description: 'Search notes.', mcp: true },
      ...(drive === null
        ? []
        : [
            { name: `mcp__${drive}__search_files`, description: 'Search Drive.', mcp: true },
            { name: `mcp__${drive}__download_file_content`, description: 'Download a Drive file.', mcp: true },
          ]),
    ],
  }))
  on('mcp.call', (_$, e) => {
    if (e.server !== drive) return { deny: `no connected MCP tool "${e.tool}" on a server named "${e.server}"` }
    if (e.tool === 'search_files') {
      const query = String(e.args.query)
      const parent = /parentId = '([^']+)'/.exec(query)?.[1]
      const files = parent === undefined ? DRIVE.root : (DRIVE[parent] ?? [])

      return { value: { content: [{ type: 'text', text: JSON.stringify({ files }) }], isError: false } }
    }
    seen.downloads.push(String(e.args.fileId))

    return { value: { content: [{ type: 'text', text: JSON.stringify({ content: 'JVBERi0=' }) }], isError: false } }
  })
  on('process.run', (_$, e) => {
    const [tool] = e.argv
    if (tool === 'pdftoppm') seen.renders.push([...e.argv])
    const pdf = e.argv.find(arg => arg.endsWith('.pdf')) ?? ''
    const stdout = tool === 'pdfinfo' ? (PDFINFO[pdf.includes('/ptq-') ? 'ptq' : 'notes'] ?? '') : ''

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.exists', () => ({ value: false }))
  on('fs.read', () => ({ value: { base64: '/9j/4AAQ' } }))
  on('session.surfaces', () => ({ value: surfaces }))
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

  return { seen, clock }
}

test('Claude starts: the GoodNotes folder opens; a PDF pages through; Claude done: it closes', async ($, on) => {
  const { seen, clock } = world(on)

  await $.turn.start({ text: 'fix the bug', turnId: 't1' })
  await clock.settle()
  expect(seen.opened).toBe(1)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'GoodNotes' })).toBeDefined()
  await ui.press({ key: 'entry:phys' })
  expect(await ui.find({ type: 'Text', text: 'GoodNotes / H2 Physics' })).toBeDefined()
  expect(await ui.find({ key: 'entry:jpg' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Button' })).map(button => button.text)).toEqual([
    '◀ Up',
    '  07 Oscillations Notes',
    '  Oscillations PTQ 2026',
  ])

  await ui.press({ key: 'entry:notes' })
  expect(seen.downloads).toEqual(['notes'])
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Page 1 of 2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /recall the key points/ })).toBeDefined()

  await ui.press({ key: 'next' })
  expect(await ui.find({ type: 'Text', text: /Page 2 of 2 · 1 covered/ })).toBeDefined()

  await $.turn.complete(TURN_DONE)
  expect(seen.closed).toBe(1)
  expect(seen.toasts.at(-1)).toContain('1 page of 07 Oscillations Notes, bookmarked')
  await ui.unmount()
})

test('a landscape practice sheet reads in halves and asks for written work', async ($, on) => {
  const { seen, clock } = world(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })
  await ui.press({ key: 'entry:phys' })
  await ui.press({ key: 'entry:ptq' })

  expect(await ui.find({ type: 'Text', text: /Page 1 of 1 \(left half\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /on paper/ })).toBeDefined()
  expect((await ui.find({ key: 'next' }))?.text).toContain('Wrote it')
  expect(seen.renders.at(-1)).toContain('-W')

  await ui.press({ key: 'next' })
  expect(await ui.find({ type: 'Text', text: /\(right half\)/ })).toBeDefined()
  await ui.unmount()
})

test('the next wait resumes the same file at the bookmarked page', async ($, on) => {
  const { seen, clock } = world(on)

  await $.turn.start({ text: 'one', turnId: 't1' })
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'entry:phys' })
  await ui.press({ key: 'entry:notes' })
  await ui.press({ key: 'next' })
  await $.turn.complete(TURN_DONE)
  await ui.unmount()

  await $.turn.start({ text: 'two', turnId: 't2' })
  await clock.settle()
  const again = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await again.find({ type: 'Text', text: /Page 2 of 2 · 0 covered/ })).toBeDefined()
  expect(seen.opened).toBe(2)
  await again.unmount()
})

test('the terminal draws the page as an image from a PNG', async ($, on) => {
  const { clock } = world(on, ['terminal'])

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'entry:phys' })
  await ui.press({ key: 'entry:notes' })
  expect(await ui.find({ type: 'Image' })).toBeDefined()
  await ui.unmount()
})

test('a subagent finishing does not close the notes; /study off keeps them shut', async ($, on) => {
  const { seen, clock } = world(on)

  await $.turn.start({ text: 'research', turnId: 't1' })
  await $.turn.complete({ ...TURN_DONE, turnId: 't2', agentId: 'a1' })
  expect(seen.closed).toBe(0)

  const off = await $.command.run({ ...STUDY, args: 'off' })
  expect(off.text).toContain('off')
  expect(seen.closed).toBe(1)
  await $.turn.start({ text: 'again', turnId: 't3' })
  await clock.settle()
  expect(seen.opened).toBe(1)
})

test('/study while Claude works opens the notes on request', async ($, on) => {
  const { seen, clock } = world(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.settle()
  const shown = await $.command.run({ ...STUDY, args: '' })
  expect(shown.text).toBe('Notes opened.')
  expect(seen.opened).toBe(2)

  await $.turn.complete(TURN_DONE)
  const status = await $.command.run({ ...STUDY, args: '' })
  expect(status.text).toContain('Study mode: on')
})

test('with no Drive connector, the pane says how to connect one', async ($, on) => {
  const { clock } = world(on, ['desktop'], null)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /not connected in this session.*Settings → Connectors/ })).toBeDefined()
  await ui.unmount()
})

test('a desktop session names Drive by its id alone: the notes still open', async ($, on) => {
  const { seen, clock } = world(on, ['desktop'], DESKTOP_DRIVE)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'entry:phys' })).toBeDefined()
  await ui.press({ key: 'entry:phys' })
  await ui.press({ key: 'entry:notes' })
  expect(seen.downloads).toEqual(['notes'])
  await ui.unmount()
})
