export type Card = { id: string; deck: string; q: string; a: string }
export type Tally = { seen: number; got: number }
export type Progress = Record<string, { box: number; due: number }>

declare module 'claude-code' {
  interface PluginState {
    'study-mode': {
      card: Card | null
      box: number
      isRevealed: boolean
      isWorking: boolean
      tally: Tally
    }
  }
}
