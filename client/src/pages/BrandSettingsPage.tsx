import { BrandSettingsForm } from '@/components/brand/BrandSettingsForm'

export function BrandSettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-bold">Brand customization</h1>
        <p className="text-muted-foreground">
          Pick a preset from{' '}
          <code className="rounded bg-muted/30 px-1.5 py-0.5 text-xs">
            src/config/brand.json
          </code>
          . Per-brand tweaks are saved separately in your browser.
        </p>
      </div>

      <BrandSettingsForm />

      <p className="text-center text-xs text-muted-foreground">
        Preview updates live across the shop. Edit{' '}
        <code className="text-primary">src/config/brand.json</code> for defaults
        committed to the repo.
      </p>
    </div>
  )
}
