import { useState, useEffect } from "react";
import { Stack, Text, Spinner, MessageBar, MessageBarType, PrimaryButton, DefaultButton, Dialog, DialogType, DialogFooter, ProgressIndicator } from "@fluentui/react";
import { getAccessToken } from "../services/api";
import axios from "axios";

interface Plan {
  id: string; name: string; monthlyPrice: number; includedRequests: number; overageRate: number; features: string[];
}

interface BillingSummary {
  account: {
    planId: string; billingMonth: string; requestsUsed: number; requestsIncluded: number;
    totalTokensInput: number; totalTokensOutput: number; estimatedAiCost: number;
    overageRequests: number; overageCharges: number; totalCharge: number;
    history: { timestamp: string; action: string; inputTokens: number; outputTokens: number; costToUs: number }[];
  };
  plan: Plan;
  requestsRemaining: number;
  usagePercent: number;
  profitMargin: number;
  worstCaseCostPerRequest: number;
  avgCostPerRequest: number;
}

const PLAN_COLORS: Record<string, string> = {
  free: "#605e5c", basic: "#0078d4", standard: "#5c2d91", premium: "#008272", enterprise: "#d83b01",
};
const PLAN_ICONS: Record<string, string> = {
  free: "🆓", basic: "⚡", standard: "🚀", premium: "💎", enterprise: "🏢",
};

