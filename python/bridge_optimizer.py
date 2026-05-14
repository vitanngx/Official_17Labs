#!/usr/bin/env python3
"""JSON bridge for portfolio optimization.

Input is read from stdin. Expected payload:
{
  "prices": [
    {"date": "2026-01-01", "AAPL": 190, "BTC-USD": 65000},
    ...
  ],
  "assetUniverse": [
    {"asset": "AAPL", "assetClass": "US_STOCK", "currency": "USD"},
    {"asset": "BTC-USD", "assetClass": "CRYPTO", "currency": "USD"}
  ],
  "riskFreeRate": 0.05,
  "riskProfile": "Balanced",
  "optimizationGoal": "max_sharpe",
  "targetReturn": 0.2,
  "targetTolerance": 0.02,
  "numPortfolios": 3000,
  "randomSeed": 42
}

The "prices" field may also be a dict in pandas DataFrame-compatible shapes. If
"prices" is omitted, the bridge attempts to download history for assetUniverse
with yfinance.

Uses a hybrid approach: Monte Carlo simulation for frontier visualization,
and scipy-based constrained optimization for more precise deterministic
portfolio selection (max Sharpe and target return goals).
"""

from __future__ import annotations

import json
import math
import sys
import time
import traceback
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

try:
    import numpy as np
    import pandas as pd
except Exception as exc:  # pragma: no cover - dependency guard for bridge callers
    print(
        json.dumps(
            {
                "ok": False,
                "error": "Missing optimizer dependency. Install numpy and pandas.",
                "details": [str(exc)],
            }
        )
    )
    sys.exit(0)

try:
    from scipy.optimize import minimize as scipy_minimize

    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False


TRADING_DAYS_PER_YEAR = 252
RISK_PROFILES = {
    "Conservative": {"dirichlet_alpha": 2.2},
    "Balanced": {"dirichlet_alpha": 1.2},
    "Aggressive": {"dirichlet_alpha": 0.75},
}
PRICE_HISTORY_CACHE_TTL_SECONDS = 24 * 60 * 60
PRICE_HISTORY_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}


@dataclass(frozen=True)
class PortfolioMetrics:
    expected_return: float
    volatility: float
    sharpe_ratio: float
    weights: dict[str, float]


def main() -> None:
    try:
        payload = json.load(sys.stdin)
        result = optimize(payload)
        print(json.dumps(result, allow_nan=False))
    except Exception as exc:
        # Log full traceback to stderr for local/FastAPI debugging.
        print(traceback.format_exc(limit=6), file=sys.stderr)
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "Python optimizer failed.",
                    "details": [str(exc)],
                }
            )
        )
        sys.exit(0)


