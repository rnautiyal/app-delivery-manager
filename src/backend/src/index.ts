import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { config } from "./config/env";
import { logger } from "./config/logger";
import { authenticateToken } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import { getLogBuffer } from "./config/logger";
import { getUsageSummary } from "./services/usageTracker";

import subscriptionRoutes from "./routes/subscriptions";
import gatewayRoutes from "./routes/gateways";
import certificateRoutes from "./routes/certificates";
import wafRoutes from "./routes/waf";
import monitoringRoutes from "./routes/monitoring";
import diagnosticRoutes from "./routes/diagnostics";
import chatRoutes from "./routes/chat";
import templateRoutes from "./routes/templates";
import driftRoutes from "./routes/drift";
import alertRoutes from "./routes/alerts";
import activityLogRoutes from "./routes/activityLog";
import backupRoutes from "./routes/backups";
import maintenanceRoutes from "./routes/maintenance";
import autoscaleRoutes from "./routes/autoscale";
import awsRoutes from "./routes/aws";
import trafficManagerRoutes from "./routes/trafficManager";
import reportRoutes from "./routes/report";
import afdRoutes from "./routes/afd";
import managedGroupRoutes from "./routes/managedGroups";
import gcpRoutes from "./routes/gcp";
import billingRoutes from "./routes/billing";
import logAnalyticsRoutes from "./routes/logAnalytics";
import failoverRoutes from "./routes/failover";
import firewallRoutes from "./routes/firewall";

