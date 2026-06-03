import { Skeleton } from '@/components/ui/skeleton'

export function ProductDetailSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-8 w-32" />

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <Skeleton className="aspect-4/5 w-full rounded-brand lg:aspect-square" />

        <div className="flex flex-col gap-5">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-20" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-px w-full" />
          <div className="space-y-2 rounded-md border border-border/30 p-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  )
}
