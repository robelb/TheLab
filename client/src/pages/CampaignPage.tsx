import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ProductCard } from '@/components/ProductCard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useCampaign } from '@/hooks/use-campaigns'

export function CampaignPage() {
  const { id } = useParams<{ id: string }>()
  const { data: campaign, isLoading, error } = useCampaign(id)

  return (
    <div className="space-y-10">
      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2">
        <Link to="/">
          <ArrowLeft className="size-4" />
          Back to shop
        </Link>
      </Button>

      {isLoading && <Skeleton className="h-80 rounded-brand" />}

      {!isLoading && (error || !campaign) && (
        <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Campaign not found'}
        </p>
      )}

      {campaign && (
        <>
          <section className="space-y-4">
            <h1 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              {campaign.title}
            </h1>
            {campaign.description && (
              <p className="max-w-2xl text-lg text-muted-foreground">
                {campaign.description}
              </p>
            )}
          </section>

          {campaign.videos.length > 0 ? (
            <div className="space-y-4">
              {campaign.videos.map((v) => (
                <div
                  key={v.id}
                  className="overflow-hidden rounded-brand border border-border/40 bg-card/50"
                >
                  <video
                    src={v.url}
                    controls
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                    className={
                      v.orientation === 'portrait'
                        ? 'mx-auto max-h-[80vh] w-auto'
                        : 'w-full'
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            campaign.heroImageUrl && (
              <div className="overflow-hidden rounded-brand border border-border/40">
                <img
                  src={campaign.heroImageUrl}
                  alt={campaign.title}
                  className="w-full object-cover"
                />
              </div>
            )
          )}

          {campaign.products.length > 0 && (
            <section className="space-y-6">
              <h2 className="font-display text-xl font-semibold">
                In this collection
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                {campaign.products.map((product, i) => (
                  <ProductCard key={product.id} product={product} index={i} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
