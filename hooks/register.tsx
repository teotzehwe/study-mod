import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Doc, Entry, Folder, Part, Shown } from '../types'
import type { DriveFile, SearchPage } from './drive'
import { childrenQuery, downloadArgs, DRIVE_SERVERS, folderQuery, parseResult, searchArgs, toEntries } from './drive'
import { geometry, isPractice, JPEG_TRIES, parseParts, PNG_WIDTH, SVG_ROOM, svgOf } from './pages'

const PANE = 'study'
const DEFAULT_ROOT = 'GoodNotes'

const isWorking = atom({ plugin: 'study-mode', key: 'isWorking' } as const, false)
const view = atom({ plugin: 'study-mode', key: 'view' } as const, 'browse')
const trail = atom({ plugin: 'study-mode', key: 'trail' } as const, [])
const entries = atom({ plugin: 'study-mode', key: 'entries' } as const, [])
const doc = atom({ plugin: 'study-mode', key: 'doc' } as const, null)
const part = atom({ plugin: 'study-mode', key: 'part' } as const, 0)
const shown = atom({ plugin: 'study-mode', key: 'shown' } as const, null)
const status = atom({ plugin: 'study-mode', key: 'status' } as const, null)
const covered = atom({ plugin: 'study-mode', key: 'covered' } as const, 0)

type LastOpened = { entry: Entry; trail: Folder[] }

// Google Drive, through the session's own connector.

async function callDrive($: EngineInterface, tool: string, args: Record<string, unknown>): Promise<unknown> {
  let failure: unknown = new Error('Google Drive is not connected')
  for (const server of DRIVE_SERVERS) {
    try {
      return parseResult(tool, await $.mcp.call(server, tool, args))
    } catch (error) {
      failure = error
    }
  }
  throw failure
}

async function searchDrive($: EngineInterface, query: string): Promise<DriveFile[]> {
  const files: DriveFile[] = []
  let pageToken: string | undefined
  for (let page = 0; page < 5; page++) {
    const out = (await callDrive($, 'search_files', searchArgs(query, pageToken))) as SearchPage
    const batch = out.files ?? []
    files.push(...batch)
    pageToken = out.nextPageToken
    if (batch.length === 0 || pageToken === undefined) break
  }

  return files
}

async function findFolder($: EngineInterface, name: string): Promise<Folder | null> {
  const [first] = await searchDrive($, folderQuery(name))

  return first === undefined ? null : { id: first.id, title: first.title }
}

// The PDF on disk, cached by file id and Drive's modified time.
async function fetchPdf($: EngineInterface, entry: Entry): Promise<string> {
  const file = `${await cacheDir($)}/${entry.id}-${entry.modifiedTime.replace(/\W/g, '')}.pdf`
  if (await $.fs.exists(file)) return file

  const out = (await callDrive($, 'download_file_content', downloadArgs(entry))) as { content?: string }
  if (typeof out.content !== 'string' || out.content === '') {
    throw new Error(`Drive sent no content for ${entry.title}`)
  }
  await run($, ['sh', '-c', 'mkdir -p "$(dirname "$0")" && base64 --decode > "$0"', file], out.content)

  return file
}

// Pages, drawn by poppler's pdfinfo and pdftoppm on the machine Claude runs on.

// An app started from the Dock often lacks Homebrew's folders on its PATH,
// so poppler's tools are looked for there before the bare name.
const BIN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']
const found = new Map<string, string>()

async function bin($: EngineInterface, name: string): Promise<string> {
  const known = found.get(name)
  if (known !== undefined) return known
  for (const dir of BIN_DIRS) {
    if (await $.fs.exists(`${dir}/${name}`)) {
      found.set(name, `${dir}/${name}`)

      return `${dir}/${name}`
    }
  }

  return name
}

async function run($: EngineInterface, argv: string[], stdin?: string): Promise<string> {
  const out = await $.process.run(argv, { timeoutMs: 120_000, ...(stdin === undefined ? {} : { stdin }) })
  if (out.exitCode !== 0) {
    const reason = out.stderr.trim().split('\n').at(-1) ?? ''
    throw new Error(`${argv[0]} failed${reason === '' ? '' : `: ${reason}`}`)
  }

  return out.stdout
}

