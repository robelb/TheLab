import { and, asc, count, desc, eq, gt, lt, max, min, sql, sum } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { categories, products } from '../../db/schema/index.js'
import { normalizePublicImageUrl } from '../../lib/publicImageUrl.js'

const LOW_STOCK_THRESHOLD = 10

export interface DashboardStats {
  totals: {
    products: number
    categories: number
    featured: number
    outOfStock: number
    lowStock: number
    totalStock: number
    inventoryValue: number
  }
  priceRange: { min: number; max: number; avg: number }
  categoryBreakdown: { name: string; slug: string; count: number }[]
  recentProducts: {
    id: string
    name: string
    sku: string
    price: number
    currency: string
    stock: number
    image: string
    category: string
    createdAt: Date
  }[]
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [
    [productCount],
    [categoryCount],
    [featured],
    [outOfStock],
    [lowStock],
    [aggregates],
    breakdown,
    recent,
  ] = await Promise.all([
    db.select({ value: count() }).from(products),
    db.select({ value: count() }).from(categories),
    db
      .select({ value: count() })
      .from(products)
      .where(eq(products.isFeatured, true)),
    db
      .select({ value: count() })
      .from(products)
      .where(eq(products.stock, 0)),
    db
      .select({ value: count() })
      .from(products)
      .where(and(gt(products.stock, 0), lt(products.stock, LOW_STOCK_THRESHOLD))),
    db
      .select({
        totalStock: sum(products.stock),
        minPrice: min(products.price),
        maxPrice: max(products.price),
        avgPrice: sql<string>`avg(${products.price})`,
        inventoryValue: sql<string>`coalesce(sum(${products.price} * ${products.stock}), 0)`,
      })
      .from(products),
    db
      .select({
        name: categories.name,
        slug: categories.slug,
        count: count(products.id),
      })
      .from(categories)
      .leftJoin(products, eq(products.categoryId, categories.id))
      .groupBy(categories.id, categories.name, categories.slug)
      .orderBy(desc(count(products.id)), asc(categories.name)),
    db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        price: products.price,
        currency: products.currency,
        stock: products.stock,
        image: products.image,
        category: categories.name,
        createdAt: products.createdAt,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .orderBy(desc(products.createdAt))
      .limit(5),
  ])

  return {
    totals: {
      products: productCount?.value ?? 0,
      categories: categoryCount?.value ?? 0,
      featured: featured?.value ?? 0,
      outOfStock: outOfStock?.value ?? 0,
      lowStock: lowStock?.value ?? 0,
      totalStock: Number(aggregates?.totalStock ?? 0),
      inventoryValue: Number(aggregates?.inventoryValue ?? 0),
    },
    priceRange: {
      min: Number(aggregates?.minPrice ?? 0),
      max: Number(aggregates?.maxPrice ?? 0),
      avg: Number(aggregates?.avgPrice ?? 0),
    },
    categoryBreakdown: breakdown.map((b) => ({
      name: b.name,
      slug: b.slug,
      count: b.count,
    })),
    recentProducts: recent.map((r) => ({
      ...r,
      price: Number(r.price),
      image: normalizePublicImageUrl(r.image) ?? r.image,
    })),
  }
}
