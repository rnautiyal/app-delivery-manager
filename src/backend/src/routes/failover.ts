import { Router, Response } from "express";
import { FailoverService } from "../services/failoverService";
import { AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const failoverService = new FailoverService();

// Start the auto-probe loop on module load
failoverService.startProbeLoop();

// List all failover groups
router.get("/groups", (async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const groups = failoverService.listGroups();
    res.json({ success: true, data: groups });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to list groups" });
  }
}) as any);

// Get failover status for a group
router.get("/groups/:groupId/status", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = await failoverService.getFailoverStatus(req.params.groupId);
    if (!status) {
      res.status(404).json({ success: false, error: "Failover group not found" });
      return;
    }
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to get status" });
  }
}) as any);

// Create a new failover group
router.post("/groups", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const group = failoverService.createGroup({
      ...req.body,
      createdBy: req.appUser?.email || "unknown",
    });
    res.status(201).json({ success: true, data: group });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to create group" });
  }
}) as any);

// Delete a failover group
router.delete("/groups/:groupId", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deleted = failoverService.deleteGroup(req.params.groupId);
    if (!deleted) {
      res.status(404).json({ success: false, error: "Failover group not found" });
      return;
    }
    res.json({ success: true, message: "Group deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to delete group" });
  }
}) as any);

// Update a failover group (mode, settings)
router.put("/groups/:groupId", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = failoverService.updateGroup(req.params.groupId, req.body);
    if (!updated) {
      res.status(404).json({ success: false, error: "Failover group not found" });
      return;
    }
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to update group" });
  }
}) as any);

// Remove an endpoint IP from DNS
router.post("/groups/:groupId/remove-endpoint", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ip, reason } = req.body;
    const result = await failoverService.removeEndpoint(
      req.params.groupId, ip, reason || "Manual removal", req.appUser?.email || "unknown"
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to remove endpoint" });
  }
}) as any);

// Add an endpoint IP back to DNS
router.post("/groups/:groupId/add-endpoint", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ip, reason } = req.body;
    const result = await failoverService.addEndpoint(
      req.params.groupId, ip, reason || "Manual addition", req.appUser?.email || "unknown"
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to add endpoint" });
  }
}) as any);

// Manual failover to specific endpoint
router.post("/groups/:groupId/failover", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { targetIp } = req.body;
    const result = await failoverService.triggerManualFailover(
      req.params.groupId, targetIp, req.appUser?.email || "unknown"
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to trigger failover" });
  }
}) as any);

// Get failover history
router.get("/history", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const groupId = req.query.groupId as string | undefined;
    const limit = parseInt(req.query.limit as string) || 20;
    const history = failoverService.getHistory(groupId, limit);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to get history" });
  }
}) as any);

// Run probe check manually
router.post("/probe", (async (_req: AuthenticatedRequest, res: Response) => {
  try {
    await failoverService.runProbeCheck();
    res.json({ success: true, message: "Probe check completed" });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Probe check failed" });
  }
}) as any);

export default router;
