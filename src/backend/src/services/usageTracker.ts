import { logger } from "../config/logger";

const MONTHLY_BUDGET_USD = parseFloat(process.env.MONTHLY_AI_BUDGET || "50");

// Cost per million tokens (Claude Sonnet)
const INPUT_COST_PER_M = 3.0;
const OUTPUT_COST_PER_M = 15.0;

interface MonthlyUsage {
  month: string;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
}

let currentUsage: MonthlyUsage = {
  month: getCurrentMonth(),
  inputTokens: 0,
  outputTokens: 0,
  requestCount: 0,
};

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7); // "2026-04"
}

function resetIfNewMonth() {
  const now = getCurrentMonth();
  if (currentUsage.month !== now) {
    logger.info("Resetting monthly AI usage tracker", { previousMonth: currentUsage.month, usage: getUsageSummary() });
    currentUsage = { month: now, inputTokens: 0, outputTokens: 0, requestCount: 0 };
  }
}

export function getEstimatedCost(): number {
  resetIfNewMonth();
  return (
    (currentUsage.inputTokens / 1_000_000) * INPUT_COST_PER_M +
    (currentUsage.outputTokens / 1_000_000) * OUTPUT_COST_PER_M
  );
}

export function isBudgetExceeded(): boolean {
  return getEstimatedCost() >= MONTHLY_BUDGET_USD;
}

export function getRemainingBudget(): number {
  return Math.max(0, MONTHLY_BUDGET_USD - getEstimatedCost());
}

export function trackUsage(inputTokens: number, outputTokens: number) {
  resetIfNewMonth();
  currentUsage.inputTokens += inputTokens;
  currentUsage.outputTokens += outputTokens;
  currentUsage.requestCount += 1;

  const cost = getEstimatedCost();
  if (cost >= MONTHLY_BUDGET_USD * 0.8) {
    logger.warn("AI budget usage at 80%+", { cost: cost.toFixed(2), budget: MONTHLY_BUDGET_USD });
  }
}

export function getUsageSummary() {
  resetIfNewMonth();
  return {
    month: currentUsage.month,
    inputTokens: currentUsage.inputTokens,
    outputTokens: currentUsage.outputTokens,
    requestCount: currentUsage.requestCount,
    estimatedCost: parseFloat(getEstimatedCost().toFixed(2)),
    budget: MONTHLY_BUDGET_USD,
    remaining: parseFloat(getRemainingBudget().toFixed(2)),
    percentUsed: parseFloat(((getEstimatedCost() / MONTHLY_BUDGET_USD) * 100).toFixed(1)),
  };
}
