import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface ProductSearchBarProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

export function ProductSearchBar({
  value,
  onChange,
  className,
}: ProductSearchBarProps) {
  return (
    <div className={cn('relative w-full', className)}>
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-12 items-center justify-center">
        <Search
          className="size-5 shrink-0 text-foreground/45"
          strokeWidth={2}
          aria-hidden
        />
      </div>
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by name, SKU, category…"
        className="relative h-12 border-border/50 bg-card/60 pl-12 text-base shadow-brand backdrop-blur-sm"
        aria-label="Search products"
      />
    </div>
  )
}
