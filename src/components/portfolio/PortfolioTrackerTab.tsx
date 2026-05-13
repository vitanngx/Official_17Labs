"use client";

import { useTranslation } from "@/i18n";

import { motion } from "framer-motion";
import React from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip
} from "recharts";
import {
  AllocationSlice,
  PortfolioRealityPayload,
  PortfolioTransaction,
  RebalanceRow,
  TransactionInput,
  TransactionType
} from "@/types/reality";

interface PortfolioTrackerTabProps {
  onNotify?: (message: string, tone?: "error" | "success" | "info") => void;
  optimizedWeights: Record<string, number>;
}

const TRANSACTION_TYPES: TransactionType[] = [
  "BUY",
  "SELL",
  "TRANSFER",
  "CASH_IN",
  "CASH_OUT",
  "DIVIDEND"
];
const COLORS = [
  "#F97316",
  "#06B6D4",
  "#8B5CF6",
  "#22C55E",
  "#EF4444",
  "#EAB308",
  "#EC4899",
  "#14B8A6",
  "#3B82F6",
  "#A3E635",
  "#F43F5E",
  "#F59E0B",
  "#84CC16",
  "#D946EF",
  "#10B981",
  "#60A5FA",
  "#FB7185",
  "#2DD4BF",
  "#C084FC",
  "#FACC15",
  "#4ADE80",
  "#38BDF8",
  "#FB923C",
  "#A78BFA"
];
const FIELD_CLASS =
  "h-12 w-full rounded border-2 border-[var(--border)] bg-[var(--panel-soft)] px-3 text-[15px] font-bold outline-none focus:shadow-[0_0_0_3px_var(--primary)]";

