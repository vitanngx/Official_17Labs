import { createHash } from "node:crypto";
import { fetchFxRate, fetchLatestPrice, fetchPriceHistory, MarketHistoryPoint } from "@/lib/marketData";
import { getMarketCache, setMarketCache } from "@/lib/realityDb";
import {
  CashBalanceReality,
  HoldingReality,
  PortfolioRealityPayload,
  PortfolioTransaction,
  RiskMetrics
} from "@/types/reality";

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
const RISK_METRICS_TTL_MS = 24 * 60 * 60 * 1000;
const RISK_METRICS_CACHE_VERSION = 4;
const RISK_LOOKBACK_YEARS = 5;

interface PositionState {
  asset: string;
  amount: number;
  costBasis: number;
  currency: string;
}

export async function buildPortfolioReality(
  transactions: PortfolioTransaction[],
  baseCurrency: string
): Promise<PortfolioRealityPayload> {
  const warnings: string[] = [];
  const positions = new Map<string, PositionState>();
  const cashBalances = new Map<string, number>();

  for (const transaction of transactions) {
    const position = positions.get(transaction.asset) ?? {
      asset: transaction.asset,
      amount: 0,
      costBasis: 0,
      currency: transaction.currency
    };
    const gross = transaction.amount * transaction.price;
    const fees = transaction.fees ?? 0;

    if (transaction.type === "BUY") {
      position.amount += transaction.amount;
      position.costBasis += gross + fees;
      positions.set(transaction.asset, position);
      adjustCash(cashBalances, transaction.currency, -(gross + fees));
      continue;
    }

    if (transaction.type === "SELL") {
      const sellAmount = Math.min(position.amount, transaction.amount);
      const averageCost = position.amount > 0 ? position.costBasis / position.amount : 0;
      position.amount -= sellAmount;
      position.costBasis = Math.max(0, position.costBasis - averageCost * sellAmount);
      positions.set(transaction.asset, position);
      adjustCash(cashBalances, transaction.currency, sellAmount * transaction.price - fees);
      continue;
    }

    if (transaction.type === "CASH_IN") {
      adjustCash(cashBalances, transaction.currency, gross - fees);
      continue;
    }

    if (transaction.type === "CASH_OUT") {
      adjustCash(cashBalances, transaction.currency, -(gross + fees));
      continue;
    }

    if (transaction.type === "DIVIDEND") {
      adjustCash(cashBalances, transaction.currency, gross - fees);
      continue;
    }

    if (transaction.type === "TRANSFER" && isCashTransfer(transaction)) {
      adjustCash(cashBalances, transaction.currency, gross - fees);
      continue;
    }

    position.amount += transaction.amount;
    position.costBasis += gross + fees;
    positions.set(transaction.asset, position);
  }

  const holdings = await Promise.all(
    [...positions.values()]
      .filter((position) => position.amount > 0)
      .map(async (position) => buildHolding(position, baseCurrency, warnings))
  );

  const cash = await buildCashBalances(cashBalances, baseCurrency, warnings);
  const holdingsValueBase = holdings.reduce((sum, holding) => sum + holding.marketValueBase, 0);
  const deployableCashValueBase = cash.reduce(
    (sum, balance) => sum + Math.max(0, balance.valueBase),
    0
  );
  const totalValueBase = holdingsValueBase + deployableCashValueBase;

  holdings.forEach((holding) => {
    holding.weightPct = totalValueBase > 0 ? (holding.marketValueBase / totalValueBase) * 100 : 0;
  });
  cash.forEach((balance) => {
    balance.weightPct =
      totalValueBase > 0 && balance.valueBase > 0
        ? (balance.valueBase / totalValueBase) * 100
        : 0;
  });
  const riskMetrics = await buildRiskMetrics(transactions, holdings, baseCurrency, warnings);

  return {
    ok: true,
    baseCurrency,
    totalValueBase,
    holdings: holdings.sort((left, right) => right.marketValueBase - left.marketValueBase),
    cashBalances: cash,
    currentWeights: buildCurrentWeights(holdings, cash),
    riskMetrics,
    warnings
  };
}

