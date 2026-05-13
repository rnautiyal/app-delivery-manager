import { Router, Response } from "express";
import { MonitoringService } from "../services/monitoringService";
import { AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const monitoringService = new MonitoringService();

// Get gateway metrics
router.get("/metrics/:resourceId(*)", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const timeRange = (req.query.timeRange as string) || "PT1H";
    const metrics = await monitoringService.getGatewayMetrics(req.params.resourceId, timeRange);
    res.json({ success: true, data: metrics });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get metrics",
    });
  }
}) as any);

// Get access logs
router.get("/logs/access", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workspaceId, gatewayName, hours } = req.query;
    if (!workspaceId || !gatewayName) {
      res.status(400).json({ success: false, error: "workspaceId and gatewayName are required" });
      return;
    }
    const logs = await monitoringService.queryAccessLogs(
      workspaceId as string,
      gatewayName as string,
      parseInt(hours as string) || 1
    );
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get access logs",
    });
  }
}) as any);

// Get WAF logs
router.get("/logs/waf", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workspaceId, gatewayName, hours } = req.query;
    if (!workspaceId || !gatewayName) {
      res.status(400).json({ success: false, error: "workspaceId and gatewayName are required" });
      return;
    }
    const logs = await monitoringService.queryWafLogs(
      workspaceId as string,
      gatewayName as string,
      parseInt(hours as string) || 1
    );
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get WAF logs",
    });
  }
}) as any);

// Get 502 error analysis
router.get("/errors/502", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workspaceId, gatewayName } = req.query;
    if (!workspaceId || !gatewayName) {
      res.status(400).json({ success: false, error: "workspaceId and gatewayName are required" });
      return;
    }
    const analysis = await monitoringService.get502ErrorAnalysis(
      workspaceId as string,
      gatewayName as string
    );
    res.json({ success: true, data: analysis });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to analyze 502 errors",
    });
  }
}) as any);

export default router;
