import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/**
 * Ticked table rows, held above the dashboard's pages.
 *
 * A selection outlives the page it was made on: tick rows on page 1, open a
 * product to check it, come back, move to page 3 and keep ticking — it is all
 * still there. Each table has its own scope, so ticks on the products table do
 * not show up on the featured page. Kept in sessionStorage too, so a reload
 * does not throw away a long selection.
 */

const STORAGE_KEY = 'dashboard-selection'

type Selections = Record<string, string[]>

interface SelectionContextValue {
  get: (scope: string) => Set<string>
  set: (scope: string, update: (prev: Set<string>) => Set<string>) => void
}

const SelectionContext = createContext<SelectionContextValue | null>(null)

function load(): Selections {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Selections) : {}
  } catch {
    return {}
  }
}

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selections, setSelections] = useState<Selections>(load)

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selections))
    } catch {
      // Storage is a convenience; the selection still lives in memory.
    }
  }, [selections])

  const get = useCallback(
    (scope: string) => new Set(selections[scope] ?? []),
    [selections],
  )

  const set = useCallback(
    (scope: string, update: (prev: Set<string>) => Set<string>) => {
      setSelections((prev) => ({
        ...prev,
        [scope]: [...update(new Set(prev[scope] ?? []))],
      }))
    },
    [],
  )

  const value = useMemo(() => ({ get, set }), [get, set])

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  )
}

export function useSelectionContext(): SelectionContextValue {
  const ctx = useContext(SelectionContext)
  if (!ctx) {
    throw new Error('useSelectionContext must be used within SelectionProvider')
  }
  return ctx
}
