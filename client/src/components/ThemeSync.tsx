import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchTheme } from '@/api/theme'
import { useAuth } from '@/context/AuthContext'
import { useBrand } from '@/context/BrandContext'
import { mapExtractionToBrand } from '@/lib/mapExtractionToBrand'

export const themeKeys = {
  all: ['theme'] as const,
  bundle: (companyId: string | null) => ['theme', companyId] as const,
}

/** How often an open shop asks whether the theme has changed. */
const CHECK_EVERY_MS = 60_000

/**
 * Keeps every open shop in the theme the dashboard last saved.
 *
 * The theme used to be read once — the bundled house brand, or the company's
 * at sign-in — so a change in the dashboard reached nobody else until they
 * reloaded. This asks the server on load, whenever the tab comes back into
 * focus and once a minute, and applies a theme only when its version differs
 * from the one in use. The answer is a 304 while nothing has changed.
 */
export function ThemeSync() {
  const { company, isLoading, role } = useAuth()
  const {
    houseThemeVersion,
    applyHouseTheme,
    applyExtractedBrand,
    hasUnsavedEdits,
    editingHouse,
  } = useBrand()

  const { data } = useQuery({
    queryKey: themeKeys.bundle(company?.id ?? null),
    queryFn: fetchTheme,
    // Before sign-in settles the token may still be dropped; ask after.
    enabled: !isLoading,
    staleTime: 0,
    refetchInterval: CHECK_EVERY_MS,
    refetchOnWindowFocus: true,
    retry: false,
  })

  const house = data?.house ?? null
  useEffect(() => {
    if (!data) return
    if ((house?.version ?? null) === houseThemeVersion) return
    applyHouseTheme(house)
  }, [data, house, houseThemeVersion, applyHouseTheme])

  // The company theme the last update came from. AuthContext applies the one
  // `/me` returned at sign-in; this takes over from there.
  const companyVersion = useRef<string | null>(null)
  const companyTheme = data?.company ?? null
  useEffect(() => {
    if (!companyTheme || companyTheme.id !== company?.id) return
    // Staff wear the house theme (see AuthContext), never their company's.
    if (role === 'super_admin') return
    if (companyTheme.version === companyVersion.current) return
    // Somebody is mid-edit in the branding form: leave their draft alone and
    // catch up once it is saved or discarded.
    if (hasUnsavedEdits && !editingHouse) return
    companyVersion.current = companyTheme.version
    applyExtractedBrand(mapExtractionToBrand(companyTheme.brand))
  }, [companyTheme, company?.id, role, hasUnsavedEdits, editingHouse, applyExtractedBrand])

  return null
}