async function buildHolding(
  position: PositionState,
  baseCurrency: string,
  warnings: string[]
): Promise<HoldingReality> {
  const averageCost = position.amount > 0 ? position.costBasis / position.amount : 0;
  const [quoteResult, fxResult] = await Promise.allSettled([
    fetchLatestPrice(position.asset),
    fetchFxRate(position.currency, baseCurrency)
  ]);
  let currentPrice = averageCost;
  let fxRate = 1;

  if (quoteResult.status === "fulfilled") {
    currentPrice = quoteResult.value.price;
  } else {
    warnings.push(`${position.asset}: live quote unavailable, using average cost.`);
  }

  if (fxResult.status === "fulfilled") {
    fxRate = fxResult.value;
  } else {
    warnings.push(`${position.currency}/${baseCurrency}: FX unavailable, using 1.0.`);
  }

  return {
    asset: position.asset,
    amount: position.amount,
    averageCost,
    currency: position.currency,
    currentPrice,
    fxRate,
    marketValueBase: position.amount * currentPrice * fxRate,
    weightPct: 0
  };
}

async function buildRiskMetrics(
  transactions: PortfolioTransaction[],
  holdings: HoldingReality[],
  baseCurrency: string,
  warnings: string[]
): Promise<RiskMetrics> {
  if (transactions.length === 0 || holdings.length === 0) {
    return emptyRiskMetrics();
  }

  const cached = getCachedRiskMetrics(transactions, baseCurrency);
  if (cached) {
    return cached;
  }

  const activeAssets = new Set(holdings.map((holding) => holding.asset));
  const holdingByAsset = new Map(holdings.map((holding) => [holding.asset, holding]));
  const histories = new Map<string, MarketHistoryPoint[]>();
  const historyResults = await Promise.allSettled(
    holdings.map(async (holding) => ({
      asset: holding.asset,
      history: await fetchPriceHistory(holding.asset, "5y", "1d")
    }))
  );
  for (const result of historyResults) {
    if (result.status === "fulfilled") {
      const { asset, history } = result.value;
      if (history.length > 1) {
        histories.set(asset, history);
      }
    } else {
      warnings.push("Historical prices unavailable for one asset in risk metrics.");
    }
  }

  const dates = collectRiskDates(histories, transactions);
  if (dates.length < 3) {
    const fallbackMetrics = calculateRiskMetrics(
      buildCurrentHoldingsNavSeries(holdings, histories)
    );
    const metrics = fallbackMetrics ?? emptyRiskMetrics(dates.length);
    setCachedRiskMetrics(transactions, baseCurrency, metrics);
    return metrics;
  }

  const transactionsByDate = new Map<string, PortfolioTransaction[]>();
  for (const transaction of transactions) {
    const bucket = transactionsByDate.get(transaction.date) ?? [];
    bucket.push(transaction);
    transactionsByDate.set(transaction.date, bucket);
  }

  const positions = new Map<string, number>();
  const cashBalances = new Map<string, number>();
  const navSeries: Array<{ date: string; value: number }> = [];

  for (const date of dates) {
    const dayTransactions = transactionsByDate.get(date) ?? [];
    for (const transaction of dayTransactions) {
      applyTransactionToRiskState(transaction, positions, cashBalances, activeAssets);
    }

    let totalValue = 0;
    for (const [asset, amount] of positions.entries()) {
      if (amount <= 0) {
        continue;
      }

      const holding = holdingByAsset.get(asset);
      if (!holding) {
        continue;
      }

      totalValue +=
        amount *
        findHistoryPriceAtDate(date, histories.get(asset) ?? [], holding.currentPrice) *
        holding.fxRate;
    }

    for (const [currency, amount] of cashBalances.entries()) {
      totalValue += amount * getStaticFxRate(currency, baseCurrency, holdings);
    }

    navSeries.push({ date, value: totalValue });
  }

  const replayMetrics = calculateRiskMetrics(navSeries);
  const metrics =
    replayMetrics ?? calculateRiskMetrics(buildCurrentHoldingsNavSeries(holdings, histories));

  if (!metrics) {
    const empty = emptyRiskMetrics(navSeries.length);
    setCachedRiskMetrics(transactions, baseCurrency, empty);
    return empty;
  }

  setCachedRiskMetrics(transactions, baseCurrency, metrics);
  return metrics;
}

