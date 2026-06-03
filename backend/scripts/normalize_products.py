#!/usr/bin/env python3
"""
Normalize midocean supplier catalog: one row per product using the first variant only.

Reads:  backend/src/data/realProducts.ts  (JSON array, despite .ts extension)
Writes: backend/src/data/normalizedProducts.json
        backend/src/data/normalizedProducts.ts  (optional TS module for the API)

Usage:
  python3 backend/scripts/normalize_products.py
  python3 backend/scripts/normalize_products.py --input path/to/raw.json --output-dir backend/src/data
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


IMAGE_SUBTYPE_PRIORITY = (
    "item_picture_front",
    "item_picture_open",
    "item_picture_top",
    "item_picture_back",
    "item_detail_picture",
    "item_picture_printed",
    "item_picture_box",
)


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "uncategorized"


def pick_image(variant: dict[str, Any]) -> str | None:
    assets = variant.get("supplierProductDigitalAssets") or []
    images = [a for a in assets if a.get("type") == "image" and a.get("url")]
    if not images:
        return None

    by_subtype = {a.get("subtype"): a["url"] for a in images if a.get("subtype")}
    for subtype in IMAGE_SUBTYPE_PRIORITY:
        if subtype in by_subtype:
            return by_subtype[subtype]

    return images[0]["url"]


def pick_price(variant: dict[str, Any], product: dict[str, Any]) -> tuple[float, str]:
    price_block = variant.get("supplierProductPrice") or {}
    base = float(price_block.get("price") or 0)
    multiplier = float(price_block.get("multiplier") or 1)
    currency = price_block.get("currency") or "EUR"

    if base > 0:
        return round(base * multiplier, 2), currency

    retail = product.get("netRetailPrice") or {}
    amount = float(retail.get("amount") or 0)
    if amount > 0:
        return round(amount, 2), retail.get("currency") or currency

    recommended = float(product.get("recommendedNetSalePrice") or 0)
    if recommended > 0:
        return round(recommended, 2), currency

    return 0.0, currency


def pick_stock(variant: dict[str, Any], product: dict[str, Any]) -> int:
    stock_block = variant.get("supplierProductStock") or {}
    qty = stock_block.get("quantity")
    if qty is not None:
        return int(qty)

    product_stock = product.get("stock")
    if isinstance(product_stock, dict) and product_stock.get("quantity") is not None:
        return int(product_stock["quantity"])
    if isinstance(product_stock, (int, float)):
        return int(product_stock)

    return 0


def build_details(
    product: dict[str, Any],
    variant: dict[str, Any],
    *,
    sku: str,
    stock: int,
    currency: str,
) -> list[str]:
    details: list[str] = []

    if sku:
        details.append(f"SKU: {sku}")
    if variant.get("colorDescription"):
        details.append(f"Color: {variant['colorDescription']}")
    if product.get("brand"):
        details.append(f"Brand: {product['brand']}")
    details.append(f"In stock: {stock}")
    if currency:
        details.append(f"Currency: {currency}")

    merchant = product.get("merchantSku")
    if merchant:
        details.append(f"Merchant SKU: {merchant}")

    dims = []
    if product.get("width"):
        dims.append(f"W {product['width']} cm")
    if product.get("height"):
        dims.append(f"H {product['height']} cm")
    if product.get("weight"):
        dims.append(f"Weight {product['weight']} kg")
    if dims:
        details.append(", ".join(dims))

    if product.get("originCountry"):
        details.append(f"Origin: {product['originCountry']}")

    return details


def normalize_product(product: dict[str, Any]) -> dict[str, Any] | None:
    variants = product.get("variants") or []
    if not variants:
        return None

    variant = variants[0]
    sku = (variant.get("sku") or product.get("merchantSku") or product.get("id") or "").strip()
    product_id = slugify(sku) if sku else slugify(str(product.get("id", "product")))

    name = (product.get("name") or "Untitled").strip()
    color = (variant.get("colorDescription") or "").strip()
    tagline = (product.get("description") or color or product.get("productGroup") or "").strip()
    if color and color.lower() not in name.lower():
        display_name = f"{name} — {color}"
    else:
        display_name = name

    description = (
        (product.get("longDescription") or "").strip()
        or (product.get("description") or "").strip()
        or tagline
    )

    category = (
        variant.get("categoryLevel2")
        or variant.get("categoryLevel1")
        or product.get("productGroup")
        or "General"
    )

    price, currency = pick_price(variant, product)
    stock = pick_stock(variant, product)
    image = pick_image(variant) or ""

    return {
        "id": product_id,
        "sourceId": product.get("id"),
        "variantId": variant.get("variantId"),
        "sku": sku,
        "name": display_name,
        "tagline": tagline[:120] if tagline else display_name,
        "price": price,
        "currency": currency,
        "stock": stock,
        "category": str(category),
        "categorySlug": slugify(str(category)),
        "image": image,
        "customizedImage": None,
        "description": description,
        "details": build_details(
            product, variant, sku=sku, stock=stock, currency=currency
        ),
    }


PINNED_PRODUCT_IDS = ("mo9518-13", "mo9243-03")


def apply_pinned_product_order(products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep mo9518-13 first and mo9243-03 second in catalog output."""
    by_id = {p["id"]: p for p in products}
    first = by_id.get(PINNED_PRODUCT_IDS[0])
    second = by_id.get(PINNED_PRODUCT_IDS[1])
    if not first and not second:
        return products

    rest = [p for p in products if p["id"] not in PINNED_PRODUCT_IDS]
    head: list[dict[str, Any]] = []
    if first:
        head.append(first)
    if second:
        head.append(second)
    return head + rest


