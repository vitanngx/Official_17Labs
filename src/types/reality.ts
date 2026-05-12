export type TransactionType = "BUY" | "SELL" | "TRANSFER" | "CASH_IN" | "CASH_OUT" | "DIVIDEND";

export interface PortfolioTransaction {
  id: string;
  type: TransactionType;
  date: string;
  asset: string;
  amount: number;
  price: number;
  fees: number;
  currency: string;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type TransactionInput = Omit<PortfolioTransaction, "id" | "createdAt">;

export interface HoldingReality {
  asset: string;
  amount: number;
  averageCost: number;
  currency: string;
  currentPrice: number;
  fxRate: number;
  marketValueBase: number;
  weightPct: number;
}

export interface AllocationSlice {
  name: string;
  value: number;
  weightPct: number;
  color: string;
}

export interface CashBalanceReality {
  currency: string;
  amount: number;
  fxRate: number;
  valueBase: number;
  weightPct: number;
}

export interface RebalanceRow {
  asset: string;
  currentWeight: number;
  targetWeight: number;
  currentValueBase: number;
  targetValueBase: number;
  deltaValueBase: number;
  estimatedUnits: number | null;
  action: "BUY" | "SELL" | "HOLD";
}

export interface RiskMetrics {
  currentVolatility: number | null;
  sharpeRatio: number | null;
  maxDrawdownPct: number | null;
  observationCount: number;
}

export interface PortfolioRealityPayload {
  ok: boolean;
  baseCurrency: string;
  totalValueBase: number;
  holdings: HoldingReality[];
  cashBalances: CashBalanceReality[];
  currentWeights: AllocationSlice[];
  riskMetrics: RiskMetrics;
  warnings: string[];
}

export interface OptimizationRun {
  id: string;
  createdAt: string;
  config: unknown;
  result: unknown;
}