async function cacheDir($: EngineInterface): Promise<string> {
  return `${(await $.env.get('HOME')) ?? '/tmp'}/.cache/study-mode`
}

async function renderPart(
  $: EngineInterface,
  path: string,
  target: Part,
  want: { svg: boolean; png: boolean },
  generation: number,
): Promise<Shown> {
  const out = `${await cacheDir($)}/page`
  const picture: Shown = { width: 1, height: 1, generation }

  if (want.svg) {
    for (const [pixels, quality] of JPEG_TRIES) {
      const { args, height } = geometry(target, pixels)
      await run($, [await bin($, 'pdftoppm'), ...args, '-jpeg', '-jpegopt', `quality=${quality}`, '-singlefile', path, out])
      const { base64 } = await $.fs.read(`${out}.jpg`, { as: 'bytes' })
      if (base64.length <= SVG_ROOM) {
        Object.assign(picture, { svg: svgOf(base64, pixels, height), width: pixels, height })
        break
      }
    }
  }
  if (want.png) {
    const { args, height } = geometry(target, PNG_WIDTH)
    await run($, [await bin($, 'pdftoppm'), ...args, '-png', '-singlefile', path, out])
    Object.assign(picture, { png: `${out}.png`, width: PNG_WIDTH, height })
  }

  return picture
}

// Each navigation takes a ticket; work that finishes after a newer one
// started is dropped, so a slow download never paints over a later page.
let latest = 0

async function track($: EngineInterface, label: string, work: (ticket: number) => Promise<void>): Promise<void> {
  const ticket = ++latest
  await update($, status, () => label)
  try {
    await work(ticket)
    if (ticket === latest) await update($, status, () => null)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    if (ticket === latest) await update($, status, () => `${label.replace(/…$/, '')} failed: ${reason}`)
  }
}

async function rootName($: EngineInterface): Promise<string> {
  const name = await $.store.get('root')

  return typeof name === 'string' ? name : DEFAULT_ROOT
}

async function browse($: EngineInterface, path: Folder[]): Promise<void> {
  const here = path.at(-1)
  if (here === undefined) return browseRoot($)
  await update($, view, () => 'browse')
  await update($, trail, () => path)
  await update($, entries, () => [])
  await track($, `Opening ${here.title}…`, async ticket => {
    const list = toEntries(await searchDrive($, childrenQuery(here.id)))
    if (ticket === latest) await update($, entries, () => list)
  })
}

async function browseRoot($: EngineInterface): Promise<void> {
  const name = await rootName($)
  await update($, view, () => 'browse')
  await track($, `Finding your ${name} folder…`, async () => {
    const root = await findFolder($, name)
    if (root === null) throw new Error(`no Drive folder named "${name}". Set one with /study folder <name>`)
    await browse($, [root])
  })
}

async function openDoc($: EngineInterface, entry: Entry, path: Folder[]): Promise<void> {
  await update($, view, () => 'read')
  await update($, trail, () => path)
  await update($, shown, () => null)
  await track($, `Downloading ${entry.title}…`, async ticket => {
    const file = await fetchPdf($, entry)
    const parts = parseParts(await run($, [await bin($, 'pdfinfo'), '-f', '1', '-l', '9999', file]))
    if (parts.length === 0) throw new Error('the PDF has no pages')
    if (ticket !== latest) return

    const pages = ((await $.store.get('pages')) ?? {}) as Record<string, number>
    const opened: Doc = { ...entry, path: file, parts, isPractice: isPractice(entry.title) }
    await update($, doc, () => opened)
    await $.store.set('last', { entry, trail: path } satisfies LastOpened)
    await show($, Math.min(pages[entry.id] ?? 0, parts.length - 1))
  })
}

