import { useState } from 'react'

/**
 * Checkbox selection for a paged table. Selection is kept across pages, so a
 * person can tick rows on page 1, move to page 2 and keep ticking.
 */
export function useRowSelection(pageIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const allOnPage =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const someOnPage = pageIds.some((id) => selected.has(id))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev)
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
    clear: () => setSelected(new Set()),
  }
}
