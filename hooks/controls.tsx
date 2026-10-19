// Small drawing pieces both tabs share, all painted from the theme tokens.
import { C, tint } from './theme'
import type { UI } from './ui'

type ChipArgs = {
  key: string
  label: string
  onPress: () => unknown
  // `row` is a per-row action: faint at rest so a long list stays calm.
  // `danger` is the yes of a step that throws work away.
  kind?: 'primary' | 'secondary' | 'quiet' | 'row' | 'danger'
  // Drawn as text with no button: `busy` while its step runs, `disabled` when it can't run.
  state?: 'busy' | 'disabled'
}

// A button drawn as a filled chip; the focus ring still inverts it.
export function chip(ui: UI, { key, label, onPress, kind = 'secondary', state }: ChipArgs) {
  const { Box, Button, Text } = ui

  if (state !== undefined) {
    const isBusy = state === 'busy'

    return (
      <Box key={`chip:${key}`}>
        <Text backgroundColor={isBusy ? tint(C.busy, 0.18, C.bg) : undefined} color={isBusy ? C.busy : C.faint}>
          {` ${isBusy ? `${label}…` : label} `}
        </Text>
      </Box>
    )
  }

  const look = {
    primary: { backgroundColor: C.accent, color: C.bg, bold: true, hover: { backgroundColor: C.accentHover } },
    secondary: { backgroundColor: C.raised, color: C.text, bold: false, hover: { backgroundColor: C.hover, color: C.text } },
    quiet: { backgroundColor: undefined, color: C.muted, bold: false, hover: { backgroundColor: C.hover, color: C.text } },
    row: { backgroundColor: undefined, color: C.faint, bold: false, hover: { backgroundColor: C.hover, color: C.text } },
    danger: { backgroundColor: C.deleted, color: C.bg, bold: true, hover: { backgroundColor: tint(C.deleted, 0.75, C.text) } },
  }[kind]

  return (
    <Box key={`chip:${key}`}>
      <Button key={key} plain onPress={onPress}>
        <Text backgroundColor={look.backgroundColor} color={look.color} bold={look.bold} hover={look.hover}>
          {` ${label} `}
        </Text>
      </Button>
    </Box>
  )
}

// A top-level tab: the active one is underlined in the accent.
export function tab(ui: UI, key: string, label: string, isActive: boolean, onPress: () => unknown) {
  const { Box, Button, Text } = ui

  return (
    <Box key={`tab:${key}`}>
      <Button key={key} plain onPress={onPress}>
        <Text color={isActive ? C.accent : C.muted} bold={isActive} underline={isActive} hover={{ color: C.text }}>
          {label}
        </Text>
      </Button>
    </Box>
  )
}

type Segment = { key: string; label: string; isActive: boolean; onPress: () => unknown }

// A row of sub-views split by dots; the active one sits on a raised pill.
export function segments(ui: UI, items: Segment[]) {
  const { Box, Button, Text } = ui

  return (
    <Box gap={1} flexWrap="wrap">
      {items.flatMap((item, i) => [
        i > 0 && <Text key={`sep:${item.key}`} color={C.line}>·</Text>,
        <Box key={`tab:${item.key}`}>
          <Button key={item.key} plain onPress={item.onPress}>
            <Text
              color={item.isActive ? C.text : C.muted}
              backgroundColor={item.isActive ? C.raised : undefined}
              bold={item.isActive}
              hover={{ color: C.text }}
            >
              {item.isActive ? ` ${item.label} ` : item.label}
            </Text>
          </Button>
        </Box>,
      ])}
    </Box>
  )
}

type SectionArgs = {
  key: string
  title: string
  count: number
  isOpen: boolean
  onToggle: () => unknown
  action?: JSX.Element | false | null
}

// A list's heading: a chevron that folds it, the title, the count, an optional action.
export function sectionHeader(ui: UI, { key, title, count, isOpen, onToggle, action }: SectionArgs) {
  const { Box, Button, Text } = ui

  return (
    <Box key={`head:${key}`} justifyContent="space-between" gap={1}>
      <Box gap={1}>
        <Button key={`fold:${key}`} plain onPress={onToggle}>
          <Text color={C.faint} hover={{ color: C.text }}>{isOpen ? '▾' : '▸'}</Text>
        </Button>
        <Text color={C.text} bold>{title}</Text>
        <Text color={C.faint}>{String(count)}</Text>
      </Box>
      {action}
    </Box>
  )
}

// A rounded frame around a group that belongs together.
export function panel(ui: UI, key: string, children: JSX.Element | JSX.Element[], color: string = C.line) {
  const { Box } = ui

  return (
    <Box key={key} flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
      {children}
    </Box>
  )
}

// A raised block with no frame, one step lighter than the canvas.
export function card(ui: UI, key: string, children: JSX.Element | (JSX.Element | false | null)[], gap = 0) {
  const { Box } = ui

  return (
    <Box key={key} flexDirection="column" backgroundColor={C.card} paddingX={1} gap={gap}>
      {children}
    </Box>
  )
}

// A short label on a tinted fill of its own color: HEAD, approved, 2 failing.
export function badge(ui: UI, key: string, label: string, color: string) {
  const { Text } = ui

  return <Text key={`badge:${key}`} color={color} backgroundColor={tint(color)} bold>{` ${label} `}</Text>
}

type BarPart = { key: string; count: number; color: string }

// One row split into colored runs by share: how the changes or checks add up.
export function bar(ui: UI, key: string, parts: BarPart[], width: number) {
  const { Box, Text } = ui
  const total = parts.reduce((sum, part) => sum + part.count, 0)
  if (total === 0 || width < 1) return null

  // Every non-empty part keeps at least one cell; the last one takes what rounding left.
  const shown = parts.filter(part => part.count > 0)
  let left = width
  const runs = shown.map((part, i) => {
    const room = left - (shown.length - 1 - i)
    const size = i === shown.length - 1 ? left : Math.max(1, Math.min(room, Math.round((part.count / total) * width)))
    left -= size

    return { ...part, size }
  })

  return (
    <Box key={`bar:${key}`}>
      {runs.map(run => <Text key={`bar:${key}:${run.key}`} color={run.color}>{'━'.repeat(run.size)}</Text>)}
    </Box>
  )
}

export function divider(ui: UI, width: number) {
  const { Text } = ui

  return <Text color={C.line}>{'─'.repeat(Math.max(1, width))}</Text>
}
