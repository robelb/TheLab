import { QueryClient } from '@tanstack/react-query'
import { isTransientError } from '@/lib/errors'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      // A dropped connection or a server hiccup often clears in a second or
      // two, so those are tried again before the page shows an error. A 404
      // or a refused request will say the same thing next time.
      retry: (failureCount, error) => failureCount < 2 && isTransientError(error),
    },
  },
})
