import type { LocalCommandCall } from '../../types/command.js'
import { runProjectStudioCommand } from '../../cli/handlers/project-studio.js'

export const call: LocalCommandCall = async args => {
  return {
    type: 'text',
    value: await runProjectStudioCommand(args, 'project'),
  }
}