export default function PortfolioTrackerTab({
  onNotify,
  optimizedWeights
}: PortfolioTrackerTabProps) {
  const { t } = useTranslation();
  const [baseCurrency, setBaseCurrency] = React.useState("USD");
  const [transactions, setTransactions] = React.useState<PortfolioTransaction[]>([]);
  const [reality, setReality] = React.useState<PortfolioRealityPayload | null>(null);
  const [draft, setDraft] = React.useState(createDraft());
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const holdingsValueBase = React.useMemo(
    () => (reality?.holdings ?? []).reduce((sum, holding) => sum + holding.marketValueBase, 0),
    [reality]
  );
  const cashValueBase = React.useMemo(
    () => (reality?.cashBalances ?? []).reduce((sum, balance) => sum + balance.valueBase, 0),
    [reality]
  );
  const capitalInvestedBase = React.useMemo(
    () =>
      (reality?.holdings ?? []).reduce(
        (sum, holding) => sum + holding.averageCost * holding.amount * holding.fxRate,
        0
      ),
    [reality]
  );

  const optimizedSlices = React.useMemo(() => {
    const total = reality?.totalValueBase ?? 1;

    return Object.entries(optimizedWeights)
      .map(([asset, weight], index) => ({
        name: asset,
        value: weight * total,
        weightPct: weight * 100,
        color: COLORS[index % COLORS.length]
      }))
      .filter((slice) => slice.weightPct > 0.01)
      .sort((left, right) => right.weightPct - left.weightPct);
  }, [optimizedWeights, reality?.totalValueBase]);

  const rebalanceRows = React.useMemo(
    () => buildRebalanceRows(reality, optimizedWeights),
    [reality, optimizedWeights]
  );
  const actualPriceByAsset = React.useMemo(
    () =>
      new Map(
        (reality?.holdings ?? []).map((holding) => [
          holding.asset,
          {
            currency: holding.currency,
            price: holding.currentPrice
          }
        ])
      ),
    [reality]
  );
  const healthScore = React.useMemo(
    () => calculateHealthScore(reality, optimizedWeights),
    [reality, optimizedWeights]
  );

  React.useEffect(() => {
    void refresh();
  }, [baseCurrency]);

  async function refresh() {
    setLoading(true);
    setError(null);

    try {
      const [transactionsResponse, realityResponse] = await Promise.all([
        fetch("/api/portfolio/transactions", { cache: "no-store" }),
        fetch(`/api/portfolio/reality?baseCurrency=${baseCurrency}`, { cache: "no-store" })
      ]);
      const transactionsPayload = (await transactionsResponse.json()) as {
        ok: boolean;
        transactions?: PortfolioTransaction[];
        error?: string;
      };
      const realityPayload = (await realityResponse.json()) as PortfolioRealityPayload & {
        error?: string;
      };

      if (!transactionsResponse.ok || !transactionsPayload.ok) {
        throw new Error(transactionsPayload.error ?? "Unable to load transactions.");
      }

      if (!realityResponse.ok || !realityPayload.ok) {
        throw new Error(realityPayload.error ?? "Unable to load portfolio reality.");
      }

      setTransactions(transactionsPayload.transactions ?? []);
      setReality(realityPayload);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Unable to load portfolio.";
      setError(message);
      onNotify?.(message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function submitTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const input: TransactionInput = {
      type: draft.type,
      date: draft.date,
      asset: draft.asset,
      amount: Number(draft.amount),
      price: Number(draft.price),
      fees: Number(draft.fees || "0"),
      note: draft.note,
      currency: draft.currency
    };

    const response = await fetch(
      editingId ? `/api/portfolio/transactions?id=${editingId}` : "/api/portfolio/transactions",
      {
      method: editingId ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
      }
    );
    const payload = (await response.json()) as { ok: boolean; error?: string };

    if (!response.ok || !payload.ok) {
      const message = payload.error ?? "Unable to save transaction.";
      setError(message);
      onNotify?.(message, "error");
      return;
    }

    setDraft(createDraft());
    setEditingId(null);
    await refresh();
    onNotify?.(editingId ? t("reality.toast.updated") : t("reality.toast.added"), "success");
  }

  function startEdit(transaction: PortfolioTransaction) {
    setEditingId(transaction.id);
    setDraft({
      type: transaction.type,
      date: transaction.date,
      asset: transaction.asset,
      amount: String(transaction.amount),
      price: String(transaction.price),
      fees: String(transaction.fees ?? 0),
      currency: transaction.currency,
      note: transaction.note ?? ""
    });
  }

  async function deleteRow(id: string) {
    const response = await fetch(`/api/portfolio/transactions?id=${id}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      onNotify?.(t("reality.toast.deleteError") || "Delete failed.", "error");
      return;
    }

    await refresh();
    onNotify?.(t("reality.toast.deleted") || "Deleted.", "success");
  }

  return (
    <section className="min-h-screen bg-[var(--panel-soft)] px-4 py-6 text-[var(--text)] md:px-8">
      <div className="mx-auto grid max-w-[1480px] gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="rounded-lg border-2 border-[var(--border)] bg-[var(--panel)] p-5 shadow-[8px_8px_0_var(--shadow)]">
          <p className="font-mono text-[13px] font-bold uppercase tracking-wide text-[var(--secondary)]">
            {t("reality.tab")}
          </p>
          <h1 className="mt-3 text-[35px] font-black leading-tight">{t("reality.title")}</h1>

          <label className="mt-6 block">
            <span className="mb-2 block font-mono text-[13px] font-bold uppercase">
              {t("reality.baseCurrency")}
            </span>
            <select
              className="h-12 w-full rounded border-2 border-[var(--border)] bg-[var(--panel-soft)] px-3 text-[15px] font-bold outline-none focus:shadow-[0_0_0_3px_var(--primary)]"
              value={baseCurrency}
              onChange={(event) => setBaseCurrency(event.target.value)}
            >
              {["USD", "VND", "EUR"].map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>

          <form className="mt-6 space-y-4" onSubmit={submitTransaction}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("reality.type")}>
                <select
                  className={FIELD_CLASS}
                  value={draft.type}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      type: event.target.value as TransactionType
                    }))
                  }
                >
                  {TRANSACTION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("reality.date")}>
                <input
                  className={FIELD_CLASS}
                  type="date"
                  value={draft.date}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, date: event.target.value }))
                  }
                />
              </Field>
              <Field label={t("reality.asset")}>
                <input
                  className={`${FIELD_CLASS} font-mono uppercase`}
                  value={draft.asset}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, asset: event.target.value }))
                  }
                />
              </Field>
              <Field label={t("reality.currency")}>
                <input
                  className={`${FIELD_CLASS} font-mono uppercase`}
                  value={draft.currency}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, currency: event.target.value }))
                  }
                />
              </Field>
              <Field label={t("reality.amount")}>
                <input
                  className={`${FIELD_CLASS} font-mono`}
                  min="0"
                  step="0.000001"
                  type="number"
                  value={draft.amount}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, amount: event.target.value }))
                  }
                />
              </Field>
              <Field label={t("reality.price")}>
                <input
                  className={`${FIELD_CLASS} font-mono`}
                  min="0"
                  step="0.0001"
                  type="number"
                  value={draft.price}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, price: event.target.value }))
                  }
                />
              </Field>
              <Field label={t("reality.fees")}>
                <input
                  className={`${FIELD_CLASS} font-mono`}
                  min="0"
                  step="0.0001"
                  type="number"
                  value={draft.fees}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, fees: event.target.value }))
                  }
                />
              </Field>
              <Field label={t("reality.note")}>
                <input
                  className={FIELD_CLASS}
                  value={draft.note}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, note: event.target.value }))
                  }
                />
              </Field>
            </div>

            <div className="flex gap-3">
              {editingId ? (
                <button
                  className="h-12 flex-1 rounded border-2 border-[var(--border)] bg-[var(--panel)] px-4 font-mono text-[13px] font-black uppercase shadow-[5px_5px_0_var(--shadow)]"
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setDraft(createDraft());
                  }}
                >
                  Cancel
                </button>
              ) : null}
              <button
                className="h-12 flex-1 rounded border-2 border-[var(--border)] bg-[var(--primary)] text-[#1C293C] px-4 font-mono text-[13px] font-black uppercase shadow-[5px_5px_0_var(--shadow)] active:translate-x-1 active:translate-y-1 active:shadow-none"
                type="submit"
              >
                {editingId ? t("reality.updateTransaction") : t("reality.addTransaction")}
              </button>
            </div>
          </form>

          {error ? (
            <div className="mt-5 rounded border-2 border-[var(--danger)] bg-[var(--panel)] p-3 text-[15px] font-bold text-[var(--danger)]">
              {error}
            </div>
          ) : null}

          <div className="mt-5 rounded border-2 border-[var(--border)] bg-[var(--primary)] text-[#1C293C] p-3">
            <p className="font-mono text-[13px] font-bold uppercase">{t("reality.holdingsValue")}</p>
            <p className="mt-1 text-[27px] font-black">
              {formatMoney(holdingsValueBase, baseCurrency)}
            </p>
          </div>

          <div className="mt-3 rounded border-2 border-[var(--border)] bg-[var(--panel-soft)] p-3">
            <p className="font-mono text-[13px] font-bold uppercase">{t("reality.capitalInvested")}</p>
            <p className="mt-1 text-[27px] font-black">
              {formatMoney(capitalInvestedBase, baseCurrency)}
            </p>
            <p className="mt-1 text-xs font-bold text-[var(--muted)]">
              {t("reality.capitalNote", { cash: formatMoney(cashValueBase, baseCurrency) })}
            </p>
          </div>
        </aside>

        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <RiskMetricCard label={t("reality.volatility")} value={formatNullablePercent(reality?.riskMetrics.currentVolatility)} detail={t("reality.observations", { count: String(reality?.riskMetrics.observationCount ?? 0) })} />
            <RiskMetricCard label={t("reality.maxDrawdown")} value={formatNullablePercent(reality?.riskMetrics.maxDrawdownPct)} tone="danger" detail={t("reality.historicalEstimate")} />
            <RiskMetricCard label={t("reality.sharpeRatio")} value={formatNullableNumber(reality?.riskMetrics.sharpeRatio)} detail={t("reality.rfAnnualized")} />
            <RiskMetricCard label={t("reality.healthScore")} value={healthScore === null ? "N/A" : `${healthScore}/100`} tone={healthScore === null || healthScore >= 75 ? "success" : healthScore >= 50 ? "warning" : "danger"} detail={t("reality.vsTarget")} />
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <PiePanel title={t("reality.currentWeights")} data={reality?.currentWeights ?? []} emptyLabel={t("reality.noAllocation")} />
            <PiePanel title={t("reality.optimizedWeights")} data={optimizedSlices} emptyLabel={t("reality.noAllocation")} />
          </section>

          <section className="rounded-lg border-2 border-[var(--border)] bg-[var(--panel)] p-5 shadow-[8px_8px_0_var(--shadow)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[13px] font-bold uppercase text-[var(--secondary)]">
                  {t("reality.followUp")}
                </p>
                <h2 className="mt-1 text-[27px] font-black">{t("reality.rebalanceDelta")}</h2>
              </div>
              <button
                className="rounded border-2 border-[var(--border)] bg-[var(--panel)] px-4 py-2 font-mono text-[13px] font-black uppercase shadow-[4px_4px_0_var(--shadow)]"
                disabled={loading}
                type="button"
                onClick={() => void refresh()}
              >
                {loading ? t("reality.loading") : t("reality.refresh")}
              </button>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b-2 border-[var(--border)] font-mono text-[13px] uppercase">
                    <th className="py-3">{t("reality.rebalanceAsset")}</th>
                    <th className="py-3">{t("reality.rebalanceCurrent")}</th>
                    <th className="py-3">{t("reality.rebalanceTarget")}</th>
                    <th className="py-3">{t("reality.rebalanceDeltaCol")}</th>
                    <th className="py-3">{t("reality.rebalanceUnits")}</th>
                    <th className="py-3">{t("reality.rebalanceAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rebalanceRows.length ? (
                    rebalanceRows.map((row) => (
                      <tr key={row.asset} className="border-b-2 border-[var(--border)]">
                        <td className="py-3 font-mono text-[15px] font-black">{row.asset}</td>
                        <td className="py-3">{row.currentWeight.toFixed(2)}%</td>
                        <td className="py-3">{row.targetWeight.toFixed(2)}%</td>
                        <td className={row.deltaValueBase >= 0 ? "py-3 text-[var(--success)]" : "py-3 text-[var(--danger)]"}>
                          {formatMoney(row.deltaValueBase, baseCurrency)}
                        </td>
                        <td className="py-3 font-mono">
                          {row.estimatedUnits === null ? "-" : Math.abs(row.estimatedUnits).toFixed(6)}
                        </td>
                        <td className="py-3">
                          <span className="rounded border-2 border-[var(--border)] bg-[var(--primary)] text-[#1C293C] px-3 py-1 font-mono text-[13px] font-black">
                            {row.action}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="py-8 text-center font-mono text-[15px] font-bold" colSpan={6}>
                        {t("reality.rebalanceEmpty")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border-2 border-[var(--border)] bg-[var(--panel)] p-5 shadow-[8px_8px_0_var(--shadow)]">
            <p className="font-mono text-[13px] font-bold uppercase text-[var(--secondary)]">
              {t("reality.ledger")}
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-left">
                <thead>
                  <tr className="border-b-2 border-[var(--border)] align-top">
                    <LedgerHeader label={t("reality.date")} />
                    <LedgerHeader label={t("reality.type")} />
                    <LedgerHeader label={t("reality.asset")} />
                    <LedgerHeader label={t("reality.amount")} />
                    <LedgerHeader label={t("reality.costPrice")} />
                    <LedgerHeader label={t("reality.actualPrice")} />
                    <LedgerHeader label={t("reality.pctChange")} />
                    <LedgerHeader label={t("reality.pnl")} />
                    <th className="py-3 text-right"><span className="block font-mono text-[13px] font-black uppercase">{t("reality.actions")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id} className="border-b-2 border-[var(--border)]">
                      <td className="py-3 font-mono">{transaction.date}</td>
                      <td className="py-3 font-black">{transaction.type}</td>
                      <td className="py-3 font-mono">{transaction.asset}</td>
                      <td className="py-3">{transaction.amount}</td>
                      <td className="py-3">{formatMoney(transaction.price, transaction.currency)}</td>
                      <td className="py-3">
                        {formatActualPrice(transaction.asset, actualPriceByAsset)}
                      </td>
                      <td className={getChangeToneClass(getTransactionChangePct(transaction, actualPriceByAsset))}>
                        {formatPercent(getTransactionChangePct(transaction, actualPriceByAsset))}
                      </td>
                      <td className={getChangeToneClass(getTransactionPnl(transaction, actualPriceByAsset))}>
                        {formatTransactionPnl(transaction, actualPriceByAsset)}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          className="mr-2 rounded border-2 border-[var(--border)] px-3 py-1 font-mono text-[13px] font-black"
                          type="button"
                          onClick={() => startEdit(transaction)}
                        >
                          Edit
                        </button>
                        <button
                          className="rounded border-2 border-[var(--border)] px-3 py-1 font-mono text-[13px] font-black text-[var(--danger)]"
                          type="button"
                          onClick={() => void deleteRow(transaction.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 ? (
                    <tr>
                      <td className="py-8 text-center font-mono text-[15px] font-bold" colSpan={9}>
                        {t("reality.noTransactions")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function LedgerHeader({ label }: { label: string }) {
  return (
    <th className="py-3 pr-4">
      <span className="block font-mono text-[13px] font-black uppercase">{label}</span>
    </th>
  );
}

function RiskMetricCard({
  label,
  value,
  detail,
  tone = "neutral"
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "bg-[var(--panel)]",
    success: "bg-[var(--success)] text-[#ffffff]",
    warning: "bg-[var(--primary)] text-[#1C293C]",
    danger: "bg-[var(--danger)] text-[#ffffff]"
  }[tone];

  return (
    <section className={`rounded-lg border-2 border-[var(--border)] p-4 shadow-[6px_6px_0_var(--shadow)] ${toneClass}`}>
      <p className="font-mono text-[13px] font-bold uppercase">{label}</p>
      <p className="mt-3 text-[27px] font-black">{value}</p>
      <p className="mt-2 text-[13px] font-bold opacity-80">{detail}</p>
    </section>
  );
}

function PiePanel({ title, data, emptyLabel }: { title: string; data: AllocationSlice[]; emptyLabel: string }) {
  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border-2 border-[var(--border)] bg-[var(--panel)] p-5 shadow-[8px_8px_0_var(--shadow)]"
      initial={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      <p className="font-mono text-[13px] font-bold uppercase text-[var(--secondary)]">{title}</p>
      <motion.div
        key={`${title}-${data.map((slice) => `${slice.name}:${slice.weightPct.toFixed(2)}`).join("|")}`}
        animate={{ opacity: 1, scale: 1 }}
        className="mt-4 h-[320px] rounded border-2 border-[var(--border)] bg-[var(--panel-soft)]"
        initial={{ opacity: 0, scale: 0.985 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        {data.length ? (
          <ResponsiveContainer height="100%" width="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                innerRadius={58}
                nameKey="name"
                outerRadius={104}
                stroke="var(--border)"
                strokeWidth={2}
              >
                {data.map((entry) => (
                  <Cell fill={entry.color} key={entry.name} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, _name, item) => [
                  `${((item.payload as AllocationSlice).weightPct).toFixed(2)}%`,
                  item.name
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-center font-mono text-[15px] font-bold">
            {emptyLabel}
          </div>
        )}
      </motion.div>
    </motion.section>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[13px] font-bold uppercase">{label}</span>
      {children}
    </label>
  );
}

function calculateHealthScore(
  reality: PortfolioRealityPayload | null,
  optimizedWeights: Record<string, number>
) {
  if (!reality || Object.keys(optimizedWeights).length === 0) {
    return null;
  }

  const currentWeights = new Map(
    reality.holdings.map((holding) => [holding.asset, holding.weightPct])
  );
  const assets = new Set([
    ...reality.holdings.map((holding) => holding.asset),
    ...Object.keys(optimizedWeights)
  ]);
  const totalDeviation = [...assets].reduce((sum, asset) => {
    const current = currentWeights.get(asset) ?? 0;
    const target = (optimizedWeights[asset] ?? 0) * 100;

    return sum + Math.abs(current - target);
  }, 0);

  return Math.max(0, Math.round(100 - totalDeviation / 2));
}

function createDraft() {
  return {
    type: "BUY" as TransactionType,
    date: new Date().toISOString().slice(0, 10),
    asset: "AAPL",
    amount: "1",
    price: "100",
    fees: "0",
    currency: "USD",
    note: ""
  };
}

function buildRebalanceRows(
  reality: PortfolioRealityPayload | null,
  optimizedWeights: Record<string, number>
): RebalanceRow[] {
  if (!reality || reality.totalValueBase <= 0 || Object.keys(optimizedWeights).length === 0) {
    return [];
  }

  const currentByAsset = new Map(
    reality.holdings.map((holding) => [holding.asset, holding])
  );
  const assets = new Set([
    ...reality.holdings.map((holding) => holding.asset),
    ...Object.keys(optimizedWeights)
  ]);

  return [...assets]
    .map((asset) => {
      const holding = currentByAsset.get(asset);
      const currentValueBase = holding?.marketValueBase ?? 0;
      const targetWeight = (optimizedWeights[asset] ?? 0) * 100;
      const targetValueBase = ((optimizedWeights[asset] ?? 0) * reality.totalValueBase);
      const deltaValueBase = targetValueBase - currentValueBase;
      const unitPriceBase = holding ? holding.currentPrice * holding.fxRate : null;
      const estimatedUnits =
        unitPriceBase && unitPriceBase > 0 ? deltaValueBase / unitPriceBase : null;

      return {
        asset,
        currentWeight: reality.totalValueBase > 0 ? (currentValueBase / reality.totalValueBase) * 100 : 0,
        targetWeight,
        currentValueBase,
        targetValueBase,
        deltaValueBase,
        estimatedUnits,
        action: Math.abs(deltaValueBase) < reality.totalValueBase * 0.005
          ? "HOLD"
          : deltaValueBase > 0
            ? "BUY"
            : "SELL"
      } satisfies RebalanceRow;
    })
    .sort((left, right) => Math.abs(right.deltaValueBase) - Math.abs(left.deltaValueBase));
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "VND" ? 0 : 2
  }).format(value);
}

function formatActualPrice(
  asset: string,
  actualPriceByAsset: Map<string, { currency: string; price: number }>
) {
  const quote = actualPriceByAsset.get(asset);
  if (!quote) {
    return "-";
  }

  return formatMoney(quote.price, quote.currency);
}

function getTransactionChangePct(
  transaction: PortfolioTransaction,
  actualPriceByAsset: Map<string, { currency: string; price: number }>
) {
  const actual = actualPriceByAsset.get(transaction.asset)?.price;
  if (!actual || transaction.price <= 0) {
    return null;
  }

  return ((actual - transaction.price) / transaction.price) * 100;
}

function getTransactionPnl(
  transaction: PortfolioTransaction,
  actualPriceByAsset: Map<string, { currency: string; price: number }>
) {
  const actual = actualPriceByAsset.get(transaction.asset)?.price;
  if (actual === undefined) {
    return null;
  }

  return (actual - transaction.price) * transaction.amount - (transaction.fees ?? 0);
}

function formatPercent(value: number | null) {
  return value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatTransactionPnl(
  transaction: PortfolioTransaction,
  actualPriceByAsset: Map<string, { currency: string; price: number }>
) {
  const pnl = getTransactionPnl(transaction, actualPriceByAsset);
  if (pnl === null) {
    return "-";
  }

  return formatMoney(pnl, transaction.currency);
}

function getChangeToneClass(value: number | null) {
  if (value === null) {
    return "py-3";
  }

  return value >= 0 ? "py-3 text-[var(--success)]" : "py-3 text-[var(--danger)]";
}

function formatNullablePercent(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}%` : "N/A";
}

function formatNullableNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "N/A";
}
