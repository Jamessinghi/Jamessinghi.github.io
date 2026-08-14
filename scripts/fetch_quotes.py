#!/usr/bin/env python3
"""Fetch live quotes from Twelve Data and write assets/quotes.json.

Run by .github/workflows/quotes.yml on an hourly cron, so Twelve Data is
called at most once per hour no matter how much traffic the site gets. The
browser never talks to Twelve Data directly: it only reads the static
assets/quotes.json that this script produces, so the API key stays private
(GitHub Secret: TWELVEDATA_API_KEY).

Resilience: a single batched request is made for all symbols. If the whole
request fails we exit non-zero WITHOUT touching quotes.json (last good data is
preserved). If only some symbols are missing/invalid, those keep their previous
values from the existing quotes.json.
"""

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# Keep this list in sync with TICKERS in javascripts/bg-ticker.js
SYMBOLS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "TSLA", "META", "AMD"]

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUOTES_PATH = os.path.join(REPO_ROOT, "assets", "quotes.json")

API_URL = "https://api.twelvedata.com/quote"


def load_existing():
    """Return the current quotes.json as a dict, or {} if unreadable."""
    try:
        with open(QUOTES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def fetch(api_key):
    """One batched request for every symbol. Returns the parsed JSON payload."""
    params = urllib.parse.urlencode({
        "symbol": ",".join(SYMBOLS),
        "apikey": api_key,
    })
    req = urllib.request.Request(
        f"{API_URL}?{params}",
        headers={"User-Agent": "jamessinghi.github.io quotes fetcher"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def symbol_entry(payload, symbol):
    """Pull the per-symbol object out of a batched or single-symbol response."""
    # Batched responses are keyed by symbol: {"AAPL": {...}, "MSFT": {...}}.
    # A single-symbol response is the object itself.
    if symbol in payload and isinstance(payload[symbol], dict):
        return payload[symbol]
    if payload.get("symbol") == symbol:
        return payload
    return None


def to_float(value):
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    # Twelve Data uses 0 / null for fields it has no data for; treat as missing.
    return f if f > 0 else None


def main():
    api_key = os.environ.get("TWELVEDATA_API_KEY")
    if not api_key:
        print("ERROR: TWELVEDATA_API_KEY is not set.", file=sys.stderr)
        return 1

    try:
        payload = fetch(api_key)
    except Exception as exc:  # network error, timeout, bad JSON
        print(f"ERROR: request to Twelve Data failed: {exc}", file=sys.stderr)
        return 1

    # A top-level error object means the whole call was rejected (bad key, rate
    # limit, etc). Don't clobber good data — bail and keep the existing file.
    if isinstance(payload, dict) and payload.get("status") == "error":
        print(f"ERROR: Twelve Data returned an error: "
              f"{payload.get('message', payload)}", file=sys.stderr)
        return 1

    existing = load_existing()
    out = {
        "updated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "twelvedata",
    }

    updated = 0
    for sym in SYMBOLS:
        entry = symbol_entry(payload, sym)
        prev = existing.get(sym) if isinstance(existing.get(sym), dict) else {}

        price = to_float(entry.get("close")) if entry else None
        prev_close = to_float(entry.get("previous_close")) if entry else None

        if price is None:
            # Keep the last good value for this symbol rather than dropping it.
            price = to_float(prev.get("price"))
            print(f"WARN: no fresh price for {sym}; keeping previous value.",
                  file=sys.stderr)
        else:
            updated += 1

        if prev_close is None:
            prev_close = to_float(prev.get("prev_close")) or price

        if price is None:
            print(f"ERROR: no price available for {sym} (fresh or cached).",
                  file=sys.stderr)
            return 1

        out[sym] = {"price": price, "prev_close": prev_close}

    if updated == 0:
        print("ERROR: no symbols received fresh data; leaving quotes.json "
              "untouched.", file=sys.stderr)
        return 1

    with open(QUOTES_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
        f.write("\n")

    print(f"Wrote {QUOTES_PATH}: {updated}/{len(SYMBOLS)} symbols refreshed at "
          f"{out['updated_at_utc']}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