def optimize(payload: dict[str, Any]) -> dict[str, Any]:
    prices = resolve_prices(payload)
    if prices.shape[1] < 2:
        raise ValueError("At least two assets are required for optimization.")

    risk_free_rate = float(payload.get("riskFreeRate", payload.get("rfRate", 0.05)))
    target_return = float(payload.get("targetReturn", 0.2))
    target_tolerance = float(payload.get("targetTolerance", 0.02))
    risk_profile = str(payload.get("riskProfile", "Balanced"))
    optimization_goal = str(payload.get("optimizationGoal", "max_sharpe"))
    num_portfolios = int(payload.get("numPortfolios", 3000))
    random_seed = payload.get("randomSeed", 42)
    if num_portfolios < 100:
        raise ValueError("numPortfolios must be at least 100.")

    returns = compute_daily_returns(prices)
    if returns.empty:
        raise ValueError("Not enough price history to compute returns.")

    annual_returns = annualize_returns(returns)
    annual_volatility = annualize_volatility(returns)
    covariance = returns.cov() * TRADING_DAYS_PER_YEAR

    ranking = build_asset_ranking(
        annual_returns=annual_returns,
        annual_volatility=annual_volatility,
        risk_free_rate=risk_free_rate,
    )
    frontier = simulate_efficient_frontier(
        annual_returns=annual_returns,
        covariance=covariance,
        risk_free_rate=risk_free_rate,
        risk_profile=risk_profile,
        num_portfolios=num_portfolios,
        random_seed=random_seed,
    )

    # --- Scipy-based precise portfolio selection (with Monte Carlo fallback) ---
    mc_best = frontier["bestPortfolio"]
    mc_target = select_target_portfolio(
        points=frontier["points"],
        target_return=target_return,
        target_tolerance=target_tolerance,
    )

    best_portfolio = mc_best
    target_portfolio = mc_target

    if SCIPY_AVAILABLE:
        tickers = list(annual_returns.index)
        max_w, min_w = get_weight_constraints(len(tickers))

        scipy_best = find_max_sharpe_scipy(
            annual_returns=annual_returns,
            covariance=covariance,
            risk_free_rate=risk_free_rate,
            tickers=tickers,
            min_weight=min_w,
            max_weight=max_w,
        )
        if scipy_best is not None:
            best_portfolio = scipy_best

        scipy_target = find_min_volatility_for_target_scipy(
            annual_returns=annual_returns,
            covariance=covariance,
            risk_free_rate=risk_free_rate,
            tickers=tickers,
            target_return=target_return,
            target_tolerance=target_tolerance,
            min_weight=min_w,
            max_weight=max_w,
        )
        if scipy_target is not None:
            target_portfolio = scipy_target

    selected_portfolio = (
        target_portfolio
        if optimization_goal == "target_return" and target_portfolio is not None
        else best_portfolio
    )

    return {
        "ok": True,
        "assetCount": int(prices.shape[1]),
        "observationCount": int(prices.shape[0]),
        "riskFreeRate": risk_free_rate,
        "riskProfile": risk_profile,
        "optimizationGoal": optimization_goal,
        "targetReturn": target_return,
        "targetTolerance": target_tolerance,
        "weightConstraints": frontier["weightConstraints"],
        "assetRanking": ranking,
        "efficientFrontier": frontier["points"],
        "bestPortfolio": best_portfolio,
        "targetPortfolio": target_portfolio,
        "selectedPortfolio": selected_portfolio,
    }


def resolve_prices(payload: dict[str, Any]) -> pd.DataFrame:
    if payload.get("prices") is not None:
        return parse_prices(payload.get("prices"))

    assets = payload.get("assetUniverse") or payload.get("assets")
    if not assets:
        raise ValueError("Missing required field: prices or assetUniverse.")

    return download_price_history(
        assets=assets,
        start_date=str(payload.get("startDate") or default_start_date()),
    )


def parse_prices(raw_prices: Any) -> pd.DataFrame:
    if raw_prices is None:
        raise ValueError("Missing required field: prices.")

    prices = pd.DataFrame(raw_prices)

    if "date" in prices.columns:
        prices["date"] = pd.to_datetime(prices["date"])
        prices = prices.set_index("date")

    prices = prices.apply(pd.to_numeric, errors="coerce")
    prices = prices.dropna(axis=1, how="all")
    prices = prices.sort_index()
    prices = prices.ffill().dropna(how="all")
    prices = prices.loc[:, prices.nunique(dropna=True) > 1]

    if prices.empty:
        raise ValueError("No usable price data found.")

    return prices


def download_price_history(assets: list[dict[str, Any]], start_date: str) -> pd.DataFrame:
    try:
        import yfinance as yf
    except Exception as exc:
        raise RuntimeError(
            "yfinance is required when prices are omitted. Send prices directly or install yfinance."
        ) from exc

    symbols = [normalize_yahoo_symbol(asset) for asset in assets]
    symbols = [symbol for symbol in symbols if symbol]
    if len(symbols) < 2:
        raise ValueError("At least two valid asset symbols are required.")

    cache_key = json.dumps(
        {"symbols": sorted(symbols), "startDate": start_date},
        sort_keys=True,
    )
    cached = PRICE_HISTORY_CACHE.get(cache_key)
    if cached and time.time() - cached[0] <= PRICE_HISTORY_CACHE_TTL_SECONDS:
        return parse_prices(cached[1])

    downloaded = yf.download(
        symbols,
        start=start_date,
        progress=False,
        auto_adjust=False,
        group_by="column",
    )
    close_prices = downloaded["Close"] if "Close" in downloaded else downloaded

    if isinstance(close_prices, pd.Series):
        close_prices = close_prices.to_frame(name=symbols[0])

    if isinstance(close_prices.columns, pd.MultiIndex):
        close_prices.columns = close_prices.columns.get_level_values(0)

    close_prices = close_prices.rename(
        columns={symbol: symbol for symbol in symbols}
    )
    price_records = close_prices.reset_index().rename(columns={"Date": "date"}).to_dict(
        orient="records"
    )
    PRICE_HISTORY_CACHE[cache_key] = (time.time(), price_records)
    return parse_prices(price_records)


