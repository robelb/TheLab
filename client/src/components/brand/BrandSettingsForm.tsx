import { useState } from 'react'
import { brandPalette } from '@/lib/applyBrandTheme'
import { BrandSwitcher } from '@/components/BrandSwitcher'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { BrandConfig, BrandCustomization } from '@/config/brand.types'
import { useBrand } from '@/context/BrandContext'

function ColorField({
  id,
  label,
  value,
  onChange,
  auto,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  /**
   * The colour used while this one is left empty. Given, the field may be
   * cleared back to it; empty, it shows that colour and says it is automatic.
   */
  auto?: string
  hint?: string
}) {
  const isAuto = auto !== undefined && !value
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {isAuto && <span className="font-normal text-muted-foreground"> · auto</span>}
        </Label>
        {auto !== undefined && !isAuto && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Auto
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          type="color"
          value={isAuto ? auto : value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 shrink-0 cursor-pointer p-1"
        />
        <Input
          value={value}
          placeholder={isAuto ? auto : undefined}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-sm"
        />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function BrandSettingsForm() {
  const {
    brand,
    activePreset,
    editingHouse,
    setBrand,
    resetBrand,
    replaceBrand,
  } = useBrand()
  // What the newer colours fall back to, worked out with them left empty.
  const autoPalette = brandPalette({ ...brand, otherColors: brand.otherColors.slice(0, 3) })
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [jsonDraft, setJsonDraft] = useState('')

  function patchCustomization<K extends keyof BrandCustomization>(
    key: K,
    value: BrandCustomization[K],
  ) {
    setBrand({ customization: { [key]: value } })
  }

  function patchOtherColor(index: number, value: string) {
    // Empty slots are '' rather than holes: the theme is saved as a list of
    // strings, and '' is what "work it out" means for the newer ones.
    const next = Array.from(
      { length: Math.max(brand.otherColors.length, index + 1) },
      (_, i) => brand.otherColors[i] ?? '',
    )
    next[index] = value
    setBrand({ otherColors: next })
  }

  function patchFont(index: number, value: string) {
    const next = [...brand.fonts]
    next[index] = value
    while (next.length < 3) next.push('')
    setBrand({ fonts: next.filter(Boolean) })
  }

  function exportJson() {
    setJsonDraft(JSON.stringify(brand, null, 2))
    setJsonError(null)
  }

  function importJson() {
    try {
      const parsed = JSON.parse(jsonDraft) as BrandConfig
      replaceBrand(parsed)
      setJsonError(null)
    } catch {
      setJsonError('Invalid JSON — check syntax and try again.')
    }
  }

  return (
    <div className="space-y-6">
      {/* The house theme is one theme, not a pick from the presets. */}
      {!editingHouse && (
        <Card>
          <CardHeader>
            <CardTitle>Brand preset</CardTitle>
            <CardDescription>
              Switch between {activePreset.label} and other catalog brands
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BrandSwitcher variant="full" />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>Company name, assets, and source URL</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="companyName">Company name</Label>
            <Input
              id="companyName"
              value={brand.companyName}
              onChange={(e) => setBrand({ companyName: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={brand.description}
              onChange={(e) => setBrand({ description: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="sourceUrl">Source URL</Label>
            <Input
              id="sourceUrl"
              value={brand.sourceUrl}
              onChange={(e) => setBrand({ sourceUrl: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logo">Logo URL</Label>
            <Input
              id="logo"
              placeholder="https://..."
              value={brand.logo ?? ''}
              onChange={(e) => setBrand({ logo: e.target.value || null })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="favicon">Favicon URL</Label>
            <Input
              id="favicon"
              value={brand.favicon ?? ''}
              onChange={(e) => setBrand({ favicon: e.target.value || null })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Colors</CardTitle>
          <CardDescription>
            Primary, secondary, and supporting palette
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ColorField
            id="primaryColor"
            label="Primary"
            value={brand.primaryColor}
            onChange={(v) => setBrand({ primaryColor: v })}
          />
          <ColorField
            id="secondaryColor"
            label="Secondary (background)"
            value={brand.secondaryColor}
            onChange={(v) => setBrand({ secondaryColor: v })}
          />
          <ColorField
            id="other0"
            label="Foreground"
            value={brand.otherColors[0] ?? '#ffffff'}
            onChange={(v) => patchOtherColor(0, v)}
          />
          <ColorField
            id="other1"
            label="Primary foreground / accent alt"
            value={brand.otherColors[1] ?? '#000000'}
            onChange={(v) => patchOtherColor(1, v)}
          />
          <ColorField
            id="other2"
            label="Muted text"
            hint="Captions, hints and secondary labels."
            value={brand.otherColors[2] ?? '#b3b3b3'}
            onChange={(v) => patchOtherColor(2, v)}
          />
          <ColorField
            id="other3"
            label="Borders"
            hint="Resting lines: cards, tiles, dividers and table rows."
            value={brand.otherColors[3] ?? ''}
            auto={autoPalette.border}
            onChange={(v) => patchOtherColor(3, v)}
          />
          <ColorField
            id="other6"
            label="Strong borders & field outlines"
            hint="Hover and selected states, input fields and outline buttons."
            value={brand.otherColors[6] ?? ''}
            auto={autoPalette.borderStrong}
            onChange={(v) => patchOtherColor(6, v)}
          />
          <ColorField
            id="other4"
            label="Placeholder text"
            hint="The grey example text inside empty fields."
            value={brand.otherColors[4] ?? ''}
            auto={autoPalette.placeholder}
            onChange={(v) => patchOtherColor(4, v)}
          />
          <ColorField
            id="other5"
            label="Muted background"
            hint="Quiet surfaces: image wells, chips, hover rows."
            value={brand.otherColors[5] ?? ''}
            auto={autoPalette.mutedSurface}
            onChange={(v) => patchOtherColor(5, v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Typography</CardTitle>
          <CardDescription>
            Font family names (load custom fonts separately via @font-face)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Label htmlFor={`font-${i}`}>Font {i + 1}</Label>
              <Input
                id={`font-${i}`}
                value={brand.fonts[i] ?? ''}
                onChange={(e) => patchFont(i, e.target.value)}
                placeholder="Font family name"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customization</CardTitle>
          <CardDescription>
            Radius, spacing, theme, and component style
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="borderRadius">Border radius</Label>
            <Input
              id="borderRadius"
              value={brand.customization.borderRadius}
              onChange={(e) => patchCustomization('borderRadius', e.target.value)}
              placeholder="8px"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="spacing">Spacing unit</Label>
            <Input
              id="spacing"
              value={brand.customization.spacing}
              onChange={(e) => patchCustomization('spacing', e.target.value)}
              placeholder="8px"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="buttonStyle">Button style</Label>
            <select
              id="buttonStyle"
              value={brand.customization.buttonStyle}
              onChange={(e) => patchCustomization('buttonStyle', e.target.value)}
              className="flex h-10 w-full rounded-brand border border-input bg-background px-3 text-sm"
            >
              <option value="pill">pill</option>
              <option value="rounded">rounded</option>
              <option value="square">square</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="theme">Theme</Label>
            <select
              id="theme"
              value={brand.customization.theme}
              onChange={(e) => patchCustomization('theme', e.target.value)}
              className="flex h-10 w-full rounded-brand border border-input bg-background px-3 text-sm"
            >
              <option value="dark">dark</option>
              <option value="light">light</option>
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="shadows">Shadows</Label>
            <Input
              id="shadows"
              value={brand.customization.shadows}
              onChange={(e) => patchCustomization('shadows', e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={brand.customization.notes ?? ''}
              onChange={(e) => patchCustomization('notes', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import / export</CardTitle>
          <CardDescription>
            Paste full brand JSON to replace all settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            value={jsonDraft}
            onChange={(e) => setJsonDraft(e.target.value)}
            placeholder="Paste brand JSON here..."
            className="min-h-[200px] w-full rounded-brand border border-input bg-background/50 p-3 font-mono text-xs"
          />
          {jsonError && <p className="text-sm text-destructive">{jsonError}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={exportJson}>
              Export current
            </Button>
            <Button type="button" onClick={importJson}>
              Import JSON
            </Button>
            <Button type="button" variant="ghost" onClick={resetBrand}>
              {editingHouse
                ? 'Discard changes'
                : `Reset ${activePreset.label} preset`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