async function show($: EngineInterface, index: number): Promise<void> {
  const current = await read($, doc)
  const target = current?.parts[index]
  if (current === null || target === undefined) return

  await update($, part, () => index)
  const pages = ((await $.store.get('pages')) ?? {}) as Record<string, number>
  await $.store.set('pages', { ...pages, [current.id]: index })

  await track($, `Loading page ${target.page}…`, async ticket => {
    const surfaces = await $.session.surfaces()
    const want = {
      png: surfaces.includes('terminal'),
      svg: surfaces.length === 0 || surfaces.some(surface => surface !== 'terminal'),
    }
    const picture = await renderPart($, current.path, target, want, ticket)
    if (ticket === latest) await update($, shown, () => picture)
  })
}

async function step($: EngineInterface, delta: number): Promise<void> {
  const current = await read($, doc)
  if (current === null) return
  const index = (await read($, part)) + delta
  if (index < 0) return
  if (index >= current.parts.length) {
    $.ui.toast(`End of ${current.title}. Pick what's next.`)
    await browse($, await read($, trail))

    return
  }
  if (delta > 0) await update($, covered, n => n + 1)
  await show($, index)
}

// Claude started: pick up where the person left off, else show their folder.
async function resume($: EngineInterface): Promise<void> {
  const mode = await read($, view)
  if (mode === 'read' && (await read($, doc)) !== null) return
  if (mode === 'browse' && (await read($, entries)).length > 0) return

  const last = (await $.store.get('last')) as LastOpened | undefined
  if (last !== undefined) return openDoc($, last.entry, last.trail)

  return browseRoot($)
}