function buildCurrentHoldingsNavSeries(
  holdings: HoldingReality[],
  histories: Map<string, MarketHistoryPoint[]>
) {
  const dates = collectHistoryDates(histories);

  return dates.map((date) => ({
    date,
    value: holdings.reduce(
      (sum, holding) =>
        sum +
        holding.amount *
          findHistoryPriceAtDate(date, histories.get(holding.asset) ?? [], holding.currentPrice) *
          holding.fxRate,
      0
    )
  }));
}

function calculateRiskMetrics(navSeries: Array<{ date: string; value: number }>): RiskMetrics | null {
  const cleanNavSeries = navSeries
    .filter((point) => Number.isFinite(point.value) && point.value > 0)
    .sort((left, right) => left.date.localeCompare(right.date));

  if (cleanNavSeries.length < 3) {
    return null;
  }

  const returns: number[] = [];
  for (let index = 1; index < cleanNavSeries.length; index += 1) {
    const previous = cleanNavSeries[index - 1].value;
    const current = cleanNavSeries[index].value;
    if (previous > 0 && current > 0) {
      returns.push(current / previous - 1);
    }
  }

  if (returns.length < 2) {
    return null;
  }

  const mean = average(returns);
  const dailyStdDev = standardDeviation(returns);
  const annualizedReturn = mean * 252;
  const annualizedVolatility = dailyStdDev * Math.sqrt(252);
  const sharpeRatio =
    annualizedVolatility > 0 ? (annualizedReturn - 0.05) / annualizedVolatility : null;

  return {
    currentVolatility: annualizedVolatility * 100,
    sharpeRatio,
    maxDrawdownPct: computeMaxDrawdown(cleanNavSeries),
    observationCount: cleanNavSeries.length
  };
}

async function buildCashBalances(
  balances: Map<string, number>,
  baseCurrency: string,
  warnings: string[]
): Promise<CashBalanceReality[]> {
  const output = await Promise.all(
    [...balances.entries()]
      .filter(([, amount]) => Math.abs(amount) >= 0.000001)
      .map(async ([currency, amount]) => {
        let fxRate = 1;
        try {
          fxRate = await fetchFxRate(currency, baseCurrency);
        } catch {
          warnings.push(`${currency}/${baseCurrency}: FX unavailable, using 1.0.`);
        }

        if (amount < 0) {
          warnings.push(
            `${currency}: negative cash balance. Add a CASH_IN transaction if this purchase was funded by deposited cash.`
          );
        }

        return {
          currency,
          amount,
          fxRate,
          valueBase: amount * fxRate,
          weightPct: 0
        };
      })
  );

  return output.sort((left, right) => right.valueBase - left.valueBase);
}

function getCachedRiskMetrics(
  transactions: PortfolioTransaction[],
  baseCurrency: string
) {
  const cached = getMarketCache<RiskMetrics>(riskMetricsCacheKey(transactions, baseCurrency));
  if (!cached) {
    return null;
  }

  const age = Date.now() - new Date(cached.updatedAt).getTime();
  return Number.isFinite(age) && age <= RISK_METRICS_TTL_MS ? cached.payload : null;
}

function setCachedRiskMetrics(
  transactions: PortfolioTransaction[],
  baseCurrency: string,
  metrics: RiskMetrics
) {
  setMarketCache(riskMetricsCacheKey(transactions, baseCurrency), metrics);
}

function riskMetricsCacheKey(
  transactions: PortfolioTransaction[],
  baseCurrency: string
) {
  const hash = createHash("sha256")
    .update(JSON.stringify({ transactions, baseCurrency }))
    .digest("hex")
    .slice(0, 24);

  return `risk:v${RISK_METRICS_CACHE_VERSION}:${baseCurrency}:${hash}`;
}

function buildCurrentWeights(holdings: HoldingReality[], cash: CashBalanceReality[]) {
  return [
    ...holdings.map((holding) => ({
      name: holding.asset,
      value: holding.marketValueBase,
      weightPct: holding.weightPct
    })),
    ...cash
      .filter((balance) => balance.valueBase > 0)
      .map((balance) => ({
        name: `${balance.currency} Cash`,
        value: balance.valueBase,
        weightPct: balance.weightPct
      }))
  ]
    .filter((slice) => Math.abs(slice.value) > 0.000001)
    .sort((left, right) => right.value - left.value)
    .map((slice, index) => ({
      ...slice,
      color: COLORS[index % COLORS.length]
    }));
}

function adjustCash(balances: Map<string, number>, currency: string, delta: number) {
  balances.set(currency, (balances.get(currency) ?? 0) + delta);
}

