import type { BrandConfig, BrandConfigOverride } from '@/config/brand.types'

export function mergeBrand(
  base: BrandConfig,
  override?: BrandConfigOverride,
): BrandConfig {
  if (!override) return base

  return {
    ...base,
    ...override,
    otherColors: override.otherColors ?? base.otherColors,
    fonts: override.fonts ?? base.fonts,
    customization: {
      ...base.customization,
      ...override.customization,
    },
  }
}
