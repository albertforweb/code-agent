const sentinel = Symbol.for('react.memo_cache_sentinel');

export function c(size: number): unknown[] {
  return new Array(size).fill(sentinel);
}
