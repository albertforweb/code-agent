import type { Command } from '../../commands.js'

const employee = {
  type: 'local',
  name: 'employee',
  aliases: ['employees', 'people'],
  description: 'Manage Project Studio employees',
  argumentHint: '[list|create|update|delete] ...',
  supportsNonInteractive: true,
  load: () => import('./employee.js'),
} satisfies Command

export default employee
