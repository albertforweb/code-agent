import assert from 'node:assert/strict'
import test from 'node:test'
import { validateTaskGraph, type TaskGraphTask } from './taskGraph'

const task = (id: string, overrides: Partial<TaskGraphTask> = {}): TaskGraphTask => ({
  id, status: 'pending', blocks: [], blockedBy: [], ...overrides,
})

test('legacy tasks without durable execution fields remain valid', () => {
  assert.deepEqual(validateTaskGraph([task('1')]), { valid: true, errors: [] })
})

test('validates dependency references, symmetry, and cycles', () => {
  const result = validateTaskGraph([
    task('1', { blocks: ['2'], blockedBy: ['2'] }),
    task('2', { blocks: ['1', 'missing'], blockedBy: ['1'] }),
  ])
  assert.equal(result.valid, false)
  assert.ok(result.errors.some(error => error.code === 'missing-dependency'))
  assert.ok(result.errors.some(error => error.code === 'dependency-cycle'))
})

test('rejects invalid budgets and concurrent active resource claims', () => {
  const result = validateTaskGraph([
    task('1', { status: 'in_progress', budget: { tokenLimit: 0 }, resourceClaims: ['src/app.ts'] }),
    task('2', { status: 'in_progress', resourceClaims: ['src/app.ts'] }),
  ])
  assert.ok(result.errors.some(error => error.code === 'invalid-budget'))
  assert.deepEqual(result.errors.find(error => error.code === 'resource-conflict')?.taskIds, ['1', '2'])
})
