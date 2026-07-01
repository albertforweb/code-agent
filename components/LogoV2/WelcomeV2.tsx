import React from 'react';
import { Box, Text } from 'src/ink.js';

const WELCOME_V2_WIDTH = 58;

export function WelcomeV2() {
  return (
    <Box width={WELCOME_V2_WIDTH} flexDirection="column">
      <Text>
        <Text color="codeAgent">Welcome to CodeAgent </Text>
        <Text dimColor={true}>v{MACRO.VERSION}</Text>
      </Text>
      <Text color="clawd_body">+--------------------------------------------------------+</Text>
      <Text>
        <Text color="clawd_body">| </Text>
        <Text color="suggestion">{'>_'}</Text>
        <Text> CodeAgent</Text>
        <Text dimColor={true}>  local-first coding agent</Text>
        <Text color="clawd_body">      |</Text>
      </Text>
      <Text>
        <Text color="clawd_body">| </Text>
        <Text dimColor={true}>tools, files, schedules, teams, and local LLMs</Text>
        <Text color="clawd_body">       |</Text>
      </Text>
      <Text color="clawd_body">+--------------------------------------------------------+</Text>
    </Box>
  );
}
