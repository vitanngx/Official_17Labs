#!/usr/bin/env python3
"""Small yfinance quote/history bridge for the Next.js reality tab."""

from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone


def safe_float(value):
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def format_timestamp(value) -> str:
    if hasattr(value, "to_pydatetime"):
        value = value.to_pydatetime()
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).strftime("%Y-%m-%d")
    return str(value)[:10]


def main() -> None:
    payload = json.load(sys.stdin)
    symbol = str(payload.get("symbol") or "").strip().upper()
    history_range = str(payload.get("range") or "1d")
    interval = str(payload.get("interval") or "1d")

    if not symbol:
        raise ValueError("symbol is required")

    import yfinance as yf

    ticker = yf.Ticker(symbol)
    history = ticker.history(
        period=history_range,
        interval=interval,
        auto_adjust=False,
    )

    points = []
    closes = []
    for index, row in history.iterrows():
      close = safe_float(row.get("Close"))
      if close is None:
          continue
      closes.append(close)
      points.append(
          {
              "date": format_timestamp(index),
              "close": close,
          }
      )

    if not points:
        raise ValueError(f"No history returned for {symbol}")

    price = closes[-1]
    previous_close = closes[-2] if len(closes) > 1 else closes[-1]

    try:
        fast_info = ticker.fast_info
        price = safe_float(fast_info.get("lastPrice")) or price
        previous_close = safe_float(fast_info.get("previousClose")) or previous_close
    except Exception:
        pass

    print(
        json.dumps(
            {
                "ok": True,
                "symbol": symbol,
                "price": price,
                "previousClose": previous_close,
                "history": points,
                "provider": "yfinance",
            }
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(exc),
                    "history": [],
                    "provider": "yfinance",
                }
            )
        )
        sys.exit(0)