function fundNegativeCashBalance(balances: Map<string, number>, currency: string) {
  const balance = balances.get(currency) ?? 0;
  if (balance < 0) {
    balances.set(currency, 0);
  }
}

function isCashTransfer(transaction: PortfolioTransaction) {
  return ["USD", "EUR", "VND", "CASH"].includes(transaction.asset.toUpperCase());
}

function collectRiskDates(
  histories: Map<string, MarketHistoryPoint[]>,
  transactions: PortfolioTransaction[]
) {
  const dates = new Set<string>();

  for (const history of histories.values()) {
    history.forEach((point) => dates.add(point.date));
  }

  for (const transaction of transactions) {
    dates.add(transaction.date);
  }

  const lookbackStart = new Date();
  lookbackStart.setFullYear(lookbackStart.getFullYear() - RISK_LOOKBACK_YEARS);
  const minDate = lookbackStart.toISOString().slice(0, 10);

  return [...dates]
    .filter((date) => date >= minDate)
    .sort((left, right) => left.localeCompare(right));
}

function collectHistoryDates(histories: Map<string, MarketHistoryPoint[]>) {
  const dates = new Set<string>();

  for (const history of histories.values()) {
    history.forEach((point) => dates.add(point.date));
  }

  return [...dates].sort((left, right) => left.localeCompare(right));
}

function applyTransactionToRiskState(
  transaction: PortfolioTransaction,
  positions: Map<string, number>,
  cashBalances: Map<string, number>,
  activeAssets: Set<string>
) {
  const gross = transaction.amount * transaction.price;
  const fees = transaction.fees ?? 0;

  if (transaction.type === "BUY") {
    positions.set(transaction.asset, (positions.get(transaction.asset) ?? 0) + transaction.amount);
    adjustCash(cashBalances, transaction.currency, -(gross + fees));
    fundNegativeCashBalance(cashBalances, transaction.currency);
    return;
  }

  if (transaction.type === "SELL") {
    positions.set(
      transaction.asset,
      Math.max(0, (positions.get(transaction.asset) ?? 0) - transaction.amount)
    );
    adjustCash(cashBalances, transaction.currency, gross - fees);
    return;
  }

  if (transaction.type === "CASH_IN") {
    adjustCash(cashBalances, transaction.currency, gross - fees);
    return;
  }

  if (transaction.type === "CASH_OUT") {
    adjustCash(cashBalances, transaction.currency, -(gross + fees));
    return;
  }

  if (transaction.type === "DIVIDEND") {
    adjustCash(cashBalances, transaction.currency, gross - fees);
    return;
  }

  if (transaction.type === "TRANSFER" && activeAssets.has(transaction.asset)) {
    positions.set(transaction.asset, (positions.get(transaction.asset) ?? 0) + transaction.amount);
    return;
  }

  if (transaction.type === "TRANSFER") {
    adjustCash(cashBalances, transaction.currency, gross - fees);
  }
}

function findHistoryPriceAtDate(
  date: string,
  history: MarketHistoryPoint[],
  fallbackPrice: number
) {
  if (history.length === 0) {
    return fallbackPrice;
  }

  let current = history[0].close;
  for (const point of history) {
    if (point.date > date) {
      return current;
    }
    current = point.close;
  }

  return current;
}

function getStaticFxRate(
  currency: string,
  baseCurrency: string,
  holdings: HoldingReality[]
) {
  if (currency.toUpperCase() === baseCurrency.toUpperCase()) {
    return 1;
  }

  return holdings.find((holding) => holding.currency === currency)?.fxRate ?? 1;
}

function emptyRiskMetrics(observationCount = 0): RiskMetrics {
  return {
    currentVolatility: null,
    sharpeRatio: null,
    maxDrawdownPct: null,
    observationCount
  };
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  const mean = average(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, values.length - 1);

  return Math.sqrt(variance);
}

function computeMaxDrawdown(series: Array<{ value: number }>) {
  let peak = series[0]?.value ?? 0;
  let maxDrawdown = 0;

  for (const point of series) {
    if (point.value > peak) {
      peak = point.value;
    }

    if (peak > 0) {
      maxDrawdown = Math.min(maxDrawdown, ((point.value - peak) / peak) * 100);
    }
  }

  return maxDrawdown;
}
