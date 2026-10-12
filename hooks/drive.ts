import type { McpToolResult } from 'claude-code'

import type { Entry } from '../types'

// The Google Drive connector's name: as a claude.ai connector in a cloud
// session, and as /mcp lists it in a local one.
export const DRIVE_SERVERS = ['Google_Drive', 'claude.ai Google Drive']

// The server that has both of Drive's tools the mod calls, from the
// session's tool names (`mcp__<server>__<tool>`), in the spelling $.mcp.call
// accepts. Told by its tools, not its name: the desktop app names a claude.ai
// connector by its id alone. One that names itself Drive wins a tie.
export function driveServerIn(toolNames: readonly string[]): string | undefined {
  const names = new Set(toolNames)
  const servers: string[] = []
  for (const name of toolNames) {
    const server = /^mcp__(.+)__search_files$/.exec(name)?.[1]
    if (server !== undefined && names.has(`mcp__${server}__download_file_content`)) servers.push(server)
  }

  return servers.find(server => /drive/i.test(server)) ?? servers[0]
}

const FOLDER = 'application/vnd.google-apps.folder'
const PDF = 'application/pdf'
const EXPORTS_AS_PDF = ['application/vnd.google-apps.document', 'application/vnd.google-apps.presentation']

export type DriveFile = {
  id: string
  title: string
  mimeType: string
  modifiedTime?: string
  viewUrl?: string
}

export type SearchPage = { files?: DriveFile[]; nextPageToken?: string }

export function parseResult(tool: string, result: McpToolResult): unknown {
  const text = result.content.find(block => block.type === 'text')?.text ?? ''
  if (result.isError) throw new Error(text || `${tool} failed`)

  return JSON.parse(text)
}

export function folderQuery(name: string): string {
  const quoted = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

  return `title = '${quoted}' and mimeType = '${FOLDER}'`
}

export function childrenQuery(folderId: string): string {
  return `parentId = '${folderId}'`
}

export function searchArgs(query: string, pageToken?: string): Record<string, unknown> {
  return { query, pageSize: 100, excludeContentSnippets: true, ...(pageToken === undefined ? {} : { pageToken }) }
}

// Folders first, then PDFs and Google Docs/Slides, each in natural order
// ("2 Kinematics" before "10 Gravitation").
export function toEntries(files: readonly DriveFile[]): Entry[] {
  return files
    .filter(file => file.mimeType === FOLDER || file.mimeType === PDF || EXPORTS_AS_PDF.includes(file.mimeType))
    .map(file => ({
      id: file.id,
      title: file.title.replace(/\.pdf$/i, ''),
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime ?? '',
      url: file.viewUrl ?? `https://drive.google.com/file/d/${file.id}/view`,
      isFolder: file.mimeType === FOLDER,
    }))
    .sort(
      (x, y) =>
        Number(y.isFolder) - Number(x.isFolder) ||
        x.title.localeCompare(y.title, undefined, { numeric: true, sensitivity: 'base' }),
    )
}

// A Google Doc or Slides deck is exported; a PDF comes as it is.
export function downloadArgs(entry: Entry): Record<string, unknown> {
  return EXPORTS_AS_PDF.includes(entry.mimeType) ? { fileId: entry.id, exportMimeType: PDF } : { fileId: entry.id }
}

// The connector sends files up to 10 MB; past that it answers "File too
// large for download, over limit of 10 MB".
export function isTooLarge(error: unknown): boolean {
  return error instanceof Error && /too large|over limit/i.test(error.message)
}

export const RCLONE_SETUP = 'brew install rclone, then rclone config create gdrive drive scope=drive.readonly'

// rclone downloads a file of any size by its Drive id, with the person's own
// sign-in. The first Drive remote `rclone listremotes --long` lists
// ("gdrive: drive"), as rclone spells it, colon included.
export function rcloneRemoteIn(listing: string): string | undefined {
  for (const line of listing.split('\n')) {
    const match = /^(\S+:)\s+drive\s*$/.exec(line.trim())
    if (match?.[1] !== undefined) return match[1]
  }

  return undefined
}

export function copyidArgs(remote: string, entry: Entry, dest: string): string[] {
  const exports = EXPORTS_AS_PDF.includes(entry.mimeType) ? ['--drive-export-formats', 'pdf'] : []

  return ['backend', 'copyid', remote, entry.id, dest, ...exports]
}
