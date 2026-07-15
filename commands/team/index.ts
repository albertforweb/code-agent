import type { Command } from '../../commands.js'

const team = {
  type: 'local',
  name: 'team',
  aliases: ['teams'],
  description: 'Manage Project Studio teams',
  argumentHint: '[list|create|update|delete] ...',
  supportsNonInteractive: true,
  load: () => import('./team.js'),
} satisfies Command

export default team
