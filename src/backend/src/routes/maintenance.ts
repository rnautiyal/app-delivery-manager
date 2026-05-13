import { Router, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { MaintenanceService } from "../services/maintenanceService";
import { ActivityLogService } from "../services/activityLogService";

const router = Router();
const maintenanceService = new MaintenanceService();
const activityLog = new ActivityLogService();

// List available upgrades for subscription
router.get("/upgrades/:subscriptionId", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const upgrades = await maintenanceService.listAvailableUpgrades(req.params.subscriptionId);
    res.json({ success: true, data: upgrades });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed" });
  }
}) as any);

// List scheduled maintenance windows
router.get("/scheduled", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const windows = maintenanceService.listScheduled(req.query.subscriptionId as string | undefined);
    res.json({ success: true, data: windows });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed" });
  }
}) as any);

// Schedule maintenance
router.post("/schedule", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, gatewayName, upgradeType, upgradeVersion, upgradeDescription, scheduledAt, notes, scheduledTime, estimatedDurationMinutes, blackoutStart, blackoutEnd } = req.body;
    if (!subscriptionId || !gatewayName || !upgradeVersion || !scheduledAt) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }
    const window = maintenanceService.scheduleMaintenance(
      subscriptionId, resourceGroup, gatewayName, upgradeType, upgradeVersion, upgradeDescription,
      scheduledAt, req.appUser?.email || "unknown", notes, scheduledTime, estimatedDurationMinutes, blackoutStart, blackoutEnd
    );
    activityLog.log(req.appUser?.email || "unknown", "maintenance.schedule", "maintenance", gatewayName, subscriptionId, `${upgradeVersion} → ${new Date(scheduledAt).toLocaleDateString()}`);
    res.status(201).json({ success: true, data: window });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed" });
  }
}) as any);

// Cancel scheduled window
router.delete("/:id", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    maintenanceService.cancelWindow(req.params.id);
    activityLog.log(req.appUser?.email || "unknown", "maintenance.cancel", "maintenance", req.params.id);
    res.json({ success: true, message: "Cancelled" });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed" });
  }
}) as any);

export default router;
