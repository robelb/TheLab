import { useEffect } from 'react'

/**
 * Sets the tab title and description for the page that is showing, and puts
 * the old ones back when it goes.
 *
 * Only affects the browser and whatever reads the rendered page (Google does);
 * link previews read `index.html` before any script runs, so their tags live
 * there.
 */
export function useDocumentMeta(meta: { title?: string | null; description?: string | null }) {
  const { title, description } = meta
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])

  useEffect(() => {
    if (!description) return
    const tag = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!tag) return
    const previous = tag.content
    tag.content = description
    return () => {
      tag.content = previous
    }
  }, [description])
}
