"use client";

import { useTranslation } from "@/i18n";

import { motion } from "framer-motion";
import React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis
} from "recharts";

type RiskProfile = "Conservative" | "Balanced" | "Aggressive";
type OptimizationGoal = "max_sharpe" | "target_return";

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
  optimizationGoal?: OptimizationGoal;
  targetReturn?: number;
  weightConstraints?: {
    minWeight: number;
    maxWeight: number;
  };
  efficientFrontier?: FrontierPoint[];
  bestPortfolio?: FrontierPoint;
  selectedPortfolio?: FrontierPoint;
  targetPortfolio?: FrontierPoint | null;
}

interface StrategyTabProps {
  onNotify?: (message: string, tone?: "error" | "success" | "info") => void;
  onOptimizedWeightsChange?: (weights: Record<string, number>) => void;
}

interface PersistedStrategyState {
  startDate: string;
  riskProfile: RiskProfile;
  optimizationGoal?: OptimizationGoal;
  riskFreeRate: string;
  targetReturn: string;
  targetTolerance: string;
  numPortfolios: number;
  assetUniverse: AssetUniverseItem[];
  result: OptimizationResponse | null;
  optimizedAtPortfolioHash?: string;
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
  stateHash?: string;
  error?: string;
}

const RISK_PROFILES: RiskProfile[] = ["Conservative", "Balanced", "Aggressive"];
const OPTIMIZATION_GOAL_KEYS: Array<{ labelKey: string; value: OptimizationGoal }> = [
  { labelKey: "strategy.maxSharpe", value: "max_sharpe" },
  { labelKey: "strategy.targetReturn", value: "target_return" }
];
const STRATEGY_RESULT_VERSION = 3;
const STRATEGY_STORAGE_KEY = "official.strategyTab.v3";
const DEFAULT_START_DATE = "2020-01-01";
const MIN_SIMULATIONS = 1000;
const DEFAULT_SIMULATIONS = 5000;
const SLIDER_MAX_SIMULATIONS = 10000;
const HARD_MAX_SIMULATIONS = 100000;
const DEFAULT_ASSETS: AssetUniverseItem[] = [
  { asset: "AAPL", assetClass: "US_STOCK", currency: "USD" },
  { asset: "SPY", assetClass: "ETF", currency: "USD" },
  { asset: "BTC-USD", assetClass: "CRYPTO", currency: "USD" },
  { asset: "ETH-USD", assetClass: "CRYPTO", currency: "USD" }
];
const SIMULATION_PRESETS = [
  { labelKey: "strategy.simPreset.fast", value: 2000 },
  { labelKey: "strategy.simPreset.balanced", value: 5000 },
  { labelKey: "strategy.simPreset.precise", value: 10000 }
];

