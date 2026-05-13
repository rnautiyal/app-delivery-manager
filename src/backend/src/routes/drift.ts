import { Router, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { DriftService } from "../services/driftService";
import { ActivityLogService } from "../services/activityLogService";

const router = Router();
const driftService = new DriftService();
const activityLog = new ActivityLogService();

// Save baseline snapshot
router.post("/baselines", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, gatewayName } = req.body;
    if (!subscriptionId || !resourceGroup || !gatewayName) {
      return res.status(400).json({ success: false, error: "Missing required fields: subscriptionId, resourceGroup, gatewayName" });
    }
    const baseline = await driftService.saveBaseline(
      subscriptionId, resourceGroup, gatewayName,
      req.appUser?.email || "unknown"
    );
    activityLog.log(req.appUser?.email || "unknown", "drift.baseline", "baseline", gatewayName, subscriptionId);
    res.status(201).json({ success: true, data: baseline });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to save baseline" });
  }
}) as any);

// List baselines
router.get("/baselines", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, gatewayName } = req.query;
    const baselines = driftService.listBaselines(
      subscriptionId as string | undefined,
      gatewayName as string | undefined
    );
    res.json({ success: true, data: baselines });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to list baselines" });
  }
}) as any);

// Get baseline detail
router.get("/baselines/:id", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const baseline = driftService.getBaseline(req.params.id);
    res.json({ success: true, data: baseline });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to get baseline" });
  }
}) as any);

// Delete baseline
router.delete("/baselines/:id", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    driftService.deleteBaseline(req.params.id);
    res.json({ success: true, message: "Baseline deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to delete baseline" });
  }
}) as any);

// Check drift against baseline
router.get("/check/:baselineId", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const report = await driftService.checkDrift(req.params.baselineId);
    activityLog.log(req.appUser?.email || "unknown", "drift.check", "baseline", report.gatewayName, report.subscriptionId, `${report.totalChanges} changes`);
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to check drift" });
  }
}) as any);

export default router;
