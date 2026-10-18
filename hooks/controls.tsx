// Small drawing pieces both tabs share, all painted from the theme tokens.
import { C } from './theme'
import type { UI } from './ui'

type ChipArgs = {
  key: string
  label: string
  onPress: () => unknown
  kind?: 'primary' | 'secondary' | 'quiet'
}

// A button drawn as a filled chip; the focus ring still inverts it.
export function chip(ui: UI, { key, label, onPress, kind = 'secondary' }: ChipArgs) {
  const { Box, Button, Text } = ui
  const look = {
    primary: { backgroundColor: C.text, color: C.bg, bold: true },
    secondary: { backgroundColor: C.raised, color: C.text, bold: false },
    quiet: { backgroundColor: undefined, color: C.muted, bold: false },
  }[kind]

  return (
    <Box key={`chip:${key}`}>
      <Button key={key} plain onPress={onPress}>
        <Text
          backgroundColor={look.backgroundColor}
          color={look.color}
          bold={look.bold}
          hover={kind === 'primary' ? { backgroundColor: C.muted } : { backgroundColor: C.hover, color: C.text }}
        >
          {` ${label} `}
        </Text>
      </Button>
    </Box>
  )
}

export function tab(ui: UI, key: string, label: string, isActive: boolean, onPress: () => unknown) {
  const { Box, Button, Text } = ui

  return (
    <Box key={`tab:${key}`}>
      <Button key={key} plain onPress={onPress}>
        <Text
          backgroundColor={isActive ? C.raised : undefined}
          color={isActive ? C.text : C.muted}
          bold={isActive}
          hover={{ color: C.text }}
        >
          {` ${label} `}
        </Text>
      </Button>
    </Box>
  )
}

export function divider(ui: UI, width: number) {
  const { Text } = ui

  return <Text color={C.line}>{'─'.repeat(Math.max(1, width))}</Text>
}
