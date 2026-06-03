/** Log extraction failures to the server console (dev / debugging). */
export function logExtractFailure(
  stage: string,
  context: Record<string, unknown>,
  err?: unknown,
): void {
  const error =
    err instanceof Error
      ? { message: err.message, name: err.name, stack: err.stack }
      : err !== undefined
        ? { message: String(err) }
        : undefined

  console.error('[extract] failed', { stage, ...context, error })
}