def normalize_yahoo_symbol(asset: dict[str, Any]) -> str:
    raw = str(asset.get("asset") or asset.get("symbol") or "").strip().upper()
    asset_class = str(asset.get("assetClass") or asset.get("asset_class") or "US_STOCK")

    if not raw:
        return ""

    if asset_class == "CRYPTO":
        raw = raw.replace("/", "-")
        return raw if "-" in raw else f"{raw}-USD"

    if asset_class == "VN_STOCK":
        base = raw.replace(".VN", "")
        return f"{base}.VN"

    if asset_class == "FR_STOCK":
        base = raw.replace(".PA", "")
        return f"{base}.PA"

    return raw




def default_start_date() -> str:
    return (datetime.now() - timedelta(days=365 * 3)).strftime("%Y-%m-%d")


def compute_daily_returns(prices: pd.DataFrame) -> pd.DataFrame:
    returns = prices.pct_change().replace([np.inf, -np.inf], np.nan).dropna(how="all")
    return returns.clip(lower=-0.95, upper=2.0)


def annualize_returns(returns: pd.DataFrame) -> pd.Series:
    return returns.mean() * TRADING_DAYS_PER_YEAR


def annualize_volatility(returns: pd.DataFrame) -> pd.Series:
    return returns.std() * math.sqrt(TRADING_DAYS_PER_YEAR)


def get_weight_constraints(n_assets: int) -> tuple[float, float]:
    """Return the maximum and minimum weight per asset."""
    if n_assets <= 1:
        return (1.0, 1.0)

    constraints = {
        2: (0.70, 0.00),
        3: (0.50, 0.20),
        4: (0.40, 0.15),
        5: (0.30, 0.12),
        6: (0.30, 0.10),
        7: (0.30, 0.10),
        8: (0.25, 0.08),
        9: (0.25, 0.06),
        10: (0.20, 0.04),
        11: (0.15, 0.04),
        12: (0.15, 0.04),
        13: (0.14, 0.04),
        14: (0.13, 0.04),
        15: (0.12, 0.04),
    }
    default_max = min(1.0, 1.0 / n_assets + 0.2)
    return constraints.get(n_assets, (default_max, 0.01))


def sample_bounded_weights(
    rng: np.random.Generator,
    n_assets: int,
    min_weight: float,
    max_weight: float,
    dirichlet_alpha: float,
) -> np.ndarray:
    """Sample weights that sum to one while respecting min/max constraints."""
    if n_assets <= 1:
        return np.ones(n_assets, dtype=float)

    lower_bound = min_weight
    upper_bound = max_weight

    if n_assets * lower_bound > 1:
        lower_bound = 0.0
    if n_assets * upper_bound < 1:
        upper_bound = 1.0

    weights = np.full(n_assets, lower_bound, dtype=float)
    remaining = 1.0 - weights.sum()
    capacity = np.full(n_assets, upper_bound - lower_bound, dtype=float)

    while remaining > 1e-12:
        active = capacity > 1e-12
        if not np.any(active):
            break

        increments = np.zeros(n_assets, dtype=float)
        increments[active] = rng.dirichlet(
            np.full(int(active.sum()), dirichlet_alpha)
        ) * remaining
        increments = np.minimum(increments, capacity)
        weights += increments
        capacity -= increments
        remaining = 1.0 - weights.sum()

    if abs(weights.sum() - 1.0) > 1e-8:
        weights = weights / weights.sum()

    return weights


