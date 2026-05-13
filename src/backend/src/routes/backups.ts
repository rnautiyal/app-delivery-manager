import { Router, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { BackupService } from "../services/backupService";
import { ActivityLogService } from "../services/activityLogService";

const router = Router();
const backupService = new BackupService();
const activityLog = new ActivityLogService();

// Create backup
router.post("/", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, gatewayName, description } = req.body;
    if (!subscriptionId || !resourceGroup || !gatewayName) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }
    const backup = await backupService.createBackup(
      subscriptionId, resourceGroup, gatewayName,
      req.appUser?.email || "unknown", description
    );
    activityLog.log(req.appUser?.email || "unknown", "backup.create", "backup", gatewayName, subscriptionId);
    res.status(201).json({ success: true, data: backup });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to create backup" });
  }
}) as any);

// List backups
router.get("/", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const backups = backupService.listBackups(
      req.query.subscriptionId as string | undefined,
      req.query.gatewayName as string | undefined
    );
    res.json({ success: true, data: backups });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to list backups" });
  }
}) as any);

// Get backup
router.get("/:id", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const backup = backupService.getBackup(req.params.id);
    res.json({ success: true, data: backup });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to get backup" });
  }
}) as any);

// Restore backup
router.post("/:id/restore", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await backupService.restoreBackup(req.params.id);
    activityLog.log(req.appUser?.email || "unknown", "backup.restore", "backup", req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    const errCode = (error as any)?.code;
    const errDetails = (error as any)?.details;
    require("../config/logger").logger.error("Restore backup failed", {
      backupId: req.params.id,
      error: errMsg,
      code: errCode,
      details: errDetails,
      stack: errStack,
    });
    res.status(500).json({ success: false, error: errMsg, code: errCode });
  }
}) as any);

// Delete backup
router.delete("/:id", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    backupService.deleteBackup(req.params.id);
    activityLog.log(req.appUser?.email || "unknown", "backup.delete", "backup", req.params.id);
    res.json({ success: true, message: "Backup deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to delete backup" });
  }
}) as any);

// Compare two backups
router.get("/compare/:id1/:id2", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = backupService.compareBackups(req.params.id1, req.params.id2);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to compare backups" });
  }
}) as any);

// Compare backup with live gateway config
router.get("/:id/compare-live", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await backupService.compareWithLive(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to compare with live" });
  }
}) as any);

export default router;
