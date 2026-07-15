import type { Command } from '../../commands.js'

const role = {
  type: 'local',
  name: 'role',
  aliases: ['roles'],
  description: 'Manage Project Studio role definitions',
  argumentHint: '[list|create|update|delete] ...',
  supportsNonInteractive: true,
  load: () => import('./role.js'),
} satisfies Command

export default role
