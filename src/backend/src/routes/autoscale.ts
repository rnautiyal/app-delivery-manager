import { Router, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { AutoscaleService } from "../services/autoscaleService";
import { ActivityLogService } from "../services/activityLogService";

const router = Router();
const autoscaleService = new AutoscaleService();
const activityLog = new ActivityLogService();

router.get("/", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schedules = autoscaleService.listSchedules(req.query.subscriptionId as string | undefined);
    res.json({ success: true, data: schedules });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed" });
  }
}) as any);

router.post("/", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schedule = autoscaleService.createSchedule({
      ...req.body,
      enabled: req.body.enabled !== false,
      createdBy: req.appUser?.email || "unknown",
    });
    activityLog.log(req.appUser?.email || "unknown", "autoscale.create", "autoscale", schedule.name, schedule.subscriptionId, `${schedule.gatewayNames.length} gateways`);
    res.status(201).json({ success: true, data: schedule });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed" });
  }
}) as any);

router.patch("/:id/toggle", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schedule = autoscaleService.toggleSchedule(req.params.id, req.body.enabled);
    res.json({ success: true, data: schedule });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed" });
  }
}) as any);

router.delete("/:id", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    autoscaleService.deleteSchedule(req.params.id);
    activityLog.log(req.appUser?.email || "unknown", "autoscale.delete", "autoscale", req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed" });
  }
}) as any);

export default router;
