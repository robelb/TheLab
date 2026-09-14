/**
 * Seed the pre-configured Christmas boxes and the landing collection that
 * shows them.
 *
 * A bundle is an ordinary product row with `kind = 'bundle'`: it has its own
 * price, picture and tags, and the things inside it are rows in
 * `product_components`. It sits in its own `gift-boxes` category so the supply
 * filter that hides packaging and filling from the shop leaves it alone.
 *
 * The three prices come from the marketing site's Christmas configurator and
 * are deliberately not the sum of their parts — that is the whole reason a
 * bundle has a price of its own. Contents are chosen from whatever is in the
 * catalogue, cheapest-first towards a parts budget, and printed so they can be
 * adjusted afterwards from the dashboard.
 *
 * Idempotent: matches on SKU and replaces each bundle's parts list, so
 * re-running updates in place.
 *
 *   pnpm db:seed:bundles
 */
import { randomUUID } from 'node:crypto'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import {
  categories,
  collections,
  productComponents,
  products,
} from '../src/db/schema/index.js'
import {
  FILLING_SLUG,
  PACKAGING_SLUG,
  SUPPLY_CATEGORY_SLUGS,
} from '../src/lib/supplies.js'
import { embedText } from '../src/services/embedding.js'

/** Where bundles live. Not a supply category, so the shop shows them. */
const GIFT_BOX_CATEGORY = { slug: 'gift-boxes', name: 'Gift boxes' }

/** The occasion these are filtered by, and the landing page's slug. */
const TAG = 'christmas'
const COLLECTION_SLUG = 'weihnachten'

interface BundlePlan {
  sku: string
  name: string
  tagline: string
  description: string
  /** Net price from the marketing site, in EUR. */
  price: number
  /** How many catalogue items go in, and roughly what they may cost together. */
  itemCount: number
  partsBudget: number
  minQuantity: number
}

/**
 * German, because these are sold on a German landing page to German buyers.
 *
 * A product's name and tagline are single columns rather than a translated
 * pair — the catalogue comes from suppliers that way — so the language of a
 * product is whichever market it is stocked for.
 */
const BUNDLES: BundlePlan[] = [
  {
    sku: 'BLT-XMAS-VOL1',
    name: 'Weihnachtsbox Vol. 1',
    tagline: 'Kleine Aufmerksamkeit, fertig gepackt',
    description:
      'Die Einstiegsbox: zwei ausgewählte Stücke, verpackt und bereit zum Überreichen. Auf Wunsch mit Ihrem Logo.',
    price: 12.06,
    itemCount: 2,
    partsBudget: 14,
    minQuantity: 1,
  },
  {
    sku: 'BLT-XMAS-VOL2',
    name: 'Weihnachtsbox Vol. 2',
    tagline: 'Mit einem Stück, das Ihr Logo trägt',
    description:
      'Die mittlere Box: Kleinigkeiten plus ein bedruckbares Stück, das noch lange nach den Feiertagen auf dem Schreibtisch steht.',
    price: 22.58,
    itemCount: 3,
    partsBudget: 26,
    minQuantity: 1,
  },
  {
    sku: 'BLT-XMAS-VOL3',
    name: 'Weihnachtsbox Vol. 3',
    tagline: 'Die große Box für Kundinnen und Kunden',
    description:
      'Die größte der drei: ein hochwertiges Hauptstück, umgeben von kleineren Beigaben, in einer Box, die sich sehen lassen kann.',
    price: 25.92,
    itemCount: 3,
    partsBudget: 34,
    minQuantity: 1,
  },
]

async function tryEmbed(text: string): Promise<number[] | null> {
  try {
    return await embedText(text)
  } catch (err) {
    console.warn(
      `  embedding failed (${err instanceof Error ? err.message : err}) — continuing without`,
    )
    return null
  }
}

type Pick = { id: string; sku: string; name: string; price: number }

/**
 * Choose contents for a bundle.
 *
 * Most expensive first, taking whatever still fits the budget. Cheapest-first
 * was the obvious reading of "up to the budget" and produced nonsense: three
 * boxes of twenty-cent pins priced at €26, because it filled the item count
 * long before it came near the money. Spending the budget is the point — a box
 * sold for €25 has to look like €25 of things.
 *
 * Products already used by an earlier bundle are skipped so the three boxes do
 * not read as the same box three times, and the fallback reuses rather than
 * shipping a box with nothing in it.
 */
