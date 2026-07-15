import type { Command } from '../../commands.js'

const project = {
  type: 'local',
  name: 'project',
  aliases: ['projects'],
  description: 'Manage Project Studio projects and autonomous runs',
  argumentHint: '[list|show|create|update|delete|start|runs|deliverables|team|employee|role] ...',
  supportsNonInteractive: true,
  load: () => import('./project.js'),
} satisfies Command

export default project
