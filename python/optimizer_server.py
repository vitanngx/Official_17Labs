#!/usr/bin/env python3
"""Long-running HTTP optimizer service.

Run locally:
    uvicorn python.optimizer_server:app --host 127.0.0.1 --port 8008

Then point Next.js to it:
    OPTIMIZER_API_URL=http://127.0.0.1:8008 npm run dev
"""

from __future__ import annotations

import time
import traceback
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

from python.bridge_optimizer import optimize


class OptimizeRequest(BaseModel):
    payload: dict[str, Any]


app = FastAPI(title="17 Labs Optimizer API")


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "17labs-optimizer"}


@app.post("/optimize")
def optimize_portfolio(request: OptimizeRequest) -> dict[str, Any]:
    started_at = time.perf_counter()

    try:
        result = optimize(request.payload)
        result["engine"] = "fastapi"
        result["optimizerRuntimeMs"] = round((time.perf_counter() - started_at) * 1000, 2)
        return result
    except Exception as exc:
        return {
            "ok": False,
            "error": "Python optimizer failed.",
            "details": [str(exc), traceback.format_exc(limit=4)],
            "engine": "fastapi",
            "optimizerRuntimeMs": round((time.perf_counter() - started_at) * 1000, 2),
        }
