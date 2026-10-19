import type { Elements } from 'claude-code'

// The elements the tabs draw with; every surface but mobile has all of them.
export type UI = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Input' | 'Select' | 'Code' | 'Link' | 'Markdown'>
