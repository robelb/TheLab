import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { getProductDisplayImage } from '@/lib/productImage'
import type { Product } from '@/types/product'
import { AddToCartButton } from '@/components/AddToCartButton'
import { formatPrice } from '@/utils/format'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface ProductCardProps {
  product: Product
  index?: number
}

export function ProductCard({ product, index = 0 }: ProductCardProps) {
  const { brandGeneration } = useAuth()
  const detailUrl = `/product/${product.id}`
  const displayImage = getProductDisplayImage(product, brandGeneration)

  return (
    <Card
      className="group relative flex h-full flex-col overflow-hidden border-border/30 bg-card/80 transition-transform hover:-translate-y-0.5"
      style={{
        animationDelay: `${index * 40}ms`,
        animation: 'fadeUp 0.45s ease backwards',
      }}
    >
      <Link
        to={detailUrl}
        className="absolute inset-0 z-0 rounded-[inherit]"
        aria-label={`View ${product.name}`}
      />

      <div className="pointer-events-none relative z-[1]">
        <div className="overflow-hidden">
          <div className="relative aspect-4/3 overflow-hidden">
            <img
              src={displayImage}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover blur-sm"
            />
            <img
              src={displayImage}
              alt={product.name}
              className="relative z-10 h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          </div>
        </div>

        <CardHeader className="gap-1.5 p-3 pb-0">
          <Badge
            variant="secondary"
            className="w-fit px-1.5 py-0 text-[10px] font-medium capitalize"
          >
            {product.category}
          </Badge>
          <CardTitle className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-primary">
            {product.name}
          </CardTitle>
          <CardDescription className="line-clamp-1 text-xs">
            {product.tagline}
          </CardDescription>
        </CardHeader>
      </div>

      <CardFooter className="relative z-[1] mt-auto flex items-center justify-between gap-2 p-3 pt-2">
        <p className="pointer-events-none text-sm font-semibold text-primary">
          {formatPrice(product.price, product.currency)}
        </p>
        <div className="pointer-events-auto">
          <AddToCartButton
            product={product}
            size="sm"
            compact
            disabled={product.stock === 0}
          />
        </div>
      </CardFooter>
    </Card>
  )
}