function pickItems(
  pool: Pick[],
  used: Set<string>,
  plan: BundlePlan,
): Pick[] {
  const chosen: Pick[] = []
  // The pool arrives price-ascending for the supply lookups; contents want the
  // other end of it.
  const expensiveFirst = [...pool].sort((a, b) => b.price - a.price)

  // Leave room for the ones still to come, so the first pick cannot eat the
  // whole budget and force the rest to be the cheapest thing in the catalogue.
  for (let slot = 0; slot < plan.itemCount; slot++) {
    const spent = chosen.reduce((sum, c) => sum + c.price, 0)
    const slotsLeft = plan.itemCount - slot
    const ceiling = (plan.partsBudget - spent) / slotsLeft

    const pick =
      expensiveFirst.find(
        (c) =>
          !used.has(c.id) &&
          !chosen.some((x) => x.id === c.id) &&
          c.price <= ceiling,
      ) ??
      // Nothing fits: take the cheapest unused thing rather than nothing.
      [...expensiveFirst]
        .reverse()
        .find((c) => !used.has(c.id) && !chosen.some((x) => x.id === c.id))

    if (!pick) break
    chosen.push(pick)
  }

  // The catalogue ran out of products nobody else is using.
  for (const candidate of expensiveFirst) {
    if (chosen.length >= plan.itemCount) break
    if (chosen.some((c) => c.id === candidate.id)) continue
    chosen.push(candidate)
  }
  return chosen
}

