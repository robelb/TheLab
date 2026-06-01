export type ButtonStyle = 'pill' | 'rounded' | 'square' | string
export type BrandTheme = 'dark' | 'light' | string

/** How `logo` should be rendered: image URL, inline SVG markup, or data URI. */
export type LogoType = 'url' | 'svg' | 'data-uri'

export interface BrandCustomization {
  borderRadius: string
  spacing: string
  buttonStyle: ButtonStyle
  theme: BrandTheme
  shadows: string
  notes?: string
}

export interface BrandConfig {
  sourceUrl: string
  companyName: string
  description: string
  logo: string | null
  logoType: LogoType | string | null
  favicon: string | null
  primaryColor: string
  secondaryColor: string
  otherColors: string[]
  fonts: string[]
  customization: BrandCustomization
}

/** A named preset in brand.json (id + label + full config). */
export interface BrandPreset extends BrandConfig {
  id: string
  label: string
}

export interface BrandsCatalog {
  defaultBrandId: string
  brands: BrandPreset[]
}

export type BrandConfigOverride = Partial<
  Omit<BrandConfig, 'customization' | 'otherColors' | 'fonts'>
> & {
  otherColors?: string[]
  fonts?: string[]
  customization?: Partial<BrandCustomization>
}
