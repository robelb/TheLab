import { and, asc, count, desc, eq, gt, lt, max, min, sql, sum } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { categories, orders, products } from '../../db/schema/index.js'
import { normalizePublicImageUrl } from '../../lib/publicImageUrl.js'

const LOW_STOCK_THRESHOLD = 10

/**
 * The requests this company has sent — the only genuinely per-company numbers
 * here. Everything else on this page describes the shared house catalogue, which
 * is the same for everybody by design.
 */
export interface RequestStats {
  total: number
  new: number
  quoted: number
  confirmed: number
  /** Value of everything not cancelled, so the page can lead with the pipeline. */
  openValue: number
  currency: string
  recent: {
    id: string
    reference: string
    status: string
    contactName: string
    total: number
    currency: string
    neededBy: string | null
    createdAt: Date
  }[]
}

export interface DashboardStats {
  requests: RequestStats
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

const EMPTY_REQUESTS: RequestStats = {
  total: 0,
  new: 0,
  quoted: 0,
  confirmed: 0,
  openValue: 0,
  currency: 'EUR',
  recent: [],
}

/**
 * A guest, or an account with no company, has no requests of its own — so it
 * gets zeros rather than somebody else's numbers.
 */
async function getRequestStats(
  companyId: string | null,
): Promise<RequestStats> {
  if (!companyId) return EMPTY_REQUESTS

  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.companyId, companyId))
    .orderBy(desc(orders.createdAt))

  const byStatus = (status: string) => rows.filter((r) => r.status === status).length
  return {
    total: rows.length,
    new: byStatus('new'),
    quoted: byStatus('quoted'),
    confirmed: byStatus('confirmed'),
    openValue: rows
      .filter((r) => r.status !== 'cancelled')
      .reduce((sum, r) => sum + Number(r.total), 0),
    currency: rows[0]?.currency ?? 'EUR',
    recent: rows.slice(0, 5).map((r) => ({
      id: r.id,
      reference: r.reference,
      status: r.status,
      contactName: r.contact?.name ?? '',
      total: Number(r.total),
      currency: r.currency,
      neededBy: r.delivery?.neededBy ?? null,
      createdAt: r.createdAt,
    })),
  }
}

export async function getDashboardStats(
  companyId: string | null = null,
): Promise<DashboardStats> {
  const [
    [productCount],
    [categoryCount],
    [featured],
    [outOfStock],
    [lowStock],
    [aggregates],
    breakdown,
    recent,
    requests,
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
    getRequestStats(companyId),
  ])

  return {
    requests,
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
