#!/usr/bin/env python3
"""
sync-ads.py — Sync edge-key products to TG Cloud Drive share page ads.

Called by Hermes Agent (cron or on-demand). Fetches active products from
the edge-key商城 and updates the TG Cloud Drive's share page ad config
so free users browsing shared files see our products.

Usage:
  python3 sync-ads.py [--max N] [--dry-run]

Environment:
  EDGE_KEY_TOKEN    — edge-key Agent API Bearer token
  TG_DRIVE_TOKEN    — TG Cloud Drive Agent API Bearer token
"""

import os
import json
import sys
import urllib.request
import urllib.error

EDGE_KEY_BASE = "https://www.isoho168.top"
TG_DRIVE_BASE = "https://tg-cloud-drive-worker.yadinae.workers.dev"

EDGE_KEY_TOKEN = os.environ.get("EDGE_KEY_TOKEN", "36c2a4d7409c26732a61b4f625685348688b169b8a11e6aaefbe78a920b1ba85")
TG_DRIVE_TOKEN = os.environ.get("TG_DRIVE_TOKEN", "zK8WsseLn97wMOGDBKC3UViY7ZzYMUENRvj4ixq8Wrk")


def api_get(base: str, path: str, token: str) -> dict:
    req = urllib.request.Request(f"{base}{path}")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("User-Agent", "HermesAgent/1.0")
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def api_put(base: str, path: str, token: str, body: dict) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(f"{base}{path}", data=data, method="PUT")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "HermesAgent/1.0")
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def fetch_products() -> list[dict]:
    """Fetch all active products from edge-key商城."""
    resp = api_get(EDGE_KEY_BASE, "/api/agent/products", EDGE_KEY_TOKEN)
    products = resp.get("data") or resp.get("products") or resp
    if isinstance(products, dict):
        products = list(products.values())
    if not isinstance(products, list):
        print(f"  ⚠ Unexpected response format: {type(products).__name__}")
        return []
    return [p for p in products if p.get("status") == "ACTIVE"]


def build_ad_products(products: list[dict], max_count: int = 6) -> list[dict]:
    """Convert edge-key products to TG Cloud Drive ad format."""
    result = []
    for p in products:
        price_cents = p.get("price", 0)
        if isinstance(price_cents, int):
            price_yuan = f"{price_cents / 100:.2f}"
        else:
            price_yuan = str(price_cents)
        slug = p.get("slug", "")
        url = f"{EDGE_KEY_BASE}/product/{slug}" if slug else EDGE_KEY_BASE
        item = {
            "name": p.get("name", "未知商品"),
            "price": price_yuan,
            "url": url,
        }
        # Carry optional fields for richer ad display
        subtitle = p.get("subtitle")
        if subtitle:
            item["description"] = subtitle
        cover = p.get("coverImage") or p.get("cover_image")
        if cover:
            item["image"] = cover
        result.append(item)
        if len(result) >= max_count:
            break
    return result


def get_current_ad() -> dict:
    """Read current ad config from TG Cloud Drive."""
    return api_get(TG_DRIVE_BASE, "/api/agent/ads", TG_DRIVE_TOKEN)


def push_ad_config(payload: dict, dry_run: bool = False) -> bool:
    """Update TG Cloud Drive ad config."""
    if dry_run:
        print("  [DRY RUN] Would push:", json.dumps(payload, ensure_ascii=False, indent=2))
        return True
    resp = api_put(TG_DRIVE_BASE, "/api/agent/ads", TG_DRIVE_TOKEN, payload)
    return resp.get("ok", False)


def main():
    dry_run = "--dry-run" in sys.argv
    max_count = 6

    for i, arg in enumerate(sys.argv):
        if arg == "--max" and i + 1 < len(sys.argv):
            max_count = int(sys.argv[i + 1])

    # 1. Check systems health
    print("🔍 Checking systems...")
    try:
        status = api_get(EDGE_KEY_BASE, "/api/agent/health", EDGE_KEY_TOKEN)
        print(f"  ✅ Edge-key商城: {status.get('message', 'OK')}")
    except Exception as e:
        print(f"  ❌ Edge-key商城 unreachable: {e}")
        sys.exit(1)

    try:
        stats = api_get(TG_DRIVE_BASE, "/api/agent/status", TG_DRIVE_TOKEN)
        print(f"  ✅ TG Cloud Drive: {stats.get('stats', {}).get('fileCount', '?')} files")
    except Exception as e:
        print(f"  ❌ TG Cloud Drive unreachable: {e}")
        sys.exit(1)

    # 2. Fetch products
    print(f"\n📦 Fetching products from edge-key...")
    products = fetch_products()
    print(f"  Found {len(products)} active products")

    if not products:
        print("  ⚠ No active products to sync.")
        return

    # 3. Build ad config
    print(f"\n🛒 Building ad config (max {max_count} products)...")
    ad_products = build_ad_products(products, max_count)
    payload = {
        "enabled": True,
        "shopName": "龙大在线商城",
        "shopUrl": "https://www.isoho168.top",
        "products": ad_products,
    }

    for p in ad_products:
        print(f"  • {p['name']:30s} ¥{p['price']:>6s}")

    # 4. Compare with current config
    try:
        current = get_current_ad()
        current_products = [cp["url"] for cp in current.get("products", [])]
        new_products = [np["url"] for np in ad_products]
        if set(current_products) == set(new_products):
            print(f"\n✅ Current ad already up-to-date ({len(ad_products)} products)")
            return
    except Exception:
        pass  # Force update if we can't compare

    # 5. Push
    print(f"\n{'📤' if not dry_run else '📋'} Pushing to TG Cloud Drive...")
    ok = push_ad_config(payload, dry_run)
    if ok:
        print(f"  ✅ Ad config updated — {len(ad_products)} products on share pages")
    else:
        print(f"  ❌ Failed to update ad config")
        sys.exit(1)


if __name__ == "__main__":
    main()