const app = express();
app.set("trust proxy", 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors({ origin: config.cors.origin, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(morgan("combined", { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Rate limiting (skip debug and health endpoints)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith("/api/debug/") || req.path === "/api/health",
});
app.use("/api/", limiter);

// Health check (unauthenticated)
app.get("/api/health", (_req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Public read-only report (unauthenticated, token-protected)
app.use("/api/report", reportRoutes);

// Hidden debug logs endpoint (unauthenticated, secret path)
app.get("/api/debug/logs-x7k9m", (req, res) => {
  const { level, search, limit } = req.query;
  let logs = getLogBuffer();
  if (level) logs = logs.filter((l) => l.level === level);
  if (search) logs = logs.filter((l) => JSON.stringify(l).toLowerCase().includes((search as string).toLowerCase()));
  const n = parseInt(limit as string) || 100;
  const recent = logs.slice(-n);

  const usage = getUsageSummary();

  // Return as HTML for easy browser viewing
  const html = `<!DOCTYPE html>
<html><head><title>AppGW Manager - Debug Logs</title>
<style>
body{font-family:'Cascadia Code','Consolas',monospace;background:#1a1a2e;color:#e0e0e0;margin:0;padding:16px;font-size:13px}
h1{color:#0078d4;font-size:18px;margin-bottom:4px}
.stats{background:#16213e;padding:12px;border-radius:8px;margin-bottom:16px;display:flex;gap:24px;flex-wrap:wrap}
.stat{text-align:center}.stat-val{font-size:20px;font-weight:700;color:#50e6ff}.stat-label{font-size:10px;color:#a0a0a0;text-transform:uppercase}
.filters{margin-bottom:12px;display:flex;gap:8px}
.filters a{color:#50e6ff;text-decoration:none;padding:4px 8px;border-radius:4px;background:#16213e}
.filters a:hover{background:#0078d4;color:white}
.log{padding:6px 12px;border-bottom:1px solid #16213e;display:flex;gap:12px;line-height:1.4}
.log:hover{background:#16213e}
.ts{color:#666;min-width:80px;font-size:11px}
.lvl{min-width:50px;font-weight:700;font-size:11px;text-transform:uppercase}
.lvl.error{color:#ff4444}.lvl.warn{color:#ffaa00}.lvl.info{color:#44ff44}
.msg{flex:1;word-break:break-all}
.meta{color:#888;font-size:11px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
</style></head><body>
<h1>AppGW Manager — Debug Logs</h1>
<div class="stats">
  <div class="stat"><div class="stat-val">${usage.requestCount}</div><div class="stat-label">AI Requests</div></div>
  <div class="stat"><div class="stat-val">$${usage.estimatedCost}</div><div class="stat-label">Cost (${usage.month})</div></div>
  <div class="stat"><div class="stat-val">$${usage.remaining}</div><div class="stat-label">Budget Left</div></div>
  <div class="stat"><div class="stat-val">${usage.percentUsed}%</div><div class="stat-label">Used</div></div>
  <div class="stat"><div class="stat-val">${recent.length}</div><div class="stat-label">Log Entries</div></div>
</div>
<div class="filters">
  <a href="?limit=200">All</a>
  <a href="?level=error&limit=100">Errors</a>
  <a href="?level=warn&limit=100">Warnings</a>
  <a href="?search=chat&limit=100">Chat</a>
  <a href="?search=tool+call&limit=100">Tool Calls</a>
  <a href="?search=gateway&limit=100">Gateway</a>
  <a href="?search=drift&limit=50">Drift</a>
  <a href="?search=alert&limit=50">Alerts</a>
  <a href="?search=cert&limit=50">Certs</a>
</div>
${recent.reverse().map((l) => {
  const time = l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : "";
  const extra = l.meta ? Object.keys(l.meta).filter(k => !["timestamp","level","message","service"].includes(k)).map(k => `${k}=${JSON.stringify(l.meta[k])}`).join(" ") : "";
  return `<div class="log"><span class="ts">${time}</span><span class="lvl ${l.level}">${l.level}</span><span class="msg">${l.message}</span><span class="meta">${extra}</span></div>`;
}).join("")}
<script>setTimeout(()=>location.reload(),10000)</script>
</body></html>`;

  res.type("html").send(html);
});

// Authenticated routes
app.use("/api/subscriptions", authenticateToken, subscriptionRoutes);
app.use("/api/gateways", authenticateToken, gatewayRoutes);
app.use("/api/certificates", authenticateToken, certificateRoutes);
app.use("/api/waf", authenticateToken, wafRoutes);
app.use("/api/monitoring", authenticateToken, monitoringRoutes);
app.use("/api/diagnostics", authenticateToken, diagnosticRoutes);
app.use("/api/chat", authenticateToken, chatRoutes);
app.use("/api/templates", authenticateToken, templateRoutes);
app.use("/api/drift", authenticateToken, driftRoutes);
app.use("/api/alerts", authenticateToken, alertRoutes);
app.use("/api/activity-log", authenticateToken, activityLogRoutes);
app.use("/api/backups", authenticateToken, backupRoutes);
app.use("/api/maintenance", authenticateToken, maintenanceRoutes);
app.use("/api/autoscale", authenticateToken, autoscaleRoutes);
app.use("/api/aws", authenticateToken, awsRoutes);
app.use("/api/traffic-manager", authenticateToken, trafficManagerRoutes);
app.use("/api/afd", authenticateToken, afdRoutes);
app.use("/api/managed-groups", authenticateToken, managedGroupRoutes);
app.use("/api/gcp", authenticateToken, gcpRoutes);
app.use("/api/billing", authenticateToken, billingRoutes);
app.use("/api/log-analytics", authenticateToken, logAnalyticsRoutes);
app.use("/api/failover", authenticateToken, failoverRoutes);
app.use("/api/firewall", authenticateToken, firewallRoutes);

// Serve frontend static files in production
const publicPath = path.join(__dirname, "..", "public");
logger.info(`Serving static files from: ${publicPath}`);
app.use(express.static(publicPath));

// SPA fallback: serve index.html for all non-API routes
app.use((_req, res, next) => {
  if (_req.path.startsWith("/api")) {
    return next();
  }
  const indexPath = path.join(publicPath, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) {
      logger.error(`Failed to serve index.html from ${indexPath}`, { error: err });
      res.status(500).send("Frontend not found");
    }
  });
});

// Error handler
app.use(errorHandler);

app.listen(config.port, () => {
  logger.info(`AppGW Manager API running on port ${config.port}`);
});

export default app;
