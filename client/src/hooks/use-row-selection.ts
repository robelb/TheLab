import { useSelectionContext } from '@/context/SelectionContext'

/**
 * Checkbox selection for a paged table. Selection is kept across pages, so a
 * person can tick rows on page 1, move to page 2 and keep ticking — and it
 * lives in `SelectionContext`, so leaving the table and coming back keeps it
 * too. `scope` names the table; each one has its own selection.
 */
export function useRowSelection(scope: string, pageIds: string[]) {
  const { get, set } = useSelectionContext()
  const selected = get(scope)

  const allOnPage =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const someOnPage = pageIds.some((id) => selected.has(id))

  function toggle(id: string) {
    set(scope, (next) => {
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePage() {
    set(scope, (next) => {
      for (const id of pageIds) {
        if (allOnPage) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  return {
    selected,
    /** What the header checkbox shows. */
    pageState: allOnPage ? true : someOnPage ? ('indeterminate' as const) : false,
    toggle,
    togglePage,
    clear: () => set(scope, () => new Set()),
  }
}
