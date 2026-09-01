import { useCallback, useMemo, useState } from 'react'

/**
 * Undo/redo over a single piece of state.
 *
 * The distinction that matters is `set` vs `commit`. Editing gestures are
 * continuous — a drag fires on every pointermove, a slider on every pixel of
 * travel — and a history that snapshotted each one would need forty presses to
 * undo a single drag. So `set` moves the present without recording, and
 * `commit` pushes the value as it stood before the gesture. Callers commit at
 * the end of one: pointerup, slider release, or an action that is atomic
 * anyway (add, delete, reorder).
 *
 * All four operations are a single pure transition over one state object.
 * That is deliberate: the first version of this hook called `setFuture` and
 * mutated refs from inside a `setPast` updater, and React's double-invocation
 * of updaters in development quietly corrupted the redo stack. State updaters
 * must be pure, so the "value at the last commit" lives in the state as
 * `baseline` rather than in a ref beside it.
 *
 * Only the layout is undoable. Undoing back through a scene choice or a render
 * result would be surprising, and neither is destructive the way a lost layout
 * is.
 */
export interface History<T> {
  state: T
  /** Update without recording — for continuous gestures. */
  set: (next: T | ((current: T) => T)) => void
  /** Record the value as it stood before the gesture that just ended. */
  commit: () => void
  /** Update and record in one step, for changes that are atomic already. */
  commitState: (next: T | ((current: T) => T)) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  /** Drop the stack and start again (e.g. the editor opened a new subject). */
  reset: (next: T) => void
}

/** Deep enough for a long session, shallow enough not to pin much memory. */
const MAX_DEPTH = 50

interface Stack<T> {
  past: T[]
  present: T
  future: T[]
  /** The present as of the last commit — what an undo rewinds to. */
  baseline: T
}

const resolve = <T,>(next: T | ((current: T) => T), current: T): T =>
  typeof next === 'function' ? (next as (c: T) => T)(current) : next

export function useHistory<T>(initial: T): History<T> {
  const [stack, setStack] = useState<Stack<T>>({
    past: [],
    present: initial,
    future: [],
    baseline: initial,
  })

  const set = useCallback((next: T | ((current: T) => T)) => {
    setStack((s) => {
      const present = resolve(next, s.present)
      return Object.is(present, s.present) ? s : { ...s, present }
    })
  }, [])

  const commit = useCallback(() => {
    setStack((s) => {
      // Nothing moved since the last commit — a click that changed nothing, or
      // a pointerup after a drag that went nowhere.
      if (Object.is(s.baseline, s.present)) return s
      return {
        past: [...s.past, s.baseline].slice(-MAX_DEPTH),
        present: s.present,
        // A new branch invalidates whatever was redoable.
        future: [],
        baseline: s.present,
      }
    })
  }, [])

  const commitState = useCallback((next: T | ((current: T) => T)) => {
    setStack((s) => {
      const present = resolve(next, s.present)
      if (Object.is(present, s.present) && Object.is(s.present, s.baseline)) {
        return s
      }
      return {
        past: [...s.past, s.baseline].slice(-MAX_DEPTH),
        present,
        future: [],
        baseline: present,
      }
    })
  }, [])

  const undo = useCallback(() => {
    setStack((s) => {
      if (s.past.length === 0) return s
      const previous = s.past[s.past.length - 1]
      return {
        past: s.past.slice(0, -1),
        present: previous,
        future: [s.present, ...s.future].slice(0, MAX_DEPTH),
        baseline: previous,
      }
    })
  }, [])

  const redo = useCallback(() => {
    setStack((s) => {
      if (s.future.length === 0) return s
      const [next, ...rest] = s.future
      return {
        past: [...s.past, s.present].slice(-MAX_DEPTH),
        present: next,
        future: rest,
        baseline: next,
      }
    })
  }, [])

  const reset = useCallback((next: T) => {
    setStack({ past: [], present: next, future: [], baseline: next })
  }, [])

  return useMemo(
    () => ({
      state: stack.present,
      set,
      commit,
      commitState,
      undo,
      redo,
      canUndo: stack.past.length > 0,
      canRedo: stack.future.length > 0,
      reset,
    }),
    [stack, set, commit, commitState, undo, redo, reset],
  )
}
