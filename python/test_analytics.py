import sys
import json
import subprocess

payload = {
    "transactions": [
        {"id": "1", "type": "BUY", "date": "2026-05-11", "asset": "SPY", "amount": 10, "price": 500, "currency": "USD"}
    ],
    "baseCurrency": "USD",
    "benchmark": "SPY",
    "dateRange": "1Y"
}

process = subprocess.Popen(
    ["python3", "bridge_analytics.py"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    cwd="/Users/tan/Documents/17Labs_app/Official/python"
)

out, err = process.communicate(input=json.dumps(payload).encode())
print("OUT:", out.decode()[:500])
print("ERR:", err.decode())
