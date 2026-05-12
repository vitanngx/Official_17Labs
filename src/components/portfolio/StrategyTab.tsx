"use client";

import React from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis
} from "recharts";

type RiskProfile = "Conservative" | "Balanced" | "Aggressive";

interface AssetUniverseItem {
  asset: string;
  assetClass: string;
  currency: string;
}

interface FrontierPoint {
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
  weights: Record<string, number>;
}

interface OptimizationResponse {
  ok: boolean;
  error?: string;
  details?: string[];
  riskProfile?: RiskProfile;
  targetReturn?: number;
  weightConstraints?: {
    minWeight: number;
    maxWeight: number;
  };
  efficientFrontier?: FrontierPoint[];
  bestPortfolio?: FrontierPoint;
  targetPortfolio?: FrontierPoint | null;
}

interface StrategyTabProps {
  onOptimizedWeightsChange?: (weights: Record<string, number>) => void;
}

interface PersistedStrategyState {
  startDate: string;
  riskProfile: RiskProfile;
  riskFreeRate: string;
  targetReturn: string;
  targetTolerance: string;
  numPortfolios: number;
  assetUniverse: AssetUniverseItem[];
  result: OptimizationResponse | null;
}

interface LatestOptimizationRunResponse {
  ok: boolean;
  run?: {
    config?: Partial<PersistedStrategyState> & {
      assetUniverse?: AssetUniverseItem[];
      resultVersion?: number;
    };
    result?: OptimizationResponse;
  } | null;
}

interface RealityResponse {
  ok: boolean;
  holdings?: Array<{
    asset: string;
    currency: string;
  }>;
  error?: string;
}

const RISK_PROFILES: RiskProfile[] = ["Conservative", "Balanced", "Aggressive"];
const STRATEGY_RESULT_VERSION = 2;
const STRATEGY_STORAGE_KEY = "official.strategyTab.v2";
const DEFAULT_START_DATE = "2020-01-01";
const DEFAULT_ASSETS: AssetUniverseItem[] = [
  { asset: "AAPL", assetClass: "US_STOCK", currency: "USD" },
  { asset: "SPY", assetClass: "ETF", currency: "USD" },
  { asset: "BTC-USD", assetClass: "CRYPTO", currency: "USD" },
  { asset: "ETH-USD", assetClass: "CRYPTO", currency: "USD" }
];

