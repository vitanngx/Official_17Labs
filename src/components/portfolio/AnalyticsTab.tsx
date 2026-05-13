"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine
} from "recharts";
import { useTranslation } from "@/i18n";
import { PortfolioRealityPayload } from "@/types/reality";
import { formatCurrency, formatPercent } from "@/lib/formatters";

interface AnalyticsTabProps {
  onNotify?: (message: string, tone?: "success" | "error" | "info") => void;
}

interface AnalyticsResult {
  ok: boolean;
  dates: string[];
  portfolio: number[];
  benchmark: number[];
  benchmark_ok?: boolean;
  error?: string;
}

export default function AnalyticsTab({ onNotify }: AnalyticsTabProps) {
  const { t } = useTranslation();
  const [reality, setReality] = useState<PortfolioRealityPayload | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [benchmark, setBenchmark] = useState("SPY");
  const [customBenchmark, setCustomBenchmark] = useState("");
  const [dateRange, setDateRange] = useState("ALL");
  const [mode, setMode] = useState<"ACTUAL" | "BACKTEST">("ACTUAL");
  const ranges = ["1M", "3M", "6M", "YTD", "1Y", "5Y", "ALL"];

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const realityRes = await fetch("/api/portfolio/reality");
        const realityData = await realityRes.json();
        if (realityRes.ok && realityData.ok) {
          setReality(realityData);
          setLoading(false);
        } else {
          setLoading(false);
          return;
        }
      } catch (err) {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (!reality) return;
    async function fetchAnalytics() {
      setChartLoading(true);
      try {
        const baseCurr = reality?.baseCurrency || "USD";
        const analyticsRes = await fetch("/api/portfolio/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ benchmark, baseCurrency: baseCurr, dateRange, mode })
        });
        const analyticsData = await analyticsRes.json();
        if (analyticsRes.ok && analyticsData.ok) {
          setAnalytics(analyticsData);
          if (analyticsData.benchmark_ok === false) {
            onNotify?.(t("analytics.benchmarkFail") || `Could not fetch data for ${benchmark}`, "error");
          }
        } else if (analyticsData.error && !analyticsData.error.includes("No transactions")) {
          onNotify?.(analyticsData.error || t("analytics.error"), "error");
        }
      } catch (err) {
        onNotify?.("Failed to fetch analytics data", "error");
      } finally {
        setChartLoading(false);
      }
    }
    fetchAnalytics();
  }, [benchmark, dateRange, mode, reality, onNotify, t]);

  const chartData = useMemo(() => {
    if (!analytics || !analytics.dates) return [];
    return analytics.dates.map((date, idx) => ({
      date,
      portfolio: analytics.portfolio[idx],
      benchmark: analytics.benchmark[idx]
    }));
  }, [analytics]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center font-mono text-sm font-bold opacity-60">
        {t("reality.loading") || "Loading Analytics..."}
      </div>
    );
  }

  if (!reality || reality.holdings.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center font-mono text-sm font-bold opacity-60">
        <p>{t("analytics.empty") || "Add transactions in Reality tab to view analytics."}</p>
      </div>
    );
  }

  const baseCurr = reality.baseCurrency;
  
  // Contribution calculations
  const winners = [...reality.holdings]
    .filter(h => h.totalPnL > 0)
    .sort((a, b) => b.totalPnL - a.totalPnL);
    
  const losers = [...reality.holdings]
    .filter(h => h.totalPnL < 0)
    .sort((a, b) => a.totalPnL - b.totalPnL);

  const renderSummary = () => {
    if (!analytics || !analytics.dates || analytics.dates.length === 0) return null;
    const portStart = analytics.portfolio[0];
    const portEnd = analytics.portfolio[analytics.portfolio.length - 1];
    const benchStart = analytics.benchmark_ok !== false ? analytics.benchmark[0] : 100;
    const benchEnd = analytics.benchmark_ok !== false ? analytics.benchmark[analytics.benchmark.length - 1] : 100;

    const portRet = (portEnd - portStart) / portStart;
    const benchRet = (benchEnd - benchStart) / benchStart;
    const alpha = portRet - benchRet;

    return (
      <div className="mb-4 flex flex-wrap gap-6 rounded border-2 border-[var(--border)] bg-[var(--surface)] p-3 shadow-inner">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase opacity-60">Portfolio Return</p>
          <p className={`font-mono text-sm font-black ${portRet >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {formatPercent(portRet)}
          </p>
        </div>
        {analytics.benchmark_ok !== false && (
          <>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase opacity-60">Benchmark Return</p>
              <p className={`font-mono text-sm font-black ${benchRet >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatPercent(benchRet)}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase opacity-60">Alpha</p>
              <p className={`font-mono text-sm font-black ${alpha >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {alpha >= 0 ? "+" : ""}{formatPercent(alpha)}
              </p>
            </div>
          </>
        )}
        <div>
          <p className="font-mono text-[10px] font-bold uppercase opacity-60">Observations</p>
          <p className="font-mono text-sm font-black">{analytics.dates.length} days</p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded border-2 border-[var(--border)] bg-[var(--panel)] p-4 shadow-[4px_4px_0_var(--shadow)]">
          <p className="font-mono text-[11px] font-bold uppercase opacity-70">{t("analytics.totalPnL") || "Total PnL"}</p>
          <p className={`mt-1 text-2xl font-black ${reality.totalPnLBase >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {formatCurrency(reality.totalPnLBase, baseCurr)}
          </p>
          <p className="font-mono text-[11px] font-bold opacity-70">
            {reality.capitalInvestedBase > 0 
              ? formatPercent(reality.totalPnLBase / reality.capitalInvestedBase)
              : "0%"}
          </p>
        </div>
        <div className="rounded border-2 border-[var(--border)] bg-[var(--panel)] p-4 shadow-[4px_4px_0_var(--shadow)]">
          <p className="font-mono text-[11px] font-bold uppercase opacity-70">{t("analytics.unrealizedPnL") || "Unrealized PnL"}</p>
          <p className={`mt-1 text-2xl font-black ${reality.totalUnrealizedPnLBase >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {formatCurrency(reality.totalUnrealizedPnLBase, baseCurr)}
          </p>
        </div>
        <div className="rounded border-2 border-[var(--border)] bg-[var(--panel)] p-4 shadow-[4px_4px_0_var(--shadow)]">
          <p className="font-mono text-[11px] font-bold uppercase opacity-70">{t("analytics.realizedPnL") || "Realized PnL"}</p>
          <p className={`mt-1 text-2xl font-black ${reality.totalRealizedPnLBase >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {formatCurrency(reality.totalRealizedPnLBase, baseCurr)}
          </p>
        </div>
        <div className="rounded border-2 border-[var(--border)] bg-[var(--panel)] p-4 shadow-[4px_4px_0_var(--shadow)]">
          <p className="font-mono text-[11px] font-bold uppercase opacity-70">{t("analytics.dividends") || "Dividends"}</p>
          <p className="mt-1 text-2xl font-black text-blue-500">
            {formatCurrency(reality.totalDividendsBase, baseCurr)}
          </p>
        </div>
      </section>

      {/* Chart Section */}
      <section className="rounded-lg border-2 border-[var(--border)] bg-[var(--panel)] p-5 shadow-[8px_8px_0_var(--shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-black">{t("analytics.navChartTitle") || "Performance vs Benchmark"}</h2>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm font-bold opacity-70">
                {mode === "ACTUAL" 
                  ? (t("analytics.navChartDesc") || "Time-Weighted Return (TWR) Indexed to 100")
                  : (t("analytics.backtestDesc") || "Current Mix Simulated Historical Performance")}
              </p>
              <div className="flex items-center rounded border-2 border-[var(--border)] bg-[var(--surface)] text-[10px] font-black uppercase overflow-hidden">
                <button 
                  onClick={() => setMode("ACTUAL")} 
                  className={`px-2 py-1 ${mode === "ACTUAL" ? "bg-[var(--primary)] text-[#1C293C]" : "opacity-60 hover:bg-[var(--panel-soft)]"}`}
                >
                  ACTUAL
                </button>
                <button 
                  onClick={() => setMode("BACKTEST")} 
                  className={`px-2 py-1 ${mode === "BACKTEST" ? "bg-purple-500 text-white" : "opacity-60 hover:bg-[var(--panel-soft)]"}`}
                >
                  BACKTEST
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded border-2 border-[var(--border)] bg-[var(--surface)] p-1 shadow-sm">
              {ranges.map(r => (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={`px-2 py-1 font-mono text-[11px] font-black rounded ${dateRange === r ? "bg-[var(--primary)] text-[#1C293C]" : "hover:bg-[var(--panel-soft)]"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <select 
                value={["SPY", "QQQ", "^VNINDEX", "BTC-USD"].includes(benchmark) ? benchmark : "CUSTOM"}
                onChange={(e) => {
                  if (e.target.value !== "CUSTOM") {
                    setBenchmark(e.target.value);
                    setCustomBenchmark("");
                  }
                }}
                className="h-9 rounded border-2 border-[var(--border)] bg-[var(--surface)] px-2 font-mono text-xs font-bold outline-none"
              >
                <option value="SPY">S&P 500 (SPY)</option>
                <option value="QQQ">Nasdaq 100 (QQQ)</option>
                <option value="^VNINDEX">VN-Index</option>
                <option value="BTC-USD">Bitcoin</option>
                <option value="CUSTOM">Custom...</option>
              </select>
              {!["SPY", "QQQ", "^VNINDEX", "BTC-USD"].includes(benchmark) && (
                <div className="flex h-9 rounded border-2 border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                  <input 
                    type="text" 
                    value={customBenchmark} 
                    onChange={e => setCustomBenchmark(e.target.value.toUpperCase())}
                    placeholder="Ticker"
                    className="w-20 bg-transparent px-2 font-mono text-xs font-bold outline-none"
                  />
                  <button 
                    onClick={() => { if (customBenchmark) setBenchmark(customBenchmark); }}
                    className="bg-[var(--primary)] text-[#1C293C] px-2 font-mono text-[10px] font-black border-l-2 border-[var(--border)]"
                  >
                    APPLY
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {renderSummary()}
        
        {analytics?.dates && analytics.dates.length > 0 && analytics.dates.length < 5 && (
          <div className="mb-4 rounded border-2 border-yellow-500 bg-yellow-500/10 p-2 text-yellow-600 font-mono text-xs font-bold">
            {t("analytics.shortHistory") || "Portfolio history is short. Add older transactions to see a longer trend."}
          </div>
        )}

        <div className="h-[350px] w-full relative">
          {chartLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--panel)] bg-opacity-70 font-mono text-sm font-bold backdrop-blur-sm">
              {t("analytics.calculating") || "Calculating historical performance..."}
            </div>
          )}
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis 
                  dataKey="date" 
                  stroke="var(--text)" 
                  fontSize={12} 
                  tickFormatter={(val) => val.substring(5, 10)} 
                  minTickGap={20}
                />
                <YAxis 
                  domain={['auto', 'auto']} 
                  stroke="var(--text)" 
                  fontSize={12} 
                  tickFormatter={(val) => val.toFixed(0)} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)', borderRadius: '4px' }}
                  formatter={(value: number, name: string) => [value.toFixed(2), name]}
                />
                <Legend />
                <ReferenceLine y={100} stroke="var(--text)" strokeOpacity={0.2} strokeDasharray="3 3" />
                <Line 
                  type="monotone" 
                  dataKey="portfolio" 
                  name="Portfolio" 
                  stroke="var(--primary)" 
                  strokeWidth={3} 
                  dot={false} 
                />
                {analytics?.benchmark_ok !== false && (
                  <Line 
                    type="monotone" 
                    dataKey="benchmark" 
                    name={benchmark} 
                    stroke="var(--secondary)" 
                    strokeWidth={2} 
                    dot={false} 
                    strokeDasharray="5 5"
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center font-mono text-sm font-bold opacity-60">
              {t("analytics.calculating") || "Calculating historical performance..."}
            </div>
          )}
        </div>
      </section>

      {/* PnL Breakdown Table */}
      <section className="rounded-lg border-2 border-[var(--border)] bg-[var(--panel)] p-5 shadow-[8px_8px_0_var(--shadow)]">
        <h2 className="text-xl font-black mb-4">{t("analytics.breakdown") || "PnL Breakdown"}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-[var(--border)] font-mono text-[11px] uppercase opacity-70">
                <th className="py-3 px-2">{t("reality.asset")}</th>
                <th className="py-3 px-2">{t("reality.weight")}</th>
                <th className="py-3 px-2 text-right">{t("analytics.unrealizedPnL") || "Unrealized"}</th>
                <th className="py-3 px-2 text-right">{t("analytics.realizedPnL") || "Realized"}</th>
                <th className="py-3 px-2 text-right">{t("analytics.dividends") || "Dividends"}</th>
                <th className="py-3 px-2 text-right">{t("analytics.totalPnL") || "Total PnL"}</th>
              </tr>
            </thead>
            <tbody className="font-mono text-[13px] font-bold">
              {reality.holdings.map((h) => (
                <tr key={h.asset} className="border-b border-[var(--border)] hover:bg-[var(--surface)]">
                  <td className="py-3 px-2">{h.asset}</td>
                  <td className="py-3 px-2">{h.weightPct.toFixed(1)}%</td>
                  <td className={`py-3 px-2 text-right ${h.unrealizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {formatCurrency(h.unrealizedPnL * h.fxRate, baseCurr)}
                  </td>
                  <td className={`py-3 px-2 text-right ${h.realizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {formatCurrency(h.realizedPnL * h.fxRate, baseCurr)}
                  </td>
                  <td className="py-3 px-2 text-right text-blue-500">
                    {formatCurrency(h.dividends * h.fxRate, baseCurr)}
                  </td>
                  <td className={`py-3 px-2 text-right font-black ${h.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {formatCurrency(h.totalPnL * h.fxRate, baseCurr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Contribution Analysis */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border-2 border-[var(--border)] bg-[var(--panel)] p-5 shadow-[8px_8px_0_var(--shadow)]">
          <h2 className="text-xl font-black mb-4 text-green-500">{t("analytics.topWinners") || "Top Winners"}</h2>
          {winners.length > 0 ? (
            <div className="space-y-3">
              {winners.slice(0, 5).map(w => (
                <div key={w.asset} className="flex justify-between items-center border-b border-[var(--border)] pb-2 font-mono text-[13px] font-bold">
                  <span>{w.asset}</span>
                  <span className="text-green-500">+{formatCurrency(w.totalPnL * w.fxRate, baseCurr)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="font-mono text-[13px] opacity-70">{t("analytics.noWinners") || "No positive contributors yet."}</p>
          )}
        </div>
        
        <div className="rounded-lg border-2 border-[var(--border)] bg-[var(--panel)] p-5 shadow-[8px_8px_0_var(--shadow)]">
          <h2 className="text-xl font-black mb-4 text-red-500">{t("analytics.topLosers") || "Top Losers"}</h2>
          {losers.length > 0 ? (
            <div className="space-y-3">
              {losers.slice(0, 5).map(l => (
                <div key={l.asset} className="flex justify-between items-center border-b border-[var(--border)] pb-2 font-mono text-[13px] font-bold">
                  <span>{l.asset}</span>
                  <span className="text-red-500">{formatCurrency(l.totalPnL * l.fxRate, baseCurr)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="font-mono text-[13px] opacity-70">{t("analytics.noLosers") || "No negative contributors yet."}</p>
          )}
        </div>
      </section>
    </div>
  );
}