def build_asset_ranking(
    annual_returns: pd.Series,
    annual_volatility: pd.Series,
    risk_free_rate: float,
) -> list[dict[str, float | str]]:
    sharpe = (annual_returns - risk_free_rate) / annual_volatility.replace(0, np.nan)
    ranking = pd.DataFrame(
        {
            "asset": annual_returns.index,
            "annualReturn": annual_returns.values,
            "annualVolatility": annual_volatility.values,
            "sharpeRatio": sharpe.values,
        }
    ).sort_values("sharpeRatio", ascending=False, na_position="last")

    return [clean_record(record) for record in ranking.to_dict(orient="records")]


def simulate_efficient_frontier(
    annual_returns: pd.Series,
    covariance: pd.DataFrame,
    risk_free_rate: float,
    risk_profile: str,
    num_portfolios: int,
    random_seed: int | None,
) -> dict[str, Any]:
    rng = np.random.default_rng(random_seed)
    tickers = list(annual_returns.index)
    n_assets = len(tickers)
    profile = RISK_PROFILES.get(risk_profile, RISK_PROFILES["Balanced"])
    dirichlet_alpha = float(profile["dirichlet_alpha"])
    max_asset_weight, min_asset_weight = get_weight_constraints(n_assets)
    points: list[dict[str, Any]] = []
    best: PortfolioMetrics | None = None

    for _ in range(num_portfolios):
        weights = sample_bounded_weights(
            rng=rng,
            n_assets=n_assets,
            min_weight=min_asset_weight,
            max_weight=max_asset_weight,
            dirichlet_alpha=dirichlet_alpha,
        )
        expected_return = float(weights @ annual_returns.values)
        volatility = float(np.sqrt(weights.T @ covariance.values @ weights))
        sharpe_ratio = (
            (expected_return - risk_free_rate) / volatility if volatility > 0 else float("nan")
        )
        weight_map = {
            ticker: float(weight)
            for ticker, weight in zip(tickers, weights)
        }
        metrics = PortfolioMetrics(
            expected_return=expected_return,
            volatility=volatility,
            sharpe_ratio=sharpe_ratio,
            weights=weight_map,
        )

        if best is None or safe_number(metrics.sharpe_ratio) > safe_number(best.sharpe_ratio):
            best = metrics

        points.append(
            {
                "expectedReturn": expected_return,
                "volatility": volatility,
                "sharpeRatio": sharpe_ratio,
                "weights": weight_map,
            }
        )

    if best is None:
        raise ValueError("No portfolios could be simulated. Try a less restrictive risk profile.")

    return {
        "points": [clean_record(point) for point in points],
        "weightConstraints": {
            "minWeight": min_asset_weight,
            "maxWeight": max_asset_weight,
        },
        "bestPortfolio": clean_record(
            {
                "expectedReturn": best.expected_return,
                "volatility": best.volatility,
                "sharpeRatio": best.sharpe_ratio,
                "weights": best.weights,
            }
        ),
    }


def select_target_portfolio(
    points: list[dict[str, Any]],
    target_return: float,
    target_tolerance: float,
) -> dict[str, Any] | None:
    candidates = [
        point
        for point in points
        if point["expectedReturn"] is not None
        and target_return - target_tolerance <= point["expectedReturn"] <= target_return + target_tolerance
    ]
    if not candidates:
        return None

    return min(candidates, key=lambda point: point["volatility"] or float("inf"))


# ---------------------------------------------------------------------------
# Scipy-based constrained optimization (more precise deterministic optimizer)
# ---------------------------------------------------------------------------


