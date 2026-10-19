import type { Elements } from 'claude-code'

// The elements the tabs draw with; every surface but mobile has all of them.
// Raster and Image are the terminal's alone, so a drawing checks for them first.
export type UI = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Input' | 'Select' | 'Code' | 'Link' | 'Markdown'>
  & Partial<Pick<Elements['terminal'], 'Raster' | 'Image'>>
