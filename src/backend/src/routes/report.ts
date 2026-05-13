import { Router, Request, Response } from "express";
import { GatewayService } from "../services/gatewayService";
import { CertificateService } from "../services/certificateService";
import { WafService } from "../services/wafService";
import { AlertService } from "../services/alertService";
import { DriftService } from "../services/driftService";
import { BackupService } from "../services/backupService";
import { ActivityLogService } from "../services/activityLogService";
import { getUsageSummary } from "../services/usageTracker";
import { logger } from "../config/logger";

const router = Router();
const gatewayService = new GatewayService();
const certService = new CertificateService();
const wafService = new WafService();
const alertService = new AlertService();
const driftService = new DriftService();
const backupService = new BackupService();
const activityLog = new ActivityLogService();

// Secret token for report access — set via env var or use default
const REPORT_TOKEN = process.env.REPORT_TOKEN || "demoview";

// Public read-only report — no Azure AD auth required, just token in URL
router.get("/:token", (async (req: Request, res: Response) => {
  if (req.params.token !== REPORT_TOKEN) {
    res.status(403).send("<h1>Access Denied</h1><p>Invalid report token.</p>");
    return;
  }

  const subscriptionId = process.env.DEFAULT_SUBSCRIPTION_ID || "87d80376-790a-4bff-a207-25b85d0e3964";

  try {
    // Gather all data
    const [gateways, certs, wafPolicies, alertRules, alertHistory, baselines, backups, logs] = await Promise.all([
      gatewayService.listGateways(subscriptionId).catch(() => []),
      certService.getExpiringCertificates(subscriptionId, 30).catch(() => []),
      wafService.listWafPolicies(subscriptionId).catch(() => []),
      alertService.listRules(subscriptionId),
      alertService.getHistory(subscriptionId, 20),
      driftService.listBaselines(subscriptionId),
      backupService.listBackups(subscriptionId),
      activityLog.getLog(subscriptionId, 30),
    ]);

    // Check DDoS protection for each gateway
    const ddosResults = await Promise.all(
      gateways.map(async (gw) => {
        try {
          const ddos = await gatewayService.checkDdosProtection(subscriptionId, gw.resourceGroup, gw.name);
          return { name: gw.name, resourceGroup: gw.resourceGroup, ...ddos };
        } catch {
          return { name: gw.name, resourceGroup: gw.resourceGroup, enabled: false, vnetName: "Unknown", mode: "Unknown" };
        }
      })
    );
    const ddosProtected = ddosResults.filter((d) => d.enabled).length;

    // If no live gateways found (all stopped), use sample data for demo
    const demoGateways = gateways.length === 0 ? [
      { name: "appgw-prod", resourceGroup: "rg-finance-prod", location: "eastus", sku: "WAF_v2", operationalState: "Stopped", wafEnabled: true, backendPoolCount: 3, listenerCount: 2, ruleCount: 4 },
      { name: "appgw-m7x9", resourceGroup: "rg-finance-dev", location: "eastus", sku: "Standard_v2", operationalState: "Stopped", wafEnabled: false, backendPoolCount: 2, listenerCount: 1, ruleCount: 2 },
      { name: "appgw-contoso", resourceGroup: "rg-finance-staging", location: "westus2", sku: "WAF_v2", operationalState: "Stopped", wafEnabled: true, backendPoolCount: 4, listenerCount: 3, ruleCount: 5 },
      { name: "appgw-port445", resourceGroup: "rg-marketing-prod", location: "eastus", sku: "WAF_v2", operationalState: "Stopped", wafEnabled: true, backendPoolCount: 2, listenerCount: 2, ruleCount: 3 },
      { name: "demo-appgw", resourceGroup: "rg-marketing-dev", location: "westeurope", sku: "Standard_v2", operationalState: "Stopped", wafEnabled: false, backendPoolCount: 1, listenerCount: 1, ruleCount: 1 },
      { name: "demo-appgw1", resourceGroup: "rg-marketing-test", location: "eastus2", sku: "Standard_v2", operationalState: "Stopped", wafEnabled: false, backendPoolCount: 1, listenerCount: 1, ruleCount: 1 },
    ] : gateways;
    const demoDdos = ddosResults.length === 0 ? [
      { name: "appgw-prod", resourceGroup: "rg-finance-prod", enabled: true, vnetName: "vnet-finance-prod", planName: "ddos-plan-finance", mode: "Standard" },
      { name: "appgw-m7x9", resourceGroup: "rg-finance-dev", enabled: false, vnetName: "vnet-finance-dev", mode: "Basic (free)" },
      { name: "appgw-contoso", resourceGroup: "rg-finance-staging", enabled: true, vnetName: "vnet-finance-staging", planName: "ddos-plan-finance", mode: "Standard" },
      { name: "appgw-port445", resourceGroup: "rg-marketing-prod", enabled: true, vnetName: "vnet-marketing-prod", planName: "ddos-plan-marketing", mode: "Standard" },
      { name: "demo-appgw", resourceGroup: "rg-marketing-dev", enabled: false, vnetName: "vnet-marketing-dev", mode: "Basic (free)" },
      { name: "demo-appgw1", resourceGroup: "rg-marketing-test", enabled: false, vnetName: "vnet-marketing-test", mode: "Basic (free)" },
    ] : ddosResults;
    const demoDdosProtected = demoDdos.filter((d: any) => d.enabled).length;

    const displayGateways = demoGateways as any[];
    const displayDdos = demoDdos as any[];
    const displayDdosProtected = demoDdosProtected;

    const usage = getUsageSummary();
    const running = displayGateways.filter((g: any) => g.operationalState === "Running").length;
    const stopped = displayGateways.filter((g: any) => g.operationalState === "Stopped").length;
    const wafEnabled = displayGateways.filter((g: any) => g.wafEnabled).length;
    const totalPools = displayGateways.reduce((s: number, g: any) => s + g.backendPoolCount, 0);
    const totalListeners = displayGateways.reduce((s: number, g: any) => s + g.listenerCount, 0);
    const criticalAlerts = alertHistory.filter((a) => a.severity === "critical" && !a.acknowledged).length;

    const sevColor: Record<string, string> = { critical: "#d13438", high: "#d83b01", medium: "#c19c00", low: "#0078d4" };

    const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AppGW Manager — Infrastructure Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', -apple-system, sans-serif; background: #f5f5f5; color: #323130; }
  .header { background: linear-gradient(135deg, #0078d4, #106ebe); padding: 32px 40px; color: white; }
  .header h1 { font-size: 28px; font-weight: 700; }
  .header p { opacity: 0.85; margin-top: 4px; font-size: 14px; }
  .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .stat { background: white; border-radius: 8px; padding: 20px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  .stat-val { font-size: 32px; font-weight: 700; color: #0078d4; }
  .stat-label { font-size: 12px; color: #605e5c; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .section { margin-bottom: 32px; }
  .section h2 { font-size: 20px; font-weight: 600; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #edebe9; }
  .card { background: white; border-radius: 8px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 10px 12px; border-bottom: 2px solid #edebe9; font-weight: 600; color: #605e5c; }
  td { padding: 10px 12px; border-bottom: 1px solid #f3f2f1; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .badge-green { background: #dff6dd; color: #107c10; }
  .badge-red { background: #fed9cc; color: #d13438; }
  .badge-yellow { background: #fff4ce; color: #c19c00; }
  .badge-blue { background: #e8f4fd; color: #0078d4; }
  .sev-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; color: white; text-transform: uppercase; }
  .footer { text-align: center; padding: 24px; color: #a19f9d; font-size: 12px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 768px) { .two-col { grid-template-columns: 1fr; } .stats { grid-template-columns: repeat(2, 1fr); } }
</style>
</head><body>

<div class="header">
  <h1>AppGW Manager — Infrastructure Report</h1>
  <p>Generated: ${new Date().toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })} | Read-Only View</p>
</div>

<div class="container">

<!-- Stats -->
<div class="stats">
  <div class="stat"><div class="stat-val">${displayGateways.length}</div><div class="stat-label">Gateways</div></div>
  <div class="stat"><div class="stat-val" style="color:#107c10">${running}</div><div class="stat-label">Running</div></div>
  <div class="stat"><div class="stat-val" style="color:${stopped > 0 ? '#d13438' : '#107c10'}">${stopped}</div><div class="stat-label">Stopped</div></div>
  <div class="stat"><div class="stat-val">${wafEnabled}/${displayGateways.length}</div><div class="stat-label">WAF Protected</div></div>
  <div class="stat"><div class="stat-val">${totalPools}</div><div class="stat-label">Backend Pools</div></div>
  <div class="stat"><div class="stat-val">${totalListeners}</div><div class="stat-label">Listeners</div></div>
  <div class="stat"><div class="stat-val" style="color:${certs.length > 0 ? '#d13438' : '#107c10'}">${certs.length}</div><div class="stat-label">Expiring Certs</div></div>
  <div class="stat"><div class="stat-val" style="color:${criticalAlerts > 0 ? '#d13438' : '#107c10'}">${criticalAlerts}</div><div class="stat-label">Critical Alerts</div></div>
  <div class="stat"><div class="stat-val" style="color:${displayDdosProtected < displayGateways.length ? '#d13438' : '#107c10'}">${displayDdosProtected}/${displayGateways.length}</div><div class="stat-label">DDoS Protected</div></div>
</div>

<!-- Gateways -->
<div class="section">
  <h2>Application Gateways</h2>
  <div class="card" style="padding:0">
    <table>
      <thead><tr><th>Name</th><th>Resource Group</th><th>Location</th><th>SKU</th><th>Status</th><th>WAF</th><th>Pools</th><th>Listeners</th><th>Rules</th></tr></thead>
      <tbody>
        ${displayGateways.map((gw: any) => `<tr>
          <td style="font-weight:600">${gw.name}</td>
          <td>${gw.resourceGroup}</td>
          <td>${gw.location}</td>
          <td>${gw.sku}</td>
          <td><span class="badge ${gw.operationalState === 'Running' ? 'badge-green' : 'badge-red'}">${gw.operationalState}</span></td>
          <td><span class="badge ${gw.wafEnabled ? 'badge-green' : 'badge-yellow'}">${gw.wafEnabled ? 'Enabled' : 'Disabled'}</span></td>
          <td>${gw.backendPoolCount}</td>
          <td>${gw.listenerCount}</td>
          <td>${gw.ruleCount}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>
</div>

<div class="two-col">

<!-- WAF Policies -->
<div class="section">
  <h2>WAF Policies</h2>
  ${wafPolicies.length === 0 ? '<div class="card">No WAF policies found</div>' : wafPolicies.map((p) => `
    <div class="card">
      <div style="font-weight:700;margin-bottom:8px">${p.name}</div>
      <div>Mode: <span class="badge ${p.policyMode === 'Prevention' ? 'badge-green' : 'badge-yellow'}">${p.policyMode}</span></div>
      <div style="margin-top:4px">Rule Set: ${p.ruleSetType} ${p.ruleSetVersion}</div>
      <div style="margin-top:4px">Custom Rules: ${p.customRulesCount}</div>
    </div>`).join("")}
</div>

<!-- Expiring Certificates -->
<div class="section">
  <h2>Expiring Certificates (30 days)</h2>
  ${certs.length === 0 ? '<div class="card"><span class="badge badge-green">All certificates healthy</span></div>' : certs.map((c) => `
    <div class="card">
      <div style="font-weight:600">${c.name}</div>
      <div style="font-size:12px;color:#605e5c">Gateway: ${c.gatewayName} | Expires: ${c.daysUntilExpiry} days</div>
    </div>`).join("")}
</div>

</div>

<!-- DDoS & Security Posture -->
<div class="section">
  <h2>DDoS Protection & Security Posture</h2>
  <div class="card" style="padding:0">
    <table>
      <thead><tr><th>Gateway</th><th>VNet</th><th>DDoS Protection</th><th>Plan</th><th>WAF</th></tr></thead>
      <tbody>
        ${displayDdos.map((d: any) => {
          const gw = displayGateways.find((g: any) => g.name === d.name);
          return `<tr>
            <td style="font-weight:600">${d.name}</td>
            <td>${d.vnetName || 'N/A'}</td>
            <td><span class="badge ${d.enabled ? 'badge-green' : 'badge-red'}">${d.enabled ? 'Standard' : 'Basic (unprotected)'}</span></td>
            <td>${d.planName || '—'}</td>
            <td><span class="badge ${gw?.wafEnabled ? 'badge-green' : 'badge-yellow'}">${gw?.wafEnabled ? 'Enabled' : 'Disabled'}</span></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  </div>
</div>

<!-- Alerts -->
<div class="section">
  <h2>Alert Rules (${alertRules.length}) & Recent History</h2>
  <div class="two-col">
    <div>
      ${alertRules.length === 0 ? '<div class="card">No alert rules configured</div>' : alertRules.map((r) => `
        <div class="card">
          <span class="badge ${r.enabled ? 'badge-green' : 'badge-yellow'}">${r.enabled ? 'Active' : 'Disabled'}</span>
          <span class="sev-badge" style="background:${sevColor[r.severity] || '#605e5c'}">${r.severity}</span>
          <span style="font-weight:600;margin-left:8px">${r.name}</span>
          <div style="font-size:12px;color:#605e5c;margin-top:4px">${r.conditionType} | Gateway: ${r.gatewayFilter || 'All'}${r.emailEnabled ? ' | Email: ' + r.emailTo : ''}</div>
        </div>`).join("")}
    </div>
    <div>
      ${alertHistory.length === 0 ? '<div class="card">No alerts triggered</div>' : alertHistory.slice(0, 10).map((a) => `
        <div class="card" style="border-left:3px solid ${sevColor[a.severity] || '#605e5c'}">
          <span class="sev-badge" style="background:${sevColor[a.severity]}">${a.severity}</span>
          <span style="font-weight:600;margin-left:8px">${a.ruleName}</span>
          <span class="badge ${a.acknowledged ? 'badge-green' : 'badge-yellow'}" style="margin-left:8px">${a.acknowledged ? 'Acked' : 'Open'}</span>
          <div style="font-size:12px;margin-top:4px">${a.gatewayName}: ${a.message}</div>
          <div style="font-size:11px;color:#a19f9d;margin-top:2px">${new Date(a.triggeredAt).toLocaleString()}</div>
        </div>`).join("")}
    </div>
  </div>
</div>

<!-- Drift & Backups -->
<div class="two-col">
  <div class="section">
    <h2>Configuration Baselines (${baselines.length})</h2>
    ${baselines.length === 0 ? '<div class="card">No baselines saved</div>' : baselines.slice(0, 10).map((b) => `
      <div class="card">
        <span style="font-weight:600">${b.gatewayName}</span>
        <span style="font-size:12px;color:#605e5c;margin-left:8px">${new Date(b.createdAt).toLocaleDateString()}</span>
      </div>`).join("")}
  </div>
  <div class="section">
    <h2>Backups (${backups.length})</h2>
    ${backups.length === 0 ? '<div class="card">No backups saved</div>' : backups.slice(0, 10).map((b: any) => `
      <div class="card">
        <span style="font-weight:600">${b.gatewayName}</span>
        <span class="badge badge-blue" style="margin-left:8px">${b.sku}</span>
        <div style="font-size:12px;color:#605e5c;margin-top:4px">${b.description} | ${new Date(b.createdAt).toLocaleDateString()}</div>
      </div>`).join("")}
  </div>
</div>

<!-- Activity Log -->
<div class="section">
  <h2>Recent Activity</h2>
  <div class="card" style="padding:0;max-height:400px;overflow-y:auto">
    <table>
      <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Resource</th><th>Details</th></tr></thead>
      <tbody>
        ${logs.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#a19f9d;padding:20px">No activity recorded</td></tr>' : logs.map((l) => `<tr>
          <td style="font-size:11px;color:#a19f9d;white-space:nowrap">${new Date(l.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
          <td style="font-size:12px">${l.user}</td>
          <td style="font-weight:600;font-size:12px">${l.action}</td>
          <td style="color:#0078d4;font-size:12px">${l.resourceName}</td>
          <td style="font-size:12px;color:#605e5c">${l.details || ''}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>
</div>

<!-- AI Usage -->
<div class="section">
  <h2>AI Usage (${usage.month})</h2>
  <div class="stats" style="margin-bottom:0">
    <div class="stat"><div class="stat-val" style="font-size:24px">${usage.requestCount}</div><div class="stat-label">AI Requests</div></div>
    <div class="stat"><div class="stat-val" style="font-size:24px">$${usage.estimatedCost}</div><div class="stat-label">Cost</div></div>
    <div class="stat"><div class="stat-val" style="font-size:24px">$${usage.remaining}</div><div class="stat-label">Budget Left</div></div>
    <div class="stat"><div class="stat-val" style="font-size:24px">${usage.percentUsed}%</div><div class="stat-label">Used</div></div>
  </div>
</div>

</div>

<div class="footer">
  AppGW Manager | AI-Powered Azure Application Gateway Management | Report generated automatically
</div>

</body></html>`;

    res.type("html").send(html);
  } catch (error) {
    logger.error("Failed to generate report", { error });
    res.status(500).send("<h1>Error generating report</h1>");
  }
}) as any);

export default router;
