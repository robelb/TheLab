import { Check, ListFilter, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CategoryFilterProps {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
}

export function CategoryFilter({
  options,
  selected,
  onChange,
}: CategoryFilterProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close when clicking outside the dropdown.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const toggle = (name: string) => {
    onChange(
      selected.includes(name)
        ? selected.filter((c) => c !== name)
        : [...selected, name],
    )
  }

  return (
    <div ref={ref} className="relative">
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((o) => !o)}
        className={cn(selected.length > 0 && 'border-primary text-primary')}
      >
        <ListFilter className="size-4" />
        Category
        {selected.length > 0 && (
          <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
            {selected.length}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-60 overflow-hidden rounded-brand border border-border/40 bg-popover shadow-brand">
          <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Filter by category
            </span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
                Clear
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {options.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                No categories
              </p>
            )}
            {options.map((name) => {
              const active = selected.includes(name)
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggle(name)}
                  className="flex w-full items-center gap-2 rounded-brand px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/40"
                >
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded border',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border',
                    )}
                  >
                    {active && <Check className="size-3" />}
                  </span>
                  <span className="truncate">{name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
