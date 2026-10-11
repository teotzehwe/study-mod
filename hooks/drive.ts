import type { McpToolResult } from 'claude-code'

import type { Entry } from '../types'

// The Google Drive connector's name: as a claude.ai connector in a cloud
// session, and as /mcp lists it in a local one.
export const DRIVE_SERVERS = ['Google_Drive', 'claude.ai Google Drive']

// The server whose tools include Drive's search_files, from the session's
// tool names (`mcp__<server>__<tool>`), in the spelling $.mcp.call accepts.
export function driveServerIn(toolNames: readonly string[]): string | undefined {
  for (const name of toolNames) {
    const server = /^mcp__(.+)__search_files$/.exec(name)?.[1]
    if (server !== undefined && /drive/i.test(server)) return server
  }

  return undefined
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
