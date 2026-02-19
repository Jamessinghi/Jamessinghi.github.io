import json
import os
import time
from datetime import datetime, timezone

import requests

API_KEY = os.environ.get("TWELVEDATA_API_KEY")
if not API_KEY:
    raise SystemExit("Missing TWELVEDATA_API_KEY env var")

TICKERS = ["AAPL","MSFT","NVDA","GOOGL","AMZN","TSLA","META","AMD"]
OUT_PATH = "docs/assets/quotes.json"

# Twelve Data endpoint pattern (single quote). We'll call it per symbol to avoid
# relying on batch behavior differences between plans/endpoints.
BASE_URL = "https://api.twelvedata.com/quote"

def fetch_quote(symbol: str) -> dict:
    params = {
        "symbol": symbol,
        "apikey": API_KEY,
    }

    last_err = None
    for attempt in range(4):
        try:
            r = requests.get(BASE_URL, params=params, timeout=20)
            r.raise_for_status()
            data = r.json()

            if isinstance(data, dict) and data.get("status") == "error":
                raise RuntimeError(f"{symbol} error: {data}")

            price_raw = data.get("close") or data.get("price") or data.get("last")
            if price_raw is None:
                raise RuntimeError(f"No price fields for {symbol}: {data}")

            prev_close_raw = data.get("previous_close")

            price = float(price_raw)
            prev_close = float(prev_close_raw) if prev_close_raw not in (None, "") else price

            return {"price": price, "prev_close": prev_close}

        except Exception as e:
            last_err = e
            time.sleep(1.5 * (attempt + 1))

    raise RuntimeError(f"Failed to fetch {symbol}: {last_err}")

def main():
    out = {
        "updated_at_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": "twelvedata",
    }

    for sym in TICKERS:
        out[sym] = fetch_quote(sym)

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
        f.write("\n")

    print(f"Wrote {OUT_PATH}")

if __name__ == "__main__":
    main()
