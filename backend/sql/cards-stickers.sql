-- Greeting cards and logo stickers as two supply categories of their own,
-- next to packaging and filling. The builder asks for each in its own step,
-- and like the other supplies they stay out of the shop's product lists.
--
-- Applied with `pnpm sql sql/cards-stickers.sql`, and safe to re-run.
-- Matches src/lib/supplies.ts and scripts/import-endeavour.ts.

INSERT INTO categories (name, slug)
  SELECT 'Greeting cards', 'greeting-cards'
  WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'greeting-cards');

INSERT INTO categories (name, slug)
  SELECT 'Logo stickers', 'stickers'
  WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'stickers');

UPDATE products
  SET category_id = (SELECT id FROM categories WHERE slug = 'stickers')
  WHERE category_id = (SELECT id FROM categories WHERE slug = 'cards-stickers')
    AND name ILIKE '%sticker%';

UPDATE products
  SET category_id = (SELECT id FROM categories WHERE slug = 'greeting-cards')
  WHERE category_id = (SELECT id FROM categories WHERE slug = 'cards-stickers');

-- Inside ready-made boxes, the card and the sticker get their own slots.
UPDATE product_components pc
  SET role = CASE c.slug WHEN 'stickers' THEN 'sticker' ELSE 'card' END
  FROM products p
  JOIN categories c ON c.id = p.category_id
  WHERE pc.component_id = p.id
    AND c.slug IN ('greeting-cards', 'stickers')
    AND pc.role = 'item';

DELETE FROM categories
  WHERE slug = 'cards-stickers'
    AND NOT EXISTS (
      SELECT 1 FROM products
      WHERE category_id = (SELECT id FROM categories WHERE slug = 'cards-stickers')
    );
