import type { BrandConfig, BrandPreset, BrandsCatalog } from './brand.types'
import catalogJson from './brand.json'

export const brandsCatalog = catalogJson as BrandsCatalog

export const brandPresets = brandsCatalog.brands

export function presetToConfig(preset: BrandPreset): BrandConfig {
  const { id: _id, label: _label, ...config } = preset
  return config
}

export function getPresetById(id: string): BrandPreset | undefined {
  return brandPresets.find((b) => b.id === id)
}

export function getDefaultPreset(): BrandPreset {
  return (
    getPresetById(brandsCatalog.defaultBrandId) ??
    brandPresets[0]!
  )
}

/** @deprecated Use active preset from BrandContext */
export const defaultBrand: BrandConfig = presetToConfig(getDefaultPreset())