async function stopStudying($: EngineInterface): Promise<void> {
  await update($, isWorking, () => false)
  await $.ui.close({ id: PANE })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'study',
      description: 'Your notes in a side pane while Claude works: on, off, or folder <name>',
      argumentHint: '[on|off|folder <name>]',
      immediate: true,
    })

    return next(e)
  })

  // Claude starts working: open the notes. A subagent's run raises no turn.start.
  on('turn.start', async ($, e, next) => {
    if ((await $.store.get('enabled')) !== false) {
      await update($, covered, () => 0)
      await update($, isWorking, () => true)
      const opened = await $.ui.open({ id: PANE, title: 'Study', focus: true })
      if (!opened.isPlaced) $.ui.toast(`Your notes are ready: type /study to show them. (${opened.reason})`)
      void resume($).catch(() => undefined)
    }

    return next(e)
  })

  // Claude is done: close the notes and send the person back to the code.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && (await read($, isWorking))) {
      await stopStudying($)
      const count = await read($, covered)
      const current = await read($, doc)
      const where = current === null ? '' : ` of ${current.title}`
      $.ui.toast(
        count === 0
          ? "Claude's done. Go check the changes."
          : `Claude's done: ${count} page${count === 1 ? '' : 's'}${where}, bookmarked. Go check the changes.`,
      )
    }

    return next(e)
  })

  // No closing the pane by hand while Claude works; /study off is the way out.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person' && (await read($, isWorking))) {
      $.ui.toast('Notes stay up until Claude is done. /study off to turn study mode off.')

      return { value: undefined }
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'study' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)

    if (verb === 'off') {
      await $.store.set('enabled', false)
      if (await read($, isWorking)) await stopStudying($)

      return { text: 'Study mode off. /study on to turn it back on.' }
    }
    if (verb === 'on') {
      await $.store.set('enabled', true)

      return { text: 'Study mode on: your notes open each time Claude starts working.' }
    }
    if (verb === 'folder' && rest.length > 0) {
      const name = rest.join(' ')
      const folder = await findFolder($, name).catch(() => null)
      if (folder === null) return { text: `No Google Drive folder named "${name}".` }
      await $.store.set('root', folder.title)
      await $.store.delete('last')
      await update($, entries, () => [])
      await update($, doc, () => null)
      await update($, view, () => 'browse')

      return { text: `Study folder set to ${folder.title}. It opens next time Claude works.` }
    }

    // Typed by the person, the open is asked for, so it is drawn at any width.
    if (verb === '' && (await read($, isWorking))) {
      const opened = await $.ui.open({ id: PANE, title: 'Study', focus: true })
      if (opened.isPlaced) return { text: 'Notes opened.' }
    }

    const isOn = (await $.store.get('enabled')) !== false
    const last = (await $.store.get('last')) as LastOpened | undefined
    const pages = ((await $.store.get('pages')) ?? {}) as Record<string, number>
    const reading = last === undefined ? 'nothing yet' : `${last.entry.title} (part ${(pages[last.entry.id] ?? 0) + 1})`

    return {
      text: [
        `Study mode: ${isOn ? 'on' : 'off'} · Drive folder: ${await rootName($)} · reading: ${reading}`,
        'Usage: /study on | off | folder <Drive folder name>',
      ].join('\n'),
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const note = await read($, status)

    if (!(await read($, isWorking))) {
      return <Text dimColor>Claude is done. Back to the code.</Text>
    }

    if ((await read($, view)) === 'browse') {
      const path = await read($, trail)
      const list = await read($, entries)

      return (
        <Box flexDirection="column">
          <Text bold>{path.length === 0 ? 'Google Drive' : path.map(folder => folder.title).join(' / ')}</Text>
          {note !== null && <Text dimColor>{note}</Text>}
          {path.length > 1 && (
            <Button key="up" label="◀ Up" hotkey="u" plain onPress={() => browse($, path.slice(0, -1))} />
          )}
          {list.map(entry => (
            <Button
              key={`entry:${entry.id}`}
              plain
              onPress={() =>
                entry.isFolder
                  ? browse($, [...path, { id: entry.id, title: entry.title }])
                  : openDoc($, entry, path)
              }
            >
              {entry.isFolder ? `▸ ${entry.title}` : `  ${entry.title}`}
            </Button>
          ))}
          {list.length === 0 && note === null && <Text dimColor>Nothing here.</Text>}
        </Box>
      )
    }

    const current = await read($, doc)
    const index = await read($, part)
    const picture = await read($, shown)
    const count = await read($, covered)
    const at = current?.parts[index]

    if (current === null || at === undefined) {
      return <Text dimColor>{note ?? 'Loading…'}</Text>
    }

    const lastPage = current.parts.at(-1)?.page ?? at.page
    const half = at.half === undefined ? '' : ` (${at.half} half)`
    const alt = `${current.title}, page ${at.page}${half}`
    let page = <Text dimColor>{note ?? 'Loading…'}</Text>
    if (picture !== null && e.surface === 'terminal' && picture.png !== undefined) {
      const { Image } = $.ui.resolve(e)
      const columns = Math.max(1, Math.min(255, e.props.bodyColumns))
      const rows = Math.max(1, Math.min(255, Math.round((columns * picture.height) / picture.width / 2.1)))
      page = (
        <Image
          key="page"
          source={{ file: picture.png, format: 'png', generation: picture.generation }}
          columns={columns}
          rows={rows}
          alt={alt}
        />
      )
    } else if (picture !== null && e.surface !== 'terminal' && picture.svg !== undefined) {
      const { Svg } = $.ui.resolve(e)
      page = <Svg source={picture.svg} alt={alt} />
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold wrap="truncate-end">
            {current.title}
          </Text>
          <Text dimColor>
            Page {at.page} of {lastPage}
            {half} · {count} covered this wait
          </Text>
          <Text color={current.isPractice ? 'yellow' : 'cyan'}>
            {current.isPractice
              ? 'Practice: work each question out on paper before you move on.'
              : 'Read it, then look away and recall the key points.'}
          </Text>
        </Box>
        {page}
        {picture !== null && note !== null && <Text dimColor>{note}</Text>}
        <Box flexDirection="row" gap={2}>
          <Button key="prev" label="◀ Prev" hotkey="p" onPress={() => step($, -1)} />
          <Button
            key="next"
            label={current.isPractice ? 'Wrote it ▶' : 'Next ▶'}
            hotkey="n"
            variant="primary"
            autoFocus
            onPress={() => step($, 1)}
          />
          <Button key="files" label="Files" hotkey="f" onPress={async () => browse($, await read($, trail))} />
        </Box>
        <Link href={current.url} label="Open in Google Drive" />
      </Box>
    )
  })
}