def load_catalog(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        raise ValueError(f"Empty file: {path}")

    # File may be raw JSON or `export default [...]`
    if text.startswith("export"):
        match = re.search(r"\[[\s\S]*\]\s*;?\s*$", text)
        if not match:
            raise ValueError("Could not find JSON array in TypeScript module")
        text = match.group(0).rstrip(";")

    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError("Expected top-level JSON array")
    return data


def write_ts_module(path: Path, products: list[dict[str, Any]]) -> None:
    body = json.dumps(products, indent=2, ensure_ascii=False)
    content = (
        "/** Auto-generated by scripts/normalize_products.py — do not edit by hand */\n"
        "export interface NormalizedProduct {\n"
        "  id: string\n"
        "  sourceId: string\n"
        "  variantId: string | null\n"
        "  sku: string\n"
        "  name: string\n"
        "  tagline: string\n"
        "  price: number\n"
        "  currency: string\n"
        "  stock: number\n"
        "  category: string\n"
        "  categorySlug: string\n"
        "  image: string\n"
        "  customizedImage: string | null\n"
        "  description: string\n"
        "  details: string[]\n"
        "}\n\n"
        f"export const normalizedProducts: NormalizedProduct[] = {body}\n"
    )
    path.write_text(content, encoding="utf-8")


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    default_input = repo_root / "backend" / "src" / "data" / "realProducts.json"
    default_out_dir = repo_root / "backend" / "src" / "data"

    parser = argparse.ArgumentParser(description="Normalize supplier catalog to shop products")
    parser.add_argument("--input", type=Path, default=default_input)
    parser.add_argument("--output-dir", type=Path, default=default_out_dir)
    parser.add_argument("--skip-ts", action="store_true", help="Only write JSON output")
    args = parser.parse_args()

    if not args.input.is_file():
        print(f"Input not found: {args.input}", file=sys.stderr)
        return 1

    raw = load_catalog(args.input)
    normalized: list[dict[str, Any]] = []
    skipped = 0

    for item in raw:
        if not isinstance(item, dict):
            skipped += 1
            continue
        row = normalize_product(item)
        if row is None:
            skipped += 1
            continue
        normalized.append(row)

    normalized = apply_pinned_product_order(normalized)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    json_path = args.output_dir / "normalizedProducts.json"
    json_path.write_text(
        json.dumps(normalized, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    if not args.skip_ts:
        write_ts_module(args.output_dir / "normalizedProducts.ts", normalized)

    no_image = sum(1 for p in normalized if not p.get("image"))
    zero_price = sum(1 for p in normalized if p.get("price", 0) <= 0)

    print(f"Input products:     {len(raw)}")
    print(f"Normalized:         {len(normalized)}")
    print(f"Skipped:            {skipped}")
    print(f"No image:           {no_image}")
    print(f"Zero price:         {zero_price}")
    print(f"Wrote JSON:         {json_path}")
    if not args.skip_ts:
        print(f"Wrote TypeScript:   {args.output_dir / 'normalizedProducts.ts'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