def find_max_sharpe_scipy(
    annual_returns: pd.Series,
    covariance: pd.DataFrame,
    risk_free_rate: float,
    tickers: list[str],
    min_weight: float,
    max_weight: float,
) -> dict[str, Any] | None:
    """Find the portfolio with the highest Sharpe ratio using SLSQP.

    Maximizing Sharpe is equivalent to minimizing the negative Sharpe ratio.
    Falls back to None if the solver fails so Monte Carlo results are used instead.
    """
    n = len(tickers)
    if n < 2:
        return None

    mean_returns = annual_returns.values.astype(float)
    cov_matrix = covariance.values.astype(float)

    def neg_sharpe(weights: np.ndarray) -> float:
        port_return = float(weights @ mean_returns)
        port_vol = float(np.sqrt(weights @ cov_matrix @ weights))
        if port_vol < 1e-12:
            return 1e12
        return -(port_return - risk_free_rate) / port_vol

    constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}]
    bounds = [(min_weight, max_weight)] * n
    initial_weights = np.full(n, 1.0 / n)

    try:
        result = scipy_minimize(
            neg_sharpe,
            initial_weights,
            method="SLSQP",
            bounds=bounds,
            constraints=constraints,
            options={"maxiter": 1000, "ftol": 1e-12},
        )
        if not result.success:
            return None

        weights = result.x
        port_return = float(weights @ mean_returns)
        port_vol = float(np.sqrt(weights @ cov_matrix @ weights))
        sharpe = (port_return - risk_free_rate) / port_vol if port_vol > 0 else float("nan")

        return clean_record(
            {
                "expectedReturn": port_return,
                "volatility": port_vol,
                "sharpeRatio": sharpe,
                "weights": {t: float(w) for t, w in zip(tickers, weights)},
            }
        )
    except Exception:
        return None


def find_min_volatility_for_target_scipy(
    annual_returns: pd.Series,
    covariance: pd.DataFrame,
    risk_free_rate: float,
    tickers: list[str],
    target_return: float,
    target_tolerance: float,
    min_weight: float,
    max_weight: float,
) -> dict[str, Any] | None:
    """Find the minimum-volatility portfolio whose return falls within the target range.

    Uses the constraint: target_return - tolerance <= portfolio_return <= target_return + tolerance.
    Falls back to None if the target is infeasible so Monte Carlo results are used instead.
    """
    n = len(tickers)
    if n < 2:
        return None

    mean_returns = annual_returns.values.astype(float)
    cov_matrix = covariance.values.astype(float)

    def portfolio_volatility(weights: np.ndarray) -> float:
        return float(np.sqrt(weights @ cov_matrix @ weights))

    constraints = [
        {"type": "eq", "fun": lambda w: np.sum(w) - 1.0},
        # Return must be >= target - tolerance
        {"type": "ineq", "fun": lambda w: float(w @ mean_returns) - (target_return - target_tolerance)},
        # Return must be <= target + tolerance
        {"type": "ineq", "fun": lambda w: (target_return + target_tolerance) - float(w @ mean_returns)},
    ]
    bounds = [(min_weight, max_weight)] * n
    initial_weights = np.full(n, 1.0 / n)

    try:
        result = scipy_minimize(
            portfolio_volatility,
            initial_weights,
            method="SLSQP",
            bounds=bounds,
            constraints=constraints,
            options={"maxiter": 1000, "ftol": 1e-12},
        )
        if not result.success:
            # Target return is likely infeasible; fall back to Monte Carlo.
            return None

        weights = result.x
        port_return = float(weights @ mean_returns)
        port_vol = float(np.sqrt(weights @ cov_matrix @ weights))
        sharpe = (port_return - risk_free_rate) / port_vol if port_vol > 0 else float("nan")

        return clean_record(
            {
                "expectedReturn": port_return,
                "volatility": port_vol,
                "sharpeRatio": sharpe,
                "weights": {t: float(w) for t, w in zip(tickers, weights)},
            }
        )
    except Exception:
        return None


def safe_number(value: float) -> float:
    return value if math.isfinite(value) else -float("inf")


def clean_record(record: dict[str, Any]) -> dict[str, Any]:
    cleaned: dict[str, Any] = {}

    for key, value in record.items():
        if isinstance(value, dict):
            cleaned[key] = clean_record(value)
        elif isinstance(value, (float, np.floating)):
            cleaned[key] = float(value) if math.isfinite(float(value)) else None
        elif isinstance(value, (int, np.integer)):
            cleaned[key] = int(value)
        else:
            cleaned[key] = value

    return cleaned


if __name__ == "__main__":
    main()
