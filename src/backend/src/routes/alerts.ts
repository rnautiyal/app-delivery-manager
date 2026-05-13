import { Router, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { AlertService } from "../services/alertService";
import { ActivityLogService } from "../services/activityLogService";

const router = Router();
const alertService = new AlertService();
const activityLog = new ActivityLogService();

// Create alert rule
router.post("/rules", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description, conditionType, severity, subscriptionId, gatewayFilter, conditionParams } = req.body;
    if (!name || !conditionType || !severity || !subscriptionId) {
      return res.status(400).json({ success: false, error: "Missing required fields: name, conditionType, severity, subscriptionId" });
    }
    const rule = alertService.createRule(
      name, description || "", conditionType, severity, subscriptionId,
      req.appUser?.email || "unknown", gatewayFilter, conditionParams
    );
    activityLog.log(req.appUser?.email || "unknown", "alert.create", "alert-rule", name, subscriptionId);
    res.status(201).json({ success: true, data: rule });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to create rule" });
  }
}) as any);

// List rules
router.get("/rules", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rules = alertService.listRules(req.query.subscriptionId as string | undefined);
    res.json({ success: true, data: rules });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to list rules" });
  }
}) as any);

// Get rule
router.get("/rules/:id", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rule = alertService.getRule(req.params.id);
    res.json({ success: true, data: rule });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to get rule" });
  }
}) as any);

// Update rule
router.put("/rules/:id", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rule = alertService.updateRule(req.params.id, req.body);
    res.json({ success: true, data: rule });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to update rule" });
  }
}) as any);

// Toggle rule enabled/disabled
router.patch("/rules/:id/toggle", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { enabled } = req.body;
    const rule = alertService.toggleRule(req.params.id, enabled);
    res.json({ success: true, data: rule });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to toggle rule" });
  }
}) as any);

// Delete rule
router.delete("/rules/:id", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    alertService.deleteRule(req.params.id);
    res.json({ success: true, message: "Rule deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to delete rule" });
  }
}) as any);

// Evaluate all rules
router.post("/evaluate", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId } = req.body;
    if (!subscriptionId) {
      return res.status(400).json({ success: false, error: "Missing required field: subscriptionId" });
    }
    const alerts = await alertService.evaluateRules(subscriptionId);
    activityLog.log(req.appUser?.email || "unknown", "alert.evaluate", "alert", "all", subscriptionId, `${alerts.length} triggered`);
    res.json({ success: true, data: alerts });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to evaluate alerts" });
  }
}) as any);

// Get alert history
router.get("/history", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, limit } = req.query;
    const history = alertService.getHistory(
      subscriptionId as string | undefined,
      limit ? parseInt(limit as string, 10) : undefined
    );
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to get history" });
  }
}) as any);

// Acknowledge alert
router.patch("/history/:id/acknowledge", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    alertService.acknowledgeAlert(req.params.id, req.appUser?.email || "unknown");
    res.json({ success: true, message: "Alert acknowledged" });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to acknowledge alert" });
  }
}) as any);

// Clear history
router.delete("/history", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    alertService.clearHistory(req.query.subscriptionId as string | undefined);
    res.json({ success: true, message: "History cleared" });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to clear history" });
  }
}) as any);

export default router;
