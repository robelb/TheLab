export type Category = 'ceramics' | 'textiles' | 'lighting' | 'objects'

export interface Product {
  id: string
  name: string
  tagline: string
  price: number
  category: Category
  image: string
  description: string
  details: string[]
}

export const products: Product[] = [
  {
    id: 'vessel-01',
    name: 'Horizon Vessel',
    tagline: 'Hand-thrown stoneware',
    price: 148,
    category: 'ceramics',
    image: 'https://images.unsplash.com/photo-1578749556568-2f6aef9aedd9?w=800&q=80',
    description:
      'A quiet silhouette in matte glaze. Each piece carries subtle variations from the kiln — yours will be one of a kind.',
    details: ['Ø 18 cm × H 24 cm', 'Stoneware, food-safe glaze', 'Made in Oaxaca'],
  },
  {
    id: 'throw-02',
    name: 'Dune Throw',
    tagline: 'Merino & alpaca blend',
    price: 220,
    category: 'textiles',
    image: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80',
    description:
      'Woven on a narrow loom in the Andes. The natural undyed warp gives each throw a soft, sun-faded character.',
    details: ['130 × 180 cm', '70% merino, 30% alpaca', 'Dry clean recommended'],
  },
  {
    id: 'lamp-03',
    name: 'Arc Pendant',
    tagline: 'Brushed brass & linen',
    price: 385,
    category: 'lighting',
    image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&q=80',
    description:
      'A single curve of brass suspends a hand-stitched linen shade. Casts a warm, diffused glow ideal for dining tables.',
    details: ['Ø 40 cm shade', 'E27 socket, bulb not included', 'Adjustable cord 120 cm'],
  },
  {
    id: 'bowl-04',
    name: 'Tide Bowl Set',
    tagline: 'Nested serving trio',
    price: 96,
    category: 'ceramics',
    image: 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=800&q=80',
    description:
      'Three nesting bowls in sea-glass green. Perfect for olives, nuts, or a single perfect fig.',
    details: ['S / M / L — 8, 12, 16 cm', 'Dishwasher safe', 'Set of 3'],
  },
  {
    id: 'candle-05',
    name: 'Ember Candle',
    tagline: 'Beeswax & cedarwood',
    price: 42,
    category: 'objects',
    image: 'https://images.unsplash.com/photo-1602607504337-53266b4bb098?w=800&q=80',
    description:
      'Pure beeswax poured into a reusable ceramic cup. Burns clean for roughly 45 hours with notes of cedar and smoke.',
    details: ['240 g', 'Cedarwood & vetiver', 'Ceramic cup is reusable'],
  },
  {
    id: 'mirror-06',
    name: 'Frame Mirror',
    tagline: 'Walnut & antiqued glass',
    price: 310,
    category: 'objects',
    image: 'https://images.unsplash.com/photo-1618220179428-22790b461013?w=800&q=80',
    description:
      'A wall mirror with a gently bowed walnut frame. The glass has a light antiquing that softens reflections.',
    details: ['45 × 65 cm', 'Solid walnut frame', 'Keyhole hanging hardware'],
  },
  {
    id: 'pillow-07',
    name: 'Loam Cushion',
    tagline: 'Organic linen cover',
    price: 78,
    category: 'textiles',
    image: 'https://images.unsplash.com/photo-1584100936595-c0654b4a2f83?w=800&q=80',
    description:
      'Stonewashed linen in a warm clay tone. Filled with down-alternative for structure without heaviness.',
    details: ['50 × 50 cm', '100% organic linen', 'Hidden zip closure'],
  },
  {
    id: 'sconce-08',
    name: 'Flint Sconce',
    tagline: 'Wall-mounted alabaster',
    price: 265,
    category: 'lighting',
    image: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=800&q=80',
    description:
      'A slab of honed alabaster mounted on blackened steel. The stone glows when lit — like holding light in your palm.',
    details: ['12 × 18 cm stone', 'Hardwired, install required', 'LED compatible'],
  },
]