export default function StrategyTab({ onOptimizedWeightsChange }: StrategyTabProps) {
  const [startDate, setStartDate] = React.useState(DEFAULT_START_DATE);
  const [riskProfile, setRiskProfile] = React.useState<RiskProfile>("Balanced");
  const [riskFreeRate, setRiskFreeRate] = React.useState("0.05");
  const [targetReturn, setTargetReturn] = React.useState("0.20");
  const [targetTolerance, setTargetTolerance] = React.useState("0.02");
  const [numPortfolios, setNumPortfolios] = React.useState(5000);
  const [assetUniverse, setAssetUniverse] = React.useState(DEFAULT_ASSETS);
  const [result, setResult] = React.useState<OptimizationResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [syncingHoldings, setSyncingHoldings] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);

  const selectedPortfolio = result?.targetPortfolio ?? result?.bestPortfolio ?? null;
  const weightRows = React.useMemo(() => {
    if (!selectedPortfolio) {
      return [];
    }

    return Object.entries(selectedPortfolio.weights)
      .map(([asset, weight]) => ({
        asset,
        weight,
        expectedValue: weight * 100
      }))
      .sort((left, right) => right.weight - left.weight);
  }, [selectedPortfolio]);

  React.useEffect(() => {
    const saved = readPersistedStrategyState();
    if (saved) {
      setStartDate(saved.startDate);
      setRiskProfile(saved.riskProfile);
      setRiskFreeRate(saved.riskFreeRate);
      setTargetReturn(saved.targetReturn);
      setTargetTolerance(saved.targetTolerance);
      setNumPortfolios(saved.numPortfolios);
      setAssetUniverse(saved.assetUniverse);
      setResult(saved.result);
      onOptimizedWeightsChange?.(
        (saved.result?.targetPortfolio ?? saved.result?.bestPortfolio)?.weights ?? {}
      );
    }
    setHydrated(true);
    if (!saved) {
      void loadLatestOptimizationRun();
    }
  }, [onOptimizedWeightsChange]);

  React.useEffect(() => {
    if (!hydrated) {
      return;
    }

    persistStrategyState({
      startDate,
      riskProfile,
      riskFreeRate,
      targetReturn,
      targetTolerance,
      numPortfolios,
      assetUniverse,
      result
    });
  }, [
    assetUniverse,
    hydrated,
    numPortfolios,
    result,
    riskFreeRate,
    riskProfile,
    startDate,
    targetReturn,
    targetTolerance
  ]);

  async function runOptimization(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/portfolio/optimization", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          startDate,
          riskProfile,
          riskFreeRate: Number(riskFreeRate),
          targetReturn: Number(targetReturn),
          targetTolerance: Number(targetTolerance),
          numPortfolios,
          assetUniverse,
          resultVersion: STRATEGY_RESULT_VERSION
        })
      });
      const payload = (await response.json()) as OptimizationResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Optimization failed.");
      }

      setResult(payload);
      onOptimizedWeightsChange?.(
        (payload.targetPortfolio ?? payload.bestPortfolio)?.weights ?? {}
      );
    } catch (runError) {
      setResult(null);
      onOptimizedWeightsChange?.({});
      setError(runError instanceof Error ? runError.message : "Optimization failed.");
    } finally {
      setLoading(false);
    }
  }

  async function loadLatestOptimizationRun() {
    try {
      const response = await fetch("/api/portfolio/optimization", { cache: "no-store" });
      const payload = (await response.json()) as LatestOptimizationRunResponse;
      const run = payload.run;
      if (!response.ok || !payload.ok || !run?.result) {
        return;
      }
      if (run.config?.resultVersion !== STRATEGY_RESULT_VERSION) {
        return;
      }

      if (run.config?.riskProfile && RISK_PROFILES.includes(run.config.riskProfile)) {
        setRiskProfile(run.config.riskProfile);
      }
      if (run.config?.startDate !== undefined) {
        setStartDate(String(run.config.startDate));
      }
      if (run.config?.riskFreeRate !== undefined) {
        setRiskFreeRate(String(run.config.riskFreeRate));
      }
      if (run.config?.targetReturn !== undefined) {
        setTargetReturn(String(run.config.targetReturn));
      }
      if (run.config?.targetTolerance !== undefined) {
        setTargetTolerance(String(run.config.targetTolerance));
      }
      if (run.config?.numPortfolios !== undefined) {
        setNumPortfolios(Number(run.config.numPortfolios));
      }
      if (Array.isArray(run.config?.assetUniverse) && run.config.assetUniverse.length > 0) {
        setAssetUniverse(run.config.assetUniverse);
      }
      setResult(run.result);
      onOptimizedWeightsChange?.(
        (run.result.targetPortfolio ?? run.result.bestPortfolio)?.weights ?? {}
      );
    } catch {
      // Latest runs are a convenience; local defaults still work without them.
    }
  }

  async function useCurrentHoldings() {
    setSyncingHoldings(true);
    setError(null);

    try {
      const response = await fetch("/api/portfolio/reality?baseCurrency=USD", {
        cache: "no-store"
      });
      const payload = (await response.json()) as RealityResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Unable to load current holdings.");
      }

      const holdings = payload.holdings ?? [];
      if (holdings.length < 2) {
        throw new Error("Add at least two holdings in Tab 2 before syncing.");
      }

      setAssetUniverse(
        holdings.map((holding) => ({
          asset: holding.asset,
          assetClass: inferAssetClass(holding.asset),
          currency: holding.currency
        }))
      );
      setResult(null);
      onOptimizedWeightsChange?.({});
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Unable to sync holdings.");
    } finally {
      setSyncingHoldings(false);
    }
  }

  function addAsset(nextAsset: string) {
    setAssetUniverse((current) => {
      if (current.some((item) => item.asset === nextAsset)) {
        return current;
      }

      return [
        ...current,
        {
          asset: nextAsset,
          assetClass: inferAssetClass(nextAsset),
          currency: "USD"
        }
      ];
    });
  }

  function removeAsset(asset: string) {
    setAssetUniverse((current) => current.filter((item) => item.asset !== asset));
  }

  return (
    <section className="min-h-screen bg-[var(--panel-soft)] px-4 py-6 text-[var(--text)] md:px-8">
      <div className="mx-auto grid max-w-[1480px] gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="rounded-lg border-2 border-[var(--border)] bg-[var(--panel)] p-5 shadow-[8px_8px_0_var(--shadow)]">
          <p className="font-mono text-[13px] font-bold uppercase tracking-wide text-[var(--secondary)]">
            Tab 1 / 17 Labs Management
          </p>
          <h1 className="mt-3 font-sans text-[35px] font-black leading-tight">
            Strategy Optimizer
          </h1>

          <form className="mt-6 space-y-5" onSubmit={runOptimization}>
            <label className="block">
              <span className="mb-2 block font-mono text-[13px] font-bold uppercase">
                Start Date
              </span>
              <input
                className="h-12 w-full rounded border-2 border-[var(--border)] bg-[var(--panel-soft)] px-3 font-mono text-[15px] font-bold outline-none focus:shadow-[0_0_0_3px_var(--primary)]"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-2 block font-mono text-[13px] font-bold uppercase">
                Risk Profile
              </span>
              <select
                className="h-12 w-full rounded border-2 border-[var(--border)] bg-[var(--panel-soft)] px-3 text-[15px] font-bold outline-none focus:shadow-[0_0_0_3px_var(--primary)]"
                value={riskProfile}
                onChange={(event) => setRiskProfile(event.target.value as RiskProfile)}
              >
                {RISK_PROFILES.map((profile) => (
                  <option key={profile} value={profile}>
                    {profile}
                  </option>
                ))}
              </select>
            </label>

            <NumberControl
              label="Risk-free Rate"
              max={0.5}
              min={0}
              step={0.005}
              value={riskFreeRate}
              onChange={setRiskFreeRate}
            />

            <label className="block">
              <span className="mb-2 block font-mono text-[13px] font-bold uppercase">
                Target Return
              </span>
              <input
                className="h-12 w-full rounded border-2 border-[var(--border)] bg-[var(--panel-soft)] px-3 font-mono text-[15px] font-bold outline-none focus:shadow-[0_0_0_3px_var(--primary)]"
                type="number"
                min="-1"
                max="5"
                step="0.01"
                value={targetReturn}
                onChange={(event) => setTargetReturn(event.target.value)}
              />
            </label>

            <NumberControl
              label="Target Tolerance"
              max={1}
              min={0}
              step={0.005}
              value={targetTolerance}
              onChange={setTargetTolerance}
            />

            <label className="block">
              <span className="mb-2 block font-mono text-[13px] font-bold uppercase">
                Simulations
              </span>
              <div className="rounded border-2 border-[var(--border)] bg-[var(--panel-soft)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[15px] font-black">
                    {numPortfolios.toLocaleString("en-US")}
                  </span>
                  <input
                    className="w-2/3 accent-[var(--secondary)]"
                    max={100000}
                    min={1000}
                    step={1000}
                    type="range"
                    value={numPortfolios}
                    onChange={(event) => setNumPortfolios(Number(event.target.value))}
                  />
                </div>
              </div>
            </label>

            <div>
              <span className="mb-2 block font-mono text-[13px] font-bold uppercase">
                Asset Universe
              </span>
              <AssetDraftInput onAdd={addAsset} />
              <div className="mt-3 flex flex-wrap gap-2">
                {assetUniverse.map((item) => (
                  <button
                    key={item.asset}
                    className="rounded border-2 border-[var(--border)] bg-[var(--panel)] px-3 py-2 font-mono text-[13px] font-bold hover:bg-[var(--primary)] hover:text-[#1C293C]"
                    type="button"
                    onClick={() => removeAsset(item.asset)}
                  >
                    {item.asset}
                  </button>
                ))}
              </div>
              <button
                className="mt-3 w-full rounded border-2 border-[var(--border)] bg-[var(--panel)] px-4 py-3 font-mono text-[13px] font-black uppercase shadow-[4px_4px_0_var(--shadow)] active:translate-x-1 active:translate-y-1 active:shadow-none"
                disabled={syncingHoldings}
                type="button"
                onClick={() => void useCurrentHoldings()}
              >
                {syncingHoldings ? "Syncing..." : "Use Current Holdings"}
              </button>
            </div>

            <button
              className="h-12 w-full rounded border-2 border-[var(--border)] bg-[var(--secondary)] px-4 font-mono text-[13px] font-black uppercase text-[#ffffff] shadow-[5px_5px_0_var(--shadow)] disabled:cursor-not-allowed disabled:opacity-60 active:translate-x-1 active:translate-y-1 active:shadow-none"
              disabled={loading || assetUniverse.length < 2}
              type="submit"
            >
              {loading ? "Analyzing your strategy..." : "Find my optimal mix"}
            </button>
          </form>

          {error ? (
            <div className="mt-5 rounded border-2 border-[var(--danger)] bg-[var(--panel)] p-3 text-[15px] font-bold text-[var(--danger)]">
              {error}
            </div>
          ) : null}
        </aside>

        <div className="space-y-6">
          <section className="rounded-lg border-2 border-[var(--border)] bg-[var(--panel)] p-5 shadow-[8px_8px_0_var(--shadow)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[13px] font-bold uppercase text-[var(--secondary)]">
                  Efficient Frontier
                </p>
                <h2 className="mt-1 text-[27px] font-black">Risk / Return Map</h2>
              </div>
              {selectedPortfolio ? (
                <div className="flex flex-wrap gap-2">
                  {result?.weightConstraints ? (
                    <div className="rounded border-2 border-[var(--border)] bg-[var(--panel)] px-3 py-2 font-mono text-[13px] font-black">
                      Min {(result.weightConstraints.minWeight * 100).toFixed(0)}% / Max{" "}
                      {(result.weightConstraints.maxWeight * 100).toFixed(0)}%
                    </div>
                  ) : null}
                  <div className="rounded border-2 border-[var(--border)] bg-[var(--primary)] text-[#1C293C] px-3 py-2 font-mono text-[13px] font-black">
                    Sharpe {selectedPortfolio.sharpeRatio.toFixed(2)}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-5 h-[420px] rounded border-2 border-[var(--border)] bg-[var(--panel-soft)] p-3">
              {result?.efficientFrontier?.length ? (
                <ResponsiveContainer height="100%" width="100%">
                  <ScatterChart margin={{ top: 16, right: 18, bottom: 12, left: 8 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" />
                    <XAxis
                      dataKey="volatility"
                      name="Volatility"
                      tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`}
                      type="number"
                    />
                    <YAxis
                      dataKey="expectedReturn"
                      name="Expected Return"
                      tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`}
                      type="number"
                    />
                    <ZAxis dataKey="sharpeRatio" range={[48, 48]} />
                    <Tooltip
                      cursor={{ strokeDasharray: "4 4" }}
                      formatter={(value, name) => [
                        typeof value === "number" ? formatPercentValue(value) : value,
                        name
                      ]}
                    />
                    <Scatter
                      data={result.efficientFrontier}
                      fill="var(--secondary)"
                      name="Portfolios"
                    />
                    {selectedPortfolio ? (
                      <Scatter
                        data={[selectedPortfolio]}
                        fill="var(--primary)"
                        name="Target"
                        stroke="var(--border)"
                        strokeWidth={2}
                      />
                    ) : null}
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-center font-mono text-[15px] font-bold">
                  Configure the strategy and run the optimizer.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-lg border-2 border-[var(--border)] bg-[var(--panel)] p-5 shadow-[8px_8px_0_var(--shadow)]">
            <p className="font-mono text-[13px] font-bold uppercase text-[var(--secondary)]">
              Target Weights
            </p>
            <h2 className="mt-1 text-[27px] font-black">17 Labs Proposal</h2>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left">
                <thead>
                  <tr className="border-b-2 border-[var(--border)] font-mono text-[13px] uppercase">
                    <th className="py-3">Asset</th>
                    <th className="py-3">Weight</th>
                    <th className="py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {weightRows.length ? (
                    weightRows.map((row) => (
                      <tr key={row.asset} className="border-b-2 border-[var(--border)]">
                        <td className="py-3 font-mono text-[15px] font-black">{row.asset}</td>
                        <td className="py-3 text-[17px] font-black">
                          {(row.weight * 100).toFixed(2)}%
                        </td>
                        <td className="py-3">
                          <div className="h-4 rounded border-2 border-[var(--border)] bg-[var(--panel)]">
                            <div
                              className="h-full bg-[var(--success)]"
                              style={{ width: `${Math.min(100, row.expectedValue)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="py-8 text-center font-mono text-[15px] font-bold" colSpan={3}>
                        No target weights yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function NumberControl({
  label,
  max,
  min,
  onChange,
  step,
  value
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: string) => void;
  step: number;
  value: string;
}) {
  function nudge(direction: 1 | -1) {
    const current = Number(value);
    const next = Math.min(max, Math.max(min, (Number.isFinite(current) ? current : 0) + step * direction));
    onChange(next.toFixed(countDecimals(step)));
  }

  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[13px] font-bold uppercase">
        {label}
      </span>
      <div className="flex h-12 overflow-hidden rounded border-2 border-[var(--border)] bg-[var(--panel-soft)]">
        <input
          className="min-w-0 flex-1 bg-transparent px-3 font-mono text-[15px] font-bold outline-none"
          max={max}
          min={min}
          step={step}
          type="number"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          className="w-12 border-l-2 border-[var(--border)] font-mono text-[17px] font-black hover:bg-[var(--primary)] hover:text-[#1C293C]"
          type="button"
          onClick={() => nudge(-1)}
        >
          -
        </button>
        <button
          className="w-12 border-l-2 border-[var(--border)] font-mono text-[17px] font-black hover:bg-[var(--primary)] hover:text-[#1C293C]"
          type="button"
          onClick={() => nudge(1)}
        >
          +
        </button>
      </div>
    </label>
  );
}

function AssetDraftInput({ onAdd }: { onAdd: (asset: string) => void }) {
  const [draft, setDraft] = React.useState("");

  function submitDraft() {
    const nextAsset = draft.trim().toUpperCase();
    if (!nextAsset) {
      setDraft("");
      return;
    }

    onAdd(nextAsset);
    setDraft("");
  }

  return (
    <div className="flex gap-2">
      <input
        className="h-12 min-w-0 flex-1 rounded border-2 border-[var(--border)] bg-[var(--panel-soft)] px-3 font-mono text-[15px] font-bold uppercase outline-none focus:shadow-[0_0_0_3px_var(--primary)]"
        placeholder="MSFT"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submitDraft();
          }
        }}
      />
      <button
        className="h-12 rounded border-2 border-[var(--border)] bg-[var(--primary)] px-4 font-mono text-[13px] font-black uppercase text-[#1C293C] shadow-[4px_4px_0_var(--shadow)] active:translate-x-1 active:translate-y-1 active:shadow-none"
        type="button"
        onClick={submitDraft}
      >
        Add
      </button>
    </div>
  );
}

function inferAssetClass(asset: string) {
  if (asset.includes("-USD")) {
    return "CRYPTO";
  }

  if (asset.endsWith(".PA")) {
    return "FR_STOCK";
  }

  if (asset.endsWith(".VN")) {
    return "VN_STOCK";
  }

  return "US_STOCK";
}

function formatPercentValue(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function readPersistedStrategyState(): PersistedStrategyState | null {
  try {
    const raw = window.localStorage.getItem(STRATEGY_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PersistedStrategyState;
    if (!RISK_PROFILES.includes(parsed.riskProfile) || !Array.isArray(parsed.assetUniverse)) {
      return null;
    }

    return {
      startDate: parsed.startDate ?? DEFAULT_START_DATE,
      riskProfile: parsed.riskProfile,
      riskFreeRate: parsed.riskFreeRate ?? "0.05",
      targetReturn: parsed.targetReturn ?? "0.20",
      targetTolerance: parsed.targetTolerance ?? "0.02",
      numPortfolios: parsed.numPortfolios ?? 5000,
      assetUniverse: parsed.assetUniverse,
      result: parsed.result ?? null
    };
  } catch {
    return null;
  }
}

function persistStrategyState(state: PersistedStrategyState) {
  try {
    window.localStorage.setItem(STRATEGY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Browser storage can fail in private mode or quota pressure. The app still works without persistence.
  }
}

function countDecimals(value: number) {
  const text = String(value);
  return text.includes(".") ? text.split(".")[1].length : 0;
}