async function seedBundles() {
  // 1. The category bundles live in.
  const existingCategories = await db.select().from(categories)
  const bySlug = new Map(existingCategories.map((c) => [c.slug, c.id]))

  let giftBoxCategoryId = bySlug.get(GIFT_BOX_CATEGORY.slug)
  if (!giftBoxCategoryId) {
    const [created] = await db
      .insert(categories)
      .values({
        id: randomUUID(),
        name: GIFT_BOX_CATEGORY.name,
        slug: GIFT_BOX_CATEGORY.slug,
      })
      .returning({ id: categories.id })
    giftBoxCategoryId = created.id
    console.log(`Created category ${GIFT_BOX_CATEGORY.slug}`)
  }

  // 2. What there is to put in a box: the catalogue, then one box and one lot
  //    of filling. Packaging and filling are charged like any other component,
  //    so every bundle gets the cheapest of each.
  const catalogue = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      price: products.price,
      image: products.image,
      categorySlug: categories.slug,
      kind: products.kind,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    // Name breaks ties on price. Without it two equally cheap boxes come back
    // in whatever order the planner felt like, and re-running the seed quietly
    // swapped the packaging inside every bundle.
    .orderBy(asc(products.price), asc(products.name))

  const items = catalogue
    .filter(
      (p) =>
        p.kind === 'single' &&
        !SUPPLY_CATEGORY_SLUGS.includes(p.categorySlug) &&
        p.categorySlug !== GIFT_BOX_CATEGORY.slug,
    )
    .map((p) => ({ id: p.id, sku: p.sku, name: p.name, price: Number(p.price) }))

  // The cheapest of each, and the same one every run.
  const packaging = catalogue.find((p) => p.categorySlug === PACKAGING_SLUG)
  const filling = catalogue.find((p) => p.categorySlug === FILLING_SLUG)

  if (items.length === 0) {
    throw new Error(
      'No catalogue products found. Run `pnpm db:seed` before seeding bundles.',
    )
  }
  if (!packaging || !filling) {
    throw new Error(
      'No packaging or filling found. Run `pnpm db:seed:supplies` before seeding bundles.',
    )
  }

  // 3. Upsert each bundle and replace its parts list.
  const existing = await db
    .select({ id: products.id, sku: products.sku })
    .from(products)
    .where(inArray(products.sku, BUNDLES.map((b) => b.sku)))
  const existingBySku = new Map(existing.map((p) => [p.sku, p.id]))

  const used = new Set<string>()
  const bundleIds: string[] = []
  const componentIds = new Set<string>()

  for (const plan of BUNDLES) {
    const contents = pickItems(items, used, plan)
    contents.forEach((c) => used.add(c.id))
    contents.forEach((c) => componentIds.add(c.id))

    const embedding = await tryEmbed(
      [plan.name, plan.tagline, plan.description].join('. '),
    )

    const values = {
      sourceId: 'bundle',
      variantId: null,
      sku: plan.sku,
      name: plan.name,
      tagline: plan.tagline,
      price: String(plan.price),
      currency: 'EUR',
      stock: 9_999,
      categoryId: giftBoxCategoryId,
      // Until someone shoots the real box, the most expensive thing inside it
      // is the most representative picture available.
      image: contents[contents.length - 1]?.id
        ? (catalogue.find((c) => c.id === contents[contents.length - 1].id)
            ?.image ?? packaging.image)
        : packaging.image,
      images: [] as string[],
      description: plan.description,
      details: [
        `Inhalt: ${contents.map((c) => c.name).join(', ')}`,
        `Verpackung: ${packaging.name}`,
        `Füllmaterial: ${filling.name}`,
      ],
      isFeatured: true,
      kind: 'bundle' as const,
      tags: [TAG],
      minQuantity: plan.minQuantity,
      ...(embedding ? { embedding, embeddingUpdatedAt: new Date() } : {}),
    }
    values.images = [values.image]

    let bundleId = existingBySku.get(plan.sku)
    if (bundleId) {
      await db.update(products).set(values).where(eq(products.id, bundleId))
    } else {
      const [created] = await db
        .insert(products)
        .values({ id: randomUUID(), ...values } as never)
        .returning({ id: products.id })
      bundleId = created.id
    }
    bundleIds.push(bundleId)

    // Replace the parts list wholesale — the plan above is the truth.
    await db
      .delete(productComponents)
      .where(eq(productComponents.bundleId, bundleId))
    await db.insert(productComponents).values([
      ...contents.map((c, i) => ({
        bundleId,
        componentId: c.id,
        quantity: 1,
        role: 'item' as const,
        sortOrder: i,
      })),
      {
        bundleId,
        componentId: packaging.id,
        quantity: 1,
        role: 'packaging' as const,
        sortOrder: 90,
      },
      {
        bundleId,
        componentId: filling.id,
        quantity: 1,
        role: 'filling' as const,
        sortOrder: 91,
      },
    ])

    const partsTotal =
      contents.reduce((sum, c) => sum + c.price, 0) +
      Number(packaging.price) +
      Number(filling.price)
    console.log(
      `  ${existingBySku.has(plan.sku) ? 'updated' : 'inserted'} ${plan.sku} — ${plan.name}`,
    )
    console.log(
      `    €${plan.price.toFixed(2)} bundle price vs €${partsTotal.toFixed(2)} by parts`,
    )
    contents.forEach((c) => console.log(`    · ${c.name} (€${c.price.toFixed(2)})`))
    console.log(`    · ${packaging.name} [packaging]`)
    console.log(`    · ${filling.name} [filling]`)
  }

  // 4. Tag what is inside them too, so the collection's filtered catalogue has
  //    something in it beyond the three boxes.
  if (componentIds.size > 0) {
    await db
      .update(products)
      .set({
        tags: sql`CASE WHEN ${products.tags} @> ${JSON.stringify([TAG])}::jsonb
                       THEN ${products.tags}
                       ELSE ${products.tags} || ${JSON.stringify([TAG])}::jsonb END`,
      })
      .where(inArray(products.id, [...componentIds]))
    console.log(`Tagged ${componentIds.size} products with "${TAG}".`)
  }

  // 5. The landing page those three boxes are the headline of.
  const [existingCollection] = await db
    .select({ id: collections.id })
    .from(collections)
    .where(eq(collections.slug, COLLECTION_SLUG))
    .limit(1)

  const collectionValues = {
    slug: COLLECTION_SLUG,
    title: {
      de: 'Weihnachtsgeschenke für Ihr Team',
      en: 'Christmas gifts for your team',
    },
    subtitle: {
      de: 'Fertig gepackte Boxen oder Ihre eigene — mit Ihrem Logo, in zwei Minuten konfiguriert.',
      en: 'Ready-packed boxes or build your own — with your logo, configured in two minutes.',
    },
    tag: TAG,
    featuredBundleIds: bundleIds,
    defaultLocale: 'de',
    active: true,
    sortOrder: 0,
  }

  if (existingCollection) {
    await db
      .update(collections)
      .set(collectionValues)
      .where(eq(collections.id, existingCollection.id))
    console.log(`Updated collection /c/${COLLECTION_SLUG}`)
  } else {
    await db.insert(collections).values(collectionValues)
    console.log(`Created collection /c/${COLLECTION_SLUG}`)
  }

  console.log(`\nDone. Landing link: /c/${COLLECTION_SLUG}?lang=de`)
}

seedBundles()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Bundle seed failed:', err)
    process.exit(1)
  })
