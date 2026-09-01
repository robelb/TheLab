import { useMutation } from '@tanstack/react-query'
import { composeMockup, type ComposeRequest } from '@/api/compose'

/**
 * The flat mockup. A mutation rather than a query — it runs on an explicit
 * click and the caller keeps the URL to apply.
 */
export function useComposeMockup() {
  return useMutation({
    mutationFn: (body: ComposeRequest) => composeMockup(body),
  })
}
