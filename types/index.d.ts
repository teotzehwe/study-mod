export type Folder = { id: string; title: string }

export type Entry = {
  id: string
  title: string
  mimeType: string
  modifiedTime: string
  url: string
  isFolder: boolean
}

// One screen of a document: a portrait page, or half of a landscape one.
export type Part = { page: number; half?: 'left' | 'right'; width: number; height: number }

export type Doc = Entry & { path: string; parts: Part[]; isPractice: boolean }

// The part on screen, as each surface draws it: a PNG file for the terminal,
// an SVG wrapping a JPEG for every other surface.
export type Shown = { png?: string; svg?: string; width: number; height: number; generation: number }

declare module 'claude-code' {
  interface PluginState {
    'study-mode': {
      isWorking: boolean
      view: 'browse' | 'read'
      trail: Folder[]
      entries: Entry[]
      doc: Doc | null
      part: number
      shown: Shown | null
      status: string | null
      covered: number
    }
  }
}
