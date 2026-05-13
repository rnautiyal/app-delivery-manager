import { StorageService } from "./storageService";
import { logger } from "../config/logger";
import crypto from "crypto";

export interface BillingPlan {
  id: string;
  name: string;
  monthlyPrice: number;
  includedRequests: number;
  overageRate: number;
  aiEnabled: boolean;
  features: string[];
}

export interface BillingAccount {
  id: string;
  userId: string;
  userName: string;
  planId: string;
  billingMonth: string;
  requestsUsed: number;
  requestsIncluded: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  estimatedAiCost: number;
  overageRequests: number;
  overageCharges: number;
  totalCharge: number;
  history: BillingEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface BillingEntry {
  timestamp: string;
  action: string;
  inputTokens: number;
  outputTokens: number;
  costToUs: number;
}

const PLANS: BillingPlan[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    includedRequests: 0,
    overageRate: 0,
    aiEnabled: false,
    features: ["Dashboard & read-only view", "5 gateways max", "1 subscription", "Command Palette operations"],
  },
  {
    id: "basic",
    name: "Basic",
    monthlyPrice: 49,
    includedRequests: 0,
    overageRate: 0,
    aiEnabled: false,
    features: ["Unlimited gateways", "Full CRUD operations", "Command Palette", "3 subscriptions", "Managed groups"],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 99,
    includedRequests: 50,
    overageRate: 2.0,
    aiEnabled: true,
    features: ["Everything in Basic", "AppDelivery Genie AI (50 requests)", "Master/slave sync", "Multi-cloud (AWS + GCP)", "5 subscriptions", "$2/additional AI request"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: 299,
    includedRequests: 500,
    overageRate: 1.0,
    aiEnabled: true,
    features: ["Everything in Pro", "AppDelivery Genie AI (500 requests)", "Unlimited subscriptions", "Priority support", "SLA guarantee", "SSO integration", "$1/additional AI request"],
  },
];

// Worst case cost per request
const WORST_CASE_INPUT_TOKENS = 15000;
const WORST_CASE_OUTPUT_TOKENS = 12000;
const INPUT_COST_PER_M = 3.0;
const OUTPUT_COST_PER_M = 15.0;
const WORST_CASE_COST = (WORST_CASE_INPUT_TOKENS / 1_000_000) * INPUT_COST_PER_M + (WORST_CASE_OUTPUT_TOKENS / 1_000_000) * OUTPUT_COST_PER_M;

export class BillingService {
  private storage = new StorageService<BillingAccount>("billing.json");

  getPlans(): BillingPlan[] {
    return PLANS;
  }

  getPlan(planId: string): BillingPlan | undefined {
    return PLANS.find(p => p.id === planId);
  }

  getOrCreateAccount(userId: string, userName: string): BillingAccount {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const accounts = this.storage.readAll();
    let account = accounts.find(a => a.userId === userId && a.billingMonth === currentMonth);

    if (!account) {
      // Check if user had a previous account to carry over plan
      const prevAccount = accounts.filter(a => a.userId === userId).sort((a, b) => b.billingMonth.localeCompare(a.billingMonth))[0];
      const planId = prevAccount?.planId || "free";
      const plan = this.getPlan(planId)!;

      account = {
        id: crypto.randomUUID(),
        userId,
        userName,
        planId,
        billingMonth: currentMonth,
        requestsUsed: 0,
        requestsIncluded: plan.includedRequests,
        totalTokensInput: 0,
        totalTokensOutput: 0,
        estimatedAiCost: 0,
        overageRequests: 0,
        overageCharges: 0,
        totalCharge: plan.monthlyPrice,
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.storage.add(account);
    }

    return account;
  }

  trackRequest(userId: string, userName: string, inputTokens: number, outputTokens: number, action: string): BillingAccount {
    const account = this.getOrCreateAccount(userId, userName);
    const plan = this.getPlan(account.planId)!;

    account.requestsUsed += 1;
    account.totalTokensInput += inputTokens;
    account.totalTokensOutput += outputTokens;

    const requestCost = (inputTokens / 1_000_000) * INPUT_COST_PER_M + (outputTokens / 1_000_000) * OUTPUT_COST_PER_M;
    account.estimatedAiCost = parseFloat((account.estimatedAiCost + requestCost).toFixed(4));

    // Calculate overage
    if (account.requestsUsed > plan.includedRequests) {
      account.overageRequests = account.requestsUsed - plan.includedRequests;
      account.overageCharges = parseFloat((account.overageRequests * plan.overageRate).toFixed(2));
    }

    account.totalCharge = plan.monthlyPrice + account.overageCharges;

    account.history.push({
      timestamp: new Date().toISOString(),
      action,
      inputTokens,
      outputTokens,
      costToUs: parseFloat(requestCost.toFixed(4)),
    });

    account.updatedAt = new Date().toISOString();
    this.storage.update(account.id, account);

    return account;
  }

  changePlan(userId: string, userName: string, newPlanId: string): BillingAccount {
    const account = this.getOrCreateAccount(userId, userName);
    const plan = this.getPlan(newPlanId);
    if (!plan) throw new Error("Invalid plan");

    account.planId = newPlanId;
    account.requestsIncluded = plan.includedRequests;
    account.overageRequests = Math.max(0, account.requestsUsed - plan.includedRequests);
    account.overageCharges = parseFloat((account.overageRequests * plan.overageRate).toFixed(2));
    account.totalCharge = plan.monthlyPrice + account.overageCharges;
    account.updatedAt = new Date().toISOString();

    this.storage.update(account.id, account);
    logger.info("Changed billing plan", { userId, newPlanId });
    return account;
  }

  getBillingSummary(userId: string, userName: string) {
    const account = this.getOrCreateAccount(userId, userName);
    const plan = this.getPlan(account.planId)!;
    const requestsRemaining = Math.max(0, plan.includedRequests - account.requestsUsed);
    const usagePercent = plan.includedRequests > 0 ? Math.min(100, (account.requestsUsed / plan.includedRequests) * 100) : 0;
    const profitMargin = account.totalCharge > 0 ? ((account.totalCharge - account.estimatedAiCost) / account.totalCharge * 100) : 0;

    return {
      account,
      plan,
      requestsRemaining,
      usagePercent: parseFloat(usagePercent.toFixed(1)),
      profitMargin: parseFloat(profitMargin.toFixed(1)),
      worstCaseCostPerRequest: parseFloat(WORST_CASE_COST.toFixed(3)),
      avgCostPerRequest: account.requestsUsed > 0 ? parseFloat((account.estimatedAiCost / account.requestsUsed).toFixed(4)) : 0,
      aiEnabled: plan.aiEnabled,
    };
  }

  getAllAccounts(): BillingAccount[] {
    return this.storage.readAll();
  }
}
