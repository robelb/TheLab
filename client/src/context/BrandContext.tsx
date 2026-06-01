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
import { applyBrandTheme } from '@/lib/applyBrandTheme'
import { mergeBrand } from '@/lib/mergeBrand'

const ACTIVE_ID_KEY = 'brand-active-id'
const EXTRACTED_BRAND_KEY = 'brand-extracted-config'
const overrideKey = (id: string) => `brand-override:${id}`

interface BrandContextValue {
  brand: BrandConfig
  activeBrandId: string
  activePreset: BrandPreset
  brands: BrandPreset[]
  hasExtractedBrand: boolean
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

function loadOverride(id: string): BrandConfigOverride | undefined {
  try {
    const raw = localStorage.getItem(overrideKey(id))
    return raw ? (JSON.parse(raw) as BrandConfigOverride) : undefined
  } catch {
    return undefined
  }
}

function saveOverride(id: string, override: BrandConfigOverride | undefined) {
  if (override && Object.keys(override).length > 0) {
    localStorage.setItem(overrideKey(id), JSON.stringify(override))
  } else {
    localStorage.removeItem(overrideKey(id))
  }
}

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
  const [override, setOverride] = useState<BrandConfigOverride | undefined>(
    () => loadOverride(loadActiveId()),
  )

  const activePreset = useMemo(() => {
    return getPresetById(activeBrandId) ?? getDefaultPreset()
  }, [activeBrandId])

  const base = useMemo(() => {
    if (extractedBrand) return extractedBrand
    return presetToConfig(activePreset)
  }, [extractedBrand, activePreset])

  const brand = useMemo(() => mergeBrand(base, override), [base, override])

  useEffect(() => {
    applyBrandTheme(brand)
  }, [brand])

  useEffect(() => {
    localStorage.setItem(ACTIVE_ID_KEY, activeBrandId)
  }, [activeBrandId])

  useEffect(() => {
    saveOverride(activeBrandId, override)
  }, [activeBrandId, override])

  const selectBrand = useCallback(
    (id: string) => {
      const preset = getPresetById(id)
      if (!preset) return
      setExtractedBrand(null)
      saveExtractedBrand(null)
      setActiveBrandId(id)
      setOverride(loadOverride(id))
    },
    [],
  )

  const setBrand = useCallback((patch: BrandConfigOverride) => {
    setOverride((prev) => mergeOverride(prev, patch))
  }, [])

  const resetBrand = useCallback(() => {
    setOverride(undefined)
    saveOverride(activeBrandId, undefined)
  }, [activeBrandId])

  const replaceBrand = useCallback((config: BrandConfig) => {
    setOverride(config as BrandConfigOverride)
  }, [])

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
