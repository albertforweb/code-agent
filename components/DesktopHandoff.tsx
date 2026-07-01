import React from 'react'
import type { CommandResultDisplay } from '../commands.js'
import { Box, Text, useInput } from '../ink.js'

type Props = {
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}

const DESKTOP_STATUS_MESSAGE =
  'CodeAgent Desktop is included in this project. Start it with `npm run dev:electron` during development or build a packaged app with `npm run pack`.'

export function getDownloadUrl(): string {
  return 'https://github.com/albertforweb/code-agent#desktop-app'
}

export function DesktopHandoff({ onDone }: Props): React.ReactNode {
  useInput((_input, key) => {
    if (key.return || key.escape) {
      onDone(DESKTOP_STATUS_MESSAGE, { display: 'system' })
    }
  })

  return (
    <Box flexDirection="column" paddingX={2}>
      <Text>CodeAgent Desktop handoff is not wired for this CLI build.</Text>
      <Text dimColor>
        Start the desktop app separately, then continue from the shared
        workspace.
      </Text>
      <Text dimColor>Press Enter to continue.</Text>
    </Box>
  )
}
