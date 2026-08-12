export interface TaskGraphTask {
  id: string
  status: 'pending' | 'in_progress' | 'completed'
  blocks: string[]
  blockedBy: string[]
  budget?: { tokenLimit?: number; timeLimitMs?: number }
  resultContract?: { requiredArtifacts?: string[]; requiredEvidence?: string[] }
  resourceClaims?: string[]
}

export type TaskGraphValidationErrorCode =
  | 'duplicate-task'
  | 'missing-dependency'
  | 'self-dependency'
  | 'dependency-mismatch'
  | 'dependency-cycle'
  | 'invalid-budget'
  | 'resource-conflict'

export interface TaskGraphValidationError {
  code: TaskGraphValidationErrorCode
  message: string
  taskIds: string[]
  resource?: string
}

export interface TaskGraphValidationResult {
  valid: boolean
  errors: TaskGraphValidationError[]
}

export function validateTaskGraph(tasks: readonly TaskGraphTask[]): TaskGraphValidationResult {
  const errors: TaskGraphValidationError[] = []
  const byId = new Map<string, TaskGraphTask>()

  for (const task of tasks) {
    if (byId.has(task.id)) {
      errors.push({ code: 'duplicate-task', message: `Task ${task.id} is duplicated.`, taskIds: [task.id] })
    } else {
      byId.set(task.id, task)
    }
    for (const [name, value] of Object.entries(task.budget ?? {})) {
      if (!Number.isInteger(value) || Number(value) <= 0) {
        errors.push({ code: 'invalid-budget', message: `Task ${task.id} has an invalid ${name}.`, taskIds: [task.id] })
      }
    }
  }

  const edges = new Map<string, Set<string>>()
  for (const task of tasks) edges.set(task.id, new Set())

  for (const task of tasks) {
    for (const blockedId of task.blocks) {
      if (blockedId === task.id) {
        errors.push({ code: 'self-dependency', message: `Task ${task.id} blocks itself.`, taskIds: [task.id] })
        continue
      }
      const blocked = byId.get(blockedId)
      if (!blocked) {
        errors.push({ code: 'missing-dependency', message: `Task ${task.id} blocks missing task ${blockedId}.`, taskIds: [task.id, blockedId] })
        continue
      }
      edges.get(task.id)?.add(blockedId)
      if (!blocked.blockedBy.includes(task.id)) {
        errors.push({ code: 'dependency-mismatch', message: `Task ${task.id} blocks ${blockedId}, but its reverse link is absent.`, taskIds: [task.id, blockedId] })
      }
    }
    for (const blockerId of task.blockedBy) {
      if (blockerId === task.id) {
        errors.push({ code: 'self-dependency', message: `Task ${task.id} is blocked by itself.`, taskIds: [task.id] })
        continue
      }
      const blocker = byId.get(blockerId)
      if (!blocker) {
        errors.push({ code: 'missing-dependency', message: `Task ${task.id} references missing blocker ${blockerId}.`, taskIds: [task.id, blockerId] })
        continue
      }
      edges.get(blockerId)?.add(task.id)
      if (!blocker.blocks.includes(task.id)) {
        errors.push({ code: 'dependency-mismatch', message: `Task ${task.id} is blocked by ${blockerId}, but its reverse link is absent.`, taskIds: [blockerId, task.id] })
      }
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (taskId: string, path: string[]): void => {
    if (visiting.has(taskId)) {
      const cycle = [...path.slice(path.indexOf(taskId)), taskId]
      errors.push({ code: 'dependency-cycle', message: `Task dependency cycle detected: ${cycle.join(' -> ')}.`, taskIds: cycle })
      return
    }
    if (visited.has(taskId)) return
    visiting.add(taskId)
    for (const next of edges.get(taskId) ?? []) visit(next, [...path, taskId])
    visiting.delete(taskId)
    visited.add(taskId)
  }
  for (const taskId of byId.keys()) visit(taskId, [])

  const activeClaims = new Map<string, string>()
  for (const task of tasks.filter(candidate => candidate.status === 'in_progress')) {
    for (const rawResource of task.resourceClaims ?? []) {
      const resource = rawResource.trim()
      if (!resource) continue
      const owner = activeClaims.get(resource)
      if (owner && owner !== task.id) {
        errors.push({ code: 'resource-conflict', message: `Tasks ${owner} and ${task.id} both claim ${resource}.`, taskIds: [owner, task.id], resource })
      } else {
        activeClaims.set(resource, task.id)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
