import { Card, CardFooter, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function ProductCardSkeleton() {
  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/30 bg-card/80">
      <Skeleton className="aspect-4/3 w-full rounded-none" />
      <CardHeader className="gap-1.5 p-3 pb-0">
        <Skeleton className="h-4 w-16 rounded-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </CardHeader>
      <CardFooter className="mt-auto flex items-center justify-between gap-2 p-3 pt-2">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </CardFooter>
    </Card>
  )
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  )
}
