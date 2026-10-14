import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  brandPresets,
  getDefaultPreset,
  getPresetById,
  presetToConfig,
} from '@/config/brands'
import type {
  BrandConfig,
  BrandConfigOverride,
  BrandPreset,
} from '@/config/brand.types'
import type { VersionedTheme } from '@/api/theme'
import { applyBrandTheme } from '@/lib/applyBrandTheme'
import { mergeBrand } from '@/lib/mergeBrand'

const ACTIVE_ID_KEY = 'brand-active-id'
const EXTRACTED_BRAND_KEY = 'brand-extracted-config'
/** The last house theme the server sent, so the next visit paints it first. */
const HOUSE_THEME_KEY = 'brand-house-theme'
/**
 * Unsaved edits used to be kept per browser under this prefix and laid over
 * the theme on every visit — so whoever had once touched the form saw their
 * own copy from then on, whatever the server said. Cleared on load now.
 */
const LEGACY_OVERRIDE_PREFIX = 'brand-override:'

/** The house theme as applied: `version` null means the bundled one. */
interface HouseTheme {
  version: string | null
  brand: BrandConfig
}

interface BrandContextValue {
  brand: BrandConfig
  activeBrandId: string
  activePreset: BrandPreset
  brands: BrandPreset[]
  hasExtractedBrand: boolean
  /**
   * True while the house brand is being worn regardless of the company's own —
   * see `useHouseBrandLock`. The company's brand is kept underneath and comes
   * back the moment the lock lifts.
   */
  houseLocked: boolean
  setHouseLocked: (locked: boolean) => void
  /** Version of the house theme in use; null while it is the bundled one. */
  houseThemeVersion: string | null
  /** Swap in the house theme the server sent; null goes back to the bundled one. */
  applyHouseTheme: (theme: VersionedTheme<BrandConfig> | null) => void
  /**
   * Put the house theme on and point the edit actions (`setBrand`,
   * `resetBrand`, `replaceBrand`) at a draft of it — the dashboard's way of
   * editing the big little things theme.
   */
  editingHouse: boolean
  setEditingHouse: (editing: boolean) => void
  /** Edits in the form that have not been saved (or discarded) yet. */
  hasUnsavedEdits: boolean
  selectBrand: (id: string) => void
  setBrand: (patch: BrandConfigOverride) => void
  resetBrand: () => void
  replaceBrand: (config: BrandConfig) => void
  applyExtractedBrand: (config: BrandConfig) => void
  clearExtractedBrand: () => void
}

const BrandContext = createContext<BrandContextValue | null>(null)

function loadActiveId(): string {
  try {
    const stored = localStorage.getItem(ACTIVE_ID_KEY)
    if (stored && getPresetById(stored)) return stored
  } catch {
    /* ignore */
  }
  return getDefaultPreset().id
}

function clearLegacyOverrides() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(LEGACY_OVERRIDE_PREFIX)) localStorage.removeItem(key)
    }
  } catch {
    /* ignore */
  }
}

function bundledHouseTheme(): HouseTheme {
  return { version: null, brand: presetToConfig(getDefaultPreset()) }
}

function loadHouseTheme(): HouseTheme {
  try {
    const raw = localStorage.getItem(HOUSE_THEME_KEY)
    if (raw) {
      const cached = JSON.parse(raw) as VersionedTheme<BrandConfig>
      if (cached?.version && cached.brand?.customization) {
        return { version: cached.version, brand: cached.brand }
      }
    }
  } catch {
    /* ignore */
  }
  return bundledHouseTheme()
}

function saveHouseTheme(theme: VersionedTheme<BrandConfig> | null) {
  try {
    if (theme) localStorage.setItem(HOUSE_THEME_KEY, JSON.stringify(theme))
    else localStorage.removeItem(HOUSE_THEME_KEY)
  } catch {
    /* ignore */
  }
}

const hasKeys = (o: BrandConfigOverride | undefined) =>
  !!o && Object.keys(o).length > 0

function loadExtractedBrand(): BrandConfig | null {
  try {
    const raw = localStorage.getItem(EXTRACTED_BRAND_KEY)
    return raw ? (JSON.parse(raw) as BrandConfig) : null
  } catch {
    return null
  }
}

function saveExtractedBrand(config: BrandConfig | null) {
  if (config) {
    localStorage.setItem(EXTRACTED_BRAND_KEY, JSON.stringify(config))
  } else {
    localStorage.removeItem(EXTRACTED_BRAND_KEY)
  }
}

function mergeOverride(
  prev: BrandConfigOverride | undefined,
  patch: BrandConfigOverride,
): BrandConfigOverride {
  return {
    ...prev,
    ...patch,
    otherColors: patch.otherColors ?? prev?.otherColors,
    fonts: patch.fonts ?? prev?.fonts,
    customization: {
      ...prev?.customization,
      ...patch.customization,
    },
  }
}