export default function StrategyTab({ onNotify, onOptimizedWeightsChange }: StrategyTabProps) {
  const { t } = useTranslation();
  const riskProfileLabels: Record<RiskProfile, string> = {
    Conservative: t("strategy.conservative"),
    Balanced: t("strategy.balanced"),
    Aggressive: t("strategy.aggressive"),
  };
  const [startDate, setStartDate] = React.useState(DEFAULT_START_DATE);
  const [riskProfile, setRiskProfile] = React.useState<RiskProfile>("Balanced");
  const [optimizationGoal, setOptimizationGoal] =
    React.useState<OptimizationGoal>("max_sharpe");
  const [riskFreeRate, setRiskFreeRate] = React.useState("0.05");
  const [targetReturn, setTargetReturn] = React.useState("0.20");
  const [targetTolerance, setTargetTolerance] = React.useState("0.02");
  const [numPortfolios, setNumPortfolios] = React.useState(DEFAULT_SIMULATIONS);
  const [assetUniverse, setAssetUniverse] = React.useState(DEFAULT_ASSETS);
  const [result, setResult] = React.useState<OptimizationResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [syncingHoldings, setSyncingHoldings] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);
  const [currentPortfolioHash, setCurrentPortfolioHash] = React.useState<string | null>(null);
  const [optimizedAtPortfolioHash, setOptimizedAtPortfolioHash] = React.useState<string | null>(null);

  const selectedPortfolio = selectPortfolioForGoal(result, optimizationGoal);
  const distributionStats = React.useMemo(
    () => buildNormalDistributionStats(selectedPortfolio),
    [selectedPortfolio]
  );
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
      setOptimizationGoal(saved.optimizationGoal ?? "max_sharpe");
      setRiskFreeRate(saved.riskFreeRate);
      setTargetReturn(saved.targetReturn);
      setTargetTolerance(saved.targetTolerance);
      setNumPortfolios(normalizeSimulationCount(saved.numPortfolios));
      setAssetUniverse(saved.assetUniverse);
      setResult(saved.result);
      if (saved.optimizedAtPortfolioHash) {
        setOptimizedAtPortfolioHash(saved.optimizedAtPortfolioHash);
      }
    }
    setHydrated(true);
    if (!saved) {
      void loadLatestOptimizationRun();
    }
    
    // Check current reality hash quietly to detect stale weights
    fetch("/api/portfolio/reality?baseCurrency=USD", { cache: "no-store" })
      .then((res) => res.json())
      .then((payload: RealityResponse) => {
        if (payload.ok && payload.stateHash) {
          setCurrentPortfolioHash(payload.stateHash);
        }
      })
      .catch(() => {});
  }, [onOptimizedWeightsChange]);

  React.useEffect(() => {
    if (!hydrated) {
      return;
    }

    onOptimizedWeightsChange?.(selectedPortfolio?.weights ?? {});
  }, [hydrated, onOptimizedWeightsChange, selectedPortfolio]);

  React.useEffect(() => {
    if (!hydrated) {
      return;
    }

    persistStrategyState({
      startDate,
      riskProfile,
      optimizationGoal,
      riskFreeRate,
      targetReturn,
      targetTolerance,
      numPortfolios,
      assetUniverse,
      result,
      optimizedAtPortfolioHash: optimizedAtPortfolioHash || undefined
    });
  }, [
    assetUniverse,
    hydrated,
    numPortfolios,
    optimizationGoal,
    result,
    riskFreeRate,
    riskProfile,
    startDate,
    targetReturn,
    targetTolerance,
    optimizedAtPortfolioHash
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
          optimizationGoal,
          riskFreeRate: Number(riskFreeRate),
          targetReturn: Number(targetReturn),
          targetTolerance: Number(targetTolerance),
          numPortfolios: normalizeSimulationCount(numPortfolios),
          assetUniverse,
          resultVersion: STRATEGY_RESULT_VERSION
        })
      });
      const payload = (await response.json()) as OptimizationResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Optimization failed.");
      }

      setResult(payload);
      setOptimizedAtPortfolioHash(currentPortfolioHash);
      onNotify?.(t("strategy.toast.success"), "success");
      onOptimizedWeightsChange?.(
        selectPortfolioForGoal(payload, optimizationGoal)?.weights ?? {}
      );
    } catch (runError) {
      setResult(null);
      onOptimizedWeightsChange?.({});
      const message = runError instanceof Error ? runError.message : "Optimization failed.";
      setError(message);
      onNotify?.(message, "error");
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
      if (run.config?.optimizationGoal === "max_sharpe" || run.config?.optimizationGoal === "target_return") {
        setOptimizationGoal(run.config.optimizationGoal);
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
        setNumPortfolios(normalizeSimulationCount(Number(run.config.numPortfolios)));
      }
      if (Array.isArray(run.config?.assetUniverse) && run.config.assetUniverse.length > 0) {
        setAssetUniverse(run.config.assetUniverse);
      }
      if (run.config?.optimizedAtPortfolioHash) {
        setOptimizedAtPortfolioHash(run.config.optimizedAtPortfolioHash);
      }
      setResult(run.result);
      onOptimizedWeightsChange?.(
        selectPortfolioForGoal(
          run.result,
          run.config?.optimizationGoal === "target_return" ? "target_return" : "max_sharpe"
        )?.weights ?? {}
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

      if (payload.stateHash) {
        setCurrentPortfolioHash(payload.stateHash);
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
      onNotify?.(t("strategy.toast.holdingsLoaded"), "success");
    } catch (syncError) {
      const message =
        syncError instanceof Error ? syncError.message : "Unable to sync holdings.";
      setError(message);
      onNotify?.(message, "error");
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

  const isStale =
    hydrated &&
    result &&
    currentPortfolioHash &&
    optimizedAtPortfolioHash &&
    optimizedAtPortfolioHash !== currentPortfolioHash;

  return (
    <section className="min-h-screen bg-[var(--panel-soft)] px-4 py-6 text-[var(--text)] md:px-8">
      <div className="mx-auto grid max-w-[1480px] gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="rounded-lg border-2 border-[var(--border)] bg-[var(--panel)] p-5 shadow-[8px_8px_0_var(--shadow)]">
          <p className="font-mono text-[13px] font-bold uppercase tracking-wide text-[var(--secondary)]">
            {t("strategy.tab")}
          </p>
          <h1 className="mt-3 font-sans text-[35px] font-black leading-tight">
            {t("strategy.title")}
          </h1>

          <form className="mt-6 space-y-5" onSubmit={runOptimization}>
            <label className="block">
              <span className="mb-2 block font-mono text-[13px] font-bold uppercase">
                {t("strategy.startDate")}
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
                {t("strategy.riskProfile")}
              </span>
              <select
                className="h-12 w-full rounded border-2 border-[var(--border)] bg-[var(--panel-soft)] px-3 text-[15px] font-bold outline-none focus:shadow-[0_0_0_3px_var(--primary)]"
                value={riskProfile}
                onChange={(event) => setRiskProfile(event.target.value as RiskProfile)}
              >
                {RISK_PROFILES.map((profile) => (
                  <option key={profile} value={profile}>
                    {riskProfileLabels[profile]}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <span className="mb-2 block font-mono text-[13px] font-bold uppercase">
                {t("strategy.optimizationGoal")}
              </span>
              <div className="grid gap-2 sm:grid-cols-2">
                {OPTIMIZATION_GOAL_KEYS.map((goal) => (
                  <button
                    key={goal.value}
                    className={`min-h-12 rounded border-2 border-[var(--border)] px-3 py-2 font-mono text-[13px] font-black uppercase shadow-[4px_4px_0_var(--shadow)] active:translate-x-1 active:translate-y-1 active:shadow-none ${
                      optimizationGoal === goal.value
                        ? "bg-[var(--primary)] text-[#1C293C]"
                        : "bg-[var(--panel)]"
                    }`}
                    type="button"
                    onClick={() => setOptimizationGoal(goal.value)}
                  >
                    {t(goal.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            <PercentControl
              label={t("strategy.riskFreeRate")}
              maxPercent={50}
              minPercent={0}
              stepPercent={0.5}
              value={riskFreeRate}
              onChange={setRiskFreeRate}
            />

            <PercentControl
              label={t("strategy.targetReturn")}
              disabled={optimizationGoal !== "target_return"}
              maxPercent={500}
              minPercent={-100}
              stepPercent={1}
              value={targetReturn}
              onChange={setTargetReturn}
            />

            <PercentControl
              label={t("strategy.targetTolerance")}
              disabled={optimizationGoal !== "target_return"}
              maxPercent={100}
              minPercent={0}
              stepPercent={0.5}
              value={targetTolerance}
              onChange={setTargetTolerance}
            />

            <SimulationControl
              label={t("strategy.simulations")}
              value={numPortfolios}
              onChange={setNumPortfolios}
              t={t}
            />

            <div>
              <span className="mb-2 block font-mono text-[13px] font-bold uppercase">
                {t("strategy.assetUniverse")}
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
                {syncingHoldings ? t("strategy.syncing") : t("strategy.useHoldings")}
              </button>
            </div>

            <button
              className="h-12 w-full rounded border-2 border-[var(--border)] bg-[var(--secondary)] px-4 font-mono text-[13px] font-black uppercase text-[#ffffff] shadow-[5px_5px_0_var(--shadow)] disabled:cursor-not-allowed disabled:opacity-60 active:translate-x-1 active:translate-y-1 active:shadow-none"
              disabled={loading || assetUniverse.length < 2}
              type="submit"
            >
              {loading ? t("strategy.running") : t("strategy.runOptimizer")}
            </button>
          </form>

          {error ? (
            <div className="mt-5 rounded border-2 border-[var(--danger)] bg-[var(--panel)] p-3 text-[15px] font-bold text-[var(--danger)]">
              {error}
            </div>
          ) : null}
        </aside>

        <div className="space-y-6">
          {isStale && (
            <div className="rounded border-2 border-orange-500 bg-orange-50 p-4 text-orange-900 shadow-[4px_4px_0_#f97316]">
              <div className="flex items-start gap-3">
                <span className="text-xl">⚠️</span>
                <div>
                  <h3 className="font-bold">{t("strategy.stale.title") || "Portfolio has changed"}</h3>
                  <p className="text-sm">
                    {t("strategy.stale.description") || "Your Reality portfolio has been updated since the last time you ran the optimizer. Please re-run the Strategy Optimizer to get accurate target weights."}
                  </p>
                </div>
              </div>
            </div>
          )}

          <section className="rounded-lg border-2 border-[var(--border)] bg-[var(--panel)] p-5 shadow-[8px_8px_0_var(--shadow)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[13px] font-bold uppercase text-[var(--secondary)]">
                  {t("strategy.frontier.title")}
                </p>
                <h2 className="mt-1 text-[27px] font-black">{t("strategy.frontier.subtitle")}</h2>
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

            <motion.div
              key={`frontier-${result?.efficientFrontier?.length ?? 0}-${selectedPortfolio?.sharpeRatio ?? "empty"}`}
              animate={{ opacity: 1, y: 0 }}
              className="mt-5 h-[420px] rounded border-2 border-[var(--border)] bg-[var(--panel-soft)] p-3"
              initial={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
            >
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
                  {t("strategy.weights.emptyHint")}
                </div>
              )}
            </motion.div>
          </section>

          <section className="rounded-lg border-2 border-[var(--border)] bg-[var(--panel)] p-5 shadow-[8px_8px_0_var(--shadow)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[13px] font-bold uppercase text-[var(--secondary)]">
                  {t("strategy.distribution.title")}
                </p>
                <h2 className="mt-1 text-[27px] font-black">
                  {t("strategy.distribution.subtitle")}
                </h2>
              </div>
              {distributionStats ? (
                <div className="rounded border-2 border-[var(--border)] bg-[var(--primary)] px-3 py-2 font-mono text-[13px] font-black text-[#1C293C]">
                  {t("strategy.distribution.assumption")}
                </div>
              ) : null}
            </div>

            {distributionStats ? (
              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="h-[280px] rounded border-2 border-[var(--border)] bg-[var(--panel-soft)] p-3">
                  <ResponsiveContainer height="100%" width="100%">
                    <AreaChart
                      data={distributionStats.curve}
                      margin={{ top: 12, right: 18, bottom: 8, left: 4 }}
                    >
                      <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" />
                      <XAxis
                        dataKey="returnValue"
                        tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
                        type="number"
                      />
                      <YAxis hide type="number" />
                      <Tooltip
                        content={(props) => (
                          <NormalDistributionTooltip
                            {...props}
                            t={t}
                          />
                        )}
                      />
                      <ReferenceLine
                        stroke="var(--border)"
                        strokeWidth={2}
                        x={0}
                      />
                      <Area
                        dataKey="lossDensity"
                        fill="var(--danger)"
                        fillOpacity={0.34}
                        isAnimationActive={false}
                        stroke="var(--danger)"
                        strokeWidth={2}
                        type="monotone"
                      />
                      <Area
                        dataKey="profitDensity"
                        fill="var(--success)"
                        fillOpacity={0.36}
                        isAnimationActive={false}
                        stroke="var(--success)"
                        strokeWidth={2}
                        type="monotone"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[320px] border-collapse text-left">
                    <tbody>
                      {distributionStats.rows.map((row) => (
                        <tr key={row.labelKey} className="border-b-2 border-[var(--border)]">
                          <th className="py-3 pr-3 font-mono text-[13px] uppercase">
                            {t(row.labelKey)}
                          </th>
                          <td className="py-3 text-right text-[18px] font-black">
                            {row.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 text-[13px] font-bold leading-relaxed text-[var(--muted)]">
                    {t("strategy.distribution.note")}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex min-h-[180px] items-center justify-center rounded border-2 border-[var(--border)] bg-[var(--panel-soft)] p-4 text-center font-mono text-[15px] font-bold">
                {t("strategy.distribution.empty")}
              </div>
            )}
          </section>

          <section className="rounded-lg border-2 border-[var(--border)] bg-[var(--panel)] p-5 shadow-[8px_8px_0_var(--shadow)]">
            <p className="font-mono text-[13px] font-bold uppercase text-[var(--secondary)]">
              {t("strategy.weights.title")}
            </p>
            <h2 className="mt-1 text-[27px] font-black">{t("strategy.weights.subtitle")}</h2>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left">
                <thead>
                  <tr className="border-b-2 border-[var(--border)] font-mono text-[13px] uppercase">
                    <th className="py-3">{t("strategy.weights.asset")}</th>
                    <th className="py-3">{t("strategy.weights.weight")}</th>
                    <th className="py-3">{t("strategy.weights.action")}</th>
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
                        {t("strategy.weights.empty")}
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

function PercentControl({
  disabled = false,
  label,
  maxPercent,
  minPercent,
  onChange,
  stepPercent,
  value
}: {
  disabled?: boolean;
  label: string;
  maxPercent: number;
  minPercent: number;
  onChange: (value: string) => void;
  stepPercent: number;
  value: string;
}) {
  const displayValue = decimalStringToPercentString(value);

  function nudge(direction: 1 | -1) {
    const current = parseLocaleNumber(displayValue);
    const next = Math.min(
      maxPercent,
      Math.max(minPercent, (Number.isFinite(current) ? current : 0) + stepPercent * direction)
    );
    onChange(percentNumberToDecimalString(next));
  }

  function updateFromDisplay(nextDisplayValue: string) {
    const parsed = parseLocaleNumber(nextDisplayValue);
    if (!Number.isFinite(parsed)) {
      onChange("");
      return;
    }

    onChange(percentNumberToDecimalString(parsed));
  }

  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[13px] font-bold uppercase">
        {label}
      </span>
      <div
        className={`flex h-12 overflow-hidden rounded border-2 border-[var(--border)] bg-[var(--panel-soft)] ${
          disabled ? "opacity-45" : ""
        }`}
      >
        <input
          className="min-w-0 flex-1 bg-transparent px-3 font-mono text-[15px] font-bold outline-none"
          disabled={disabled}
          inputMode="decimal"
          max={maxPercent}
          min={minPercent}
          step={stepPercent}
          type="text"
          value={displayValue}
          onChange={(event) => updateFromDisplay(event.target.value)}
        />
        <span className="flex w-10 items-center justify-center border-l-2 border-[var(--border)] font-mono text-[15px] font-black">
          %
        </span>
        <button
          className="w-12 border-l-2 border-[var(--border)] font-mono text-[17px] font-black hover:bg-[var(--primary)] hover:text-[#1C293C]"
          disabled={disabled}
          type="button"
          onClick={() => nudge(-1)}
        >
          -
        </button>
        <button
          className="w-12 border-l-2 border-[var(--border)] font-mono text-[17px] font-black hover:bg-[var(--primary)] hover:text-[#1C293C]"
          disabled={disabled}
          type="button"
          onClick={() => nudge(1)}
        >
          +
        </button>
      </div>
    </label>
  );
}

function SimulationControl({
  label,
  onChange,
  t,
  value
}: {
  label: string;
  onChange: (value: number) => void;
  t: (key: string, replacements?: Record<string, string | number>) => string;
  value: number;
}) {
  const normalizedValue = normalizeSimulationCount(value);
  const isAdvanced = normalizedValue > SLIDER_MAX_SIMULATIONS;

  function update(nextValue: number) {
    onChange(normalizeSimulationCount(nextValue));
  }

  return (
    <div>
      <span className="mb-2 block font-mono text-[13px] font-bold uppercase">
        {label}
      </span>
      <div className="rounded border-2 border-[var(--border)] bg-[var(--panel-soft)] p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[15px] font-black">
            {normalizedValue.toLocaleString("en-US")}
          </span>
          <input
            className="w-2/3 accent-[var(--secondary)]"
            max={SLIDER_MAX_SIMULATIONS}
            min={MIN_SIMULATIONS}
            step={1000}
            type="range"
            value={Math.min(normalizedValue, SLIDER_MAX_SIMULATIONS)}
            onChange={(event) => update(Number(event.target.value))}
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {SIMULATION_PRESETS.map((preset) => (
            <button
              key={preset.value}
              className={`min-h-10 rounded border-2 border-[var(--border)] px-2 font-mono text-[12px] font-black uppercase ${
                normalizedValue === preset.value
                  ? "bg-[var(--primary)] text-[#1C293C]"
                  : "bg-[var(--panel)]"
              }`}
              type="button"
              onClick={() => update(preset.value)}
            >
              {t(preset.labelKey)}
            </button>
          ))}
        </div>

        <label className="mt-3 block">
          <span className="mb-2 block font-mono text-[12px] font-bold uppercase text-[var(--muted)]">
            {t("strategy.simAdvanced")}
          </span>
          <input
            className="h-11 w-full rounded border-2 border-[var(--border)] bg-[var(--panel)] px-3 font-mono text-[14px] font-bold outline-none focus:shadow-[0_0_0_3px_var(--primary)]"
            inputMode="numeric"
            max={HARD_MAX_SIMULATIONS}
            min={MIN_SIMULATIONS}
            step={1000}
            type="number"
            value={normalizedValue}
            onChange={(event) => update(Number(event.target.value))}
          />
        </label>

        {isAdvanced ? (
          <p className="mt-2 rounded border-2 border-[var(--danger)] bg-[var(--panel)] p-2 font-mono text-[12px] font-bold text-[var(--danger)]">
            {t("strategy.simAdvancedWarning", {
              max: HARD_MAX_SIMULATIONS.toLocaleString("en-US")
            })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function NormalDistributionTooltip({
  active,
  label,
  payload,
  t
}: {
  active?: boolean;
  label?: number | string;
  payload?: Array<{
    dataKey?: string | number;
    payload?: unknown;
    value?: unknown;
  }>;
  t: (key: string, replacements?: Record<string, string | number>) => string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const isProfit = payload.some(
    (item) => item.dataKey === "profitDensity" && item.value !== null
  );
  return (
    <div className="rounded border-2 border-[var(--border)] bg-[var(--panel)] p-3 shadow-[4px_4px_0_var(--shadow)]">
      <p className="font-mono text-[13px] font-black">
        {t("strategy.distribution.returnLabel", {
          value: `${Number(label).toFixed(1)}%`
        })}
      </p>
      <p
        className={`mt-1 font-mono text-[13px] font-black ${
          isProfit ? "text-[var(--success)]" : "text-[var(--danger)]"
        }`}
      >
        {t("strategy.distribution.outcome")}:{" "}
        {isProfit
          ? t("strategy.distribution.outcomeProfit")
          : t("strategy.distribution.outcomeLoss")}
      </p>
    </div>
  );
}

function decimalStringToPercentString(value: string) {
  const decimal = Number(value);
  if (!Number.isFinite(decimal)) {
    return "";
  }

  return formatInputNumber(decimal * 100);
}

function percentNumberToDecimalString(value: number) {
  return formatInputNumber(value / 100);
}

function parseLocaleNumber(value: string) {
  return Number(value.replace(",", "."));
}

function formatInputNumber(value: number) {
  return Number(value.toFixed(6)).toString();
}

function buildNormalDistributionStats(portfolio: FrontierPoint | null) {
  if (!portfolio || portfolio.volatility <= 0) {
    return null;
  }

  const mean = portfolio.expectedReturn;
  const stdDev = portfolio.volatility;
  const lossProbability = normalCdf(0, mean, stdDev);
  const profitProbability = 1 - lossProbability;
  const minReturn = mean - stdDev * 3;
  const maxReturn = mean + stdDev * 3;
  const step = (maxReturn - minReturn) / 80;

  const curve = Array.from({ length: 81 }, (_, index) => {
    const returnValue = minReturn + step * index;
    const density = normalPdf(returnValue, mean, stdDev);

    return {
      returnValue: returnValue * 100,
      lossDensity: returnValue < 0 ? density : null,
      profitDensity: returnValue >= 0 ? density : null
    };
  });

  return {
    curve,
    rows: [
      {
        labelKey: "strategy.distribution.expectedReturn",
        value: formatPercentValue(mean)
      },
      {
        labelKey: "strategy.distribution.volatility",
        value: formatPercentValue(stdDev)
      },
      {
        labelKey: "strategy.distribution.profitProbability",
        value: formatPercentValue(profitProbability)
      },
      {
        labelKey: "strategy.distribution.lossProbability",
        value: formatPercentValue(lossProbability)
      }
    ]
  };
}

function normalPdf(value: number, mean: number, stdDev: number) {
  const z = (value - mean) / stdDev;
  return Math.exp(-0.5 * z * z) / (stdDev * Math.sqrt(2 * Math.PI));
}

function normalCdf(value: number, mean: number, stdDev: number) {
  return 0.5 * (1 + erf((value - mean) / (stdDev * Math.SQRT2)));
}

function erf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y =
    1 -
    (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-x * x);

  return sign * y;
}

function normalizeSimulationCount(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SIMULATIONS;
  }

  const rounded = Math.round(value / 1000) * 1000;
  return Math.min(HARD_MAX_SIMULATIONS, Math.max(MIN_SIMULATIONS, rounded));
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
      optimizationGoal:
        parsed.optimizationGoal === "target_return" || parsed.optimizationGoal === "max_sharpe"
          ? parsed.optimizationGoal
          : "max_sharpe",
      riskFreeRate: parsed.riskFreeRate ?? "0.05",
      targetReturn: parsed.targetReturn ?? "0.20",
      targetTolerance: parsed.targetTolerance ?? "0.02",
      numPortfolios: parsed.numPortfolios ?? 5000,
      assetUniverse: parsed.assetUniverse,
      result: parsed.result ?? null,
      optimizedAtPortfolioHash: parsed.optimizedAtPortfolioHash
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

function selectPortfolioForGoal(
  result: OptimizationResponse | null | undefined,
  goal: OptimizationGoal
) {
  if (!result?.ok) {
    return null;
  }

  if (goal === "target_return") {
    return result.targetPortfolio ?? result.bestPortfolio ?? null;
  }

  return result.bestPortfolio ?? null;
}

function countDecimals(value: number) {
  const text = String(value);
  return text.includes(".") ? text.split(".")[1].length : 0;
}