export function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changePlanDialog, setChangePlanDialog] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [plansRes, summaryRes] = await Promise.all([
        axios.get("/api/billing/plans", { headers }),
        axios.get("/api/billing/summary", { headers }),
      ]);
      setPlans(plansRes.data.data || []);
      setSummary(summaryRes.data.data || null);
    } catch (e: any) { setError(e?.message || "Failed to load billing data"); }
    finally { setLoading(false); }
  }

  async function handleChangePlan(planId: string) {
    setActionLoading(true);
    try {
      const token = await getAccessToken();
      await axios.post("/api/billing/change-plan", { planId }, { headers: { Authorization: `Bearer ${token}` } });
      setChangePlanDialog(null);
      await loadData();
    } catch (e: any) { setError(e?.message || "Failed"); }
    finally { setActionLoading(false); }
  }

  if (loading) return <div className="page-container"><Spinner label="Loading billing..." /></div>;

  const currentPlan = summary?.plan;
  const acct = summary?.account;

  return (
    <div className="page-container">
      <div className="page-header">
        <Text variant="xxLarge" styles={{ root: { fontWeight: 600 } }}>Billing & Usage</Text>
      </div>

      {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError(null)} styles={{ root: { marginBottom: 16 } }}>{error}</MessageBar>}

      {/* Current Plan + Usage Summary */}
      {summary && currentPlan && acct && (
        <Stack tokens={{ childrenGap: 20 }}>
          {/* Usage Overview Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            <div className="card" style={{ padding: 20, borderTop: `3px solid ${PLAN_COLORS[currentPlan.id]}` }}>
              <Text variant="small" styles={{ root: { color: "#605e5c", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 } }}>Current Plan</Text>
              <div style={{ fontSize: 28, fontWeight: 700, color: PLAN_COLORS[currentPlan.id], marginTop: 4 }}>
                {PLAN_ICONS[currentPlan.id]} {currentPlan.name}
              </div>
              <Text variant="small" styles={{ root: { color: "#605e5c" } }}>${currentPlan.monthlyPrice}/month</Text>
            </div>
            <div className="card" style={{ padding: 20, borderTop: "3px solid #0078d4" }}>
              <Text variant="small" styles={{ root: { color: "#605e5c", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 } }}>Requests Used</Text>
              <div style={{ fontSize: 28, fontWeight: 700, color: summary.usagePercent > 80 ? "#d83b01" : "#0078d4", marginTop: 4 }}>
                {acct.requestsUsed} / {acct.requestsIncluded}
              </div>
              <ProgressIndicator percentComplete={summary.usagePercent / 100} barHeight={6}
                styles={{ progressBar: { background: summary.usagePercent > 80 ? "#d83b01" : "#0078d4" }, root: { marginTop: 8 } }} />
              <Text variant="small" styles={{ root: { color: "#605e5c", marginTop: 4 } }}>{summary.requestsRemaining} remaining</Text>
            </div>
            <div className="card" style={{ padding: 20, borderTop: "3px solid #107c10" }}>
              <Text variant="small" styles={{ root: { color: "#605e5c", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 } }}>Monthly Charge</Text>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#107c10", marginTop: 4 }}>
                ${acct.totalCharge.toFixed(2)}
              </div>
              {acct.overageCharges > 0 && (
                <Text variant="small" styles={{ root: { color: "#d83b01" } }}>
                  Includes ${acct.overageCharges.toFixed(2)} overage ({acct.overageRequests} extra requests)
                </Text>
              )}
            </div>
            <div className="card" style={{ padding: 20, borderTop: "3px solid #8764b8" }}>
              <Text variant="small" styles={{ root: { color: "#605e5c", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 } }}>AI Cost (Internal)</Text>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#8764b8", marginTop: 4 }}>
                ${acct.estimatedAiCost.toFixed(2)}
              </div>
              <Text variant="small" styles={{ root: { color: "#605e5c" } }}>
                Avg ${summary.avgCostPerRequest.toFixed(3)}/req • Margin {summary.profitMargin.toFixed(0)}%
              </Text>
            </div>
          </div>

          {/* Billing Month Header */}
          <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, flex: 1 } }}>
              📅 Billing Period: {acct.billingMonth}
            </Text>
            <Text variant="small" styles={{ root: { color: "#605e5c" } }}>
              Tokens: {(acct.totalTokensInput / 1000).toFixed(0)}K in / {(acct.totalTokensOutput / 1000).toFixed(0)}K out
            </Text>
          </div>

          {/* Plans Grid */}
          <Text variant="large" styles={{ root: { fontWeight: 700, marginTop: 8 } }}>Available Plans</Text>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {plans.map(plan => {
              const isCurrent = plan.id === currentPlan.id;
              const color = PLAN_COLORS[plan.id];
              return (
                <div key={plan.id} className="card" style={{
                  padding: 0, overflow: "hidden",
                  border: isCurrent ? `2px solid ${color}` : "1px solid #edebe9",
                  position: "relative",
                }}>
                  {isCurrent && (
                    <div style={{ position: "absolute", top: 10, right: 10, background: color, color: "white", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>
                      CURRENT
                    </div>
                  )}
                  <div style={{ background: `${color}10`, padding: "20px 20px 12px", borderBottom: `2px solid ${color}22` }}>
                    <div style={{ fontSize: 20 }}>{PLAN_ICONS[plan.id]}</div>
                    <Text variant="large" styles={{ root: { fontWeight: 700, color, display: "block" } }}>{plan.name}</Text>
                    <div style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 32, fontWeight: 800, color: "#323130" }}>${plan.monthlyPrice}</span>
                      <span style={{ color: "#605e5c", fontSize: 14 }}>/month</span>
                    </div>
                  </div>
                  <div style={{ padding: "12px 20px 16px" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color, marginBottom: 8 }}>
                      {plan.includedRequests} requests included
                    </div>
                    <Stack tokens={{ childrenGap: 6 }}>
                      {plan.features.map((f, i) => (
                        <div key={i} style={{ fontSize: 12, color: "#323130", display: "flex", gap: 6, alignItems: "flex-start" }}>
                          <span style={{ color: "#107c10", fontSize: 11, marginTop: 1 }}>✓</span>
                          <span>{f}</span>
                        </div>
                      ))}
                    </Stack>
                    {!isCurrent && (
                      <PrimaryButton text={plan.monthlyPrice > currentPlan.monthlyPrice ? "Upgrade" : plan.monthlyPrice === 0 ? "Downgrade" : "Switch"}
                        onClick={() => setChangePlanDialog(plan.id)}
                        styles={{ root: { width: "100%", marginTop: 12, borderRadius: 6, background: color, borderColor: color } }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recent Usage History */}
          {acct.history.length > 0 && (
            <>
              <Text variant="large" styles={{ root: { fontWeight: 700, marginTop: 8 } }}>Recent Requests</Text>
              <div className="card" style={{ padding: 0 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #edebe9", textAlign: "left" }}>
                      <th style={{ padding: "10px 16px" }}>Time</th>
                      <th style={{ padding: "10px 16px" }}>Action</th>
                      <th style={{ padding: "10px 16px" }}>Input Tokens</th>
                      <th style={{ padding: "10px 16px" }}>Output Tokens</th>
                      <th style={{ padding: "10px 16px" }}>AI Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acct.history.slice(-20).reverse().map((h, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #edebe9" }}>
                        <td style={{ padding: "8px 16px", fontSize: 12, color: "#605e5c" }}>{new Date(h.timestamp).toLocaleString()}</td>
                        <td style={{ padding: "8px 16px" }}>{h.action}</td>
                        <td style={{ padding: "8px 16px", fontFamily: "monospace" }}>{h.inputTokens.toLocaleString()}</td>
                        <td style={{ padding: "8px 16px", fontFamily: "monospace" }}>{h.outputTokens.toLocaleString()}</td>
                        <td style={{ padding: "8px 16px", fontFamily: "monospace" }}>${h.costToUs.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Stack>
      )}

      {/* Change Plan Dialog */}
      <Dialog hidden={!changePlanDialog} onDismiss={() => setChangePlanDialog(null)}
        dialogContentProps={{ type: DialogType.normal, title: "Change Plan", subText: `Switch to the ${plans.find(p => p.id === changePlanDialog)?.name} plan?` }}>
        <DialogFooter>
          <PrimaryButton text="Confirm" onClick={() => changePlanDialog && handleChangePlan(changePlanDialog)} disabled={actionLoading} />
          <DefaultButton text="Cancel" onClick={() => setChangePlanDialog(null)} />
        </DialogFooter>
      </Dialog>
    </div>
  );
}