export function BrandProvider({ children }: { children: ReactNode }) {
  const [extractedBrand, setExtractedBrand] = useState<BrandConfig | null>(
    loadExtractedBrand,
  )
  const [activeBrandId, setActiveBrandId] = useState(loadActiveId)
  const [override, setOverride] = useState<BrandConfigOverride | undefined>()
  const [houseTheme, setHouseTheme] = useState<HouseTheme>(loadHouseTheme)
  const [houseDraft, setHouseDraft] = useState<BrandConfigOverride | undefined>()

  useEffect(clearLegacyOverrides, [])

  const activePreset = useMemo(() => {
    return getPresetById(activeBrandId) ?? getDefaultPreset()
  }, [activeBrandId])

  const base = useMemo(() => {
    if (extractedBrand) return extractedBrand
    // The house preset is whatever the server last said it is.
    if (activePreset.id === getDefaultPreset().id) return houseTheme.brand
    return presetToConfig(activePreset)
  }, [extractedBrand, activePreset, houseTheme.brand])

  // Two separate reasons to wear the house theme, kept apart so neither one
  // switches the other off: a collection (FunnelContext) and the dashboard
  // editing it.
  const [funnelLocked, setHouseLocked] = useState(false)
  const [editingHouse, setEditingHouse] = useState(false)
  const houseLocked = funnelLocked || editingHouse

  const brand = useMemo(
    () =>
      houseLocked
        ? mergeBrand(houseTheme.brand, editingHouse ? houseDraft : undefined)
        : mergeBrand(base, override),
    [houseLocked, editingHouse, houseTheme.brand, houseDraft, base, override],
  )

  useEffect(() => {
    applyBrandTheme(brand)
  }, [brand])

  useEffect(() => {
    localStorage.setItem(ACTIVE_ID_KEY, activeBrandId)
  }, [activeBrandId])

  // Leaving the house editor drops its draft rather than carrying it along.
  useEffect(() => {
    if (!editingHouse) setHouseDraft(undefined)
  }, [editingHouse])

  const applyHouseTheme = useCallback(
    (theme: VersionedTheme<BrandConfig> | null) => {
      saveHouseTheme(theme)
      setHouseTheme(theme ? { ...theme } : bundledHouseTheme())
    },
    [],
  )

  const selectBrand = useCallback(
    (id: string) => {
      const preset = getPresetById(id)
      if (!preset) return
      setExtractedBrand(null)
      saveExtractedBrand(null)
      setActiveBrandId(id)
      setOverride(undefined)
    },
    [],
  )

  const setBrand = useCallback(
    (patch: BrandConfigOverride) => {
      const set = editingHouse ? setHouseDraft : setOverride
      set((prev) => mergeOverride(prev, patch))
    },
    [editingHouse],
  )

  const resetBrand = useCallback(() => {
    if (editingHouse) setHouseDraft(undefined)
    else setOverride(undefined)
  }, [editingHouse])

  const replaceBrand = useCallback(
    (config: BrandConfig) => {
      if (editingHouse) setHouseDraft(config as BrandConfigOverride)
      else setOverride(config as BrandConfigOverride)
    },
    [editingHouse],
  )

  const applyExtractedBrand = useCallback((config: BrandConfig) => {
    setExtractedBrand(config)
    saveExtractedBrand(config)
    setOverride(undefined)
  }, [])

  const clearExtractedBrand = useCallback(() => {
    setExtractedBrand(null)
    saveExtractedBrand(null)
    setOverride(undefined)
    setActiveBrandId(getDefaultPreset().id)
  }, [])

  const value = useMemo(
    () => ({
      brand,
      activeBrandId,
      activePreset,
      brands: brandPresets,
      hasExtractedBrand: extractedBrand !== null,
      houseLocked,
      setHouseLocked,
      houseThemeVersion: houseTheme.version,
      applyHouseTheme,
      editingHouse,
      setEditingHouse,
      hasUnsavedEdits: hasKeys(editingHouse ? houseDraft : override),
      selectBrand,
      setBrand,
      resetBrand,
      replaceBrand,
      applyExtractedBrand,
      clearExtractedBrand,
    }),
    [
      brand,
      activeBrandId,
      activePreset,
      extractedBrand,
      houseLocked,
      houseTheme.version,
      applyHouseTheme,
      editingHouse,
      houseDraft,
      override,
      selectBrand,
      setBrand,
      resetBrand,
      replaceBrand,
      applyExtractedBrand,
      clearExtractedBrand,
    ],
  )

  return (
    <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
  )
}

export function useBrand() {
  const ctx = useContext(BrandContext)
  if (!ctx) throw new Error('useBrand must be used within BrandProvider')
  return ctx
}
