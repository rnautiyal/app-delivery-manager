import { Router, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { ActivityLogService } from "../services/activityLogService";

const router = Router();
const activityLogService = new ActivityLogService();

router.get("/", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, limit, actionType } = req.query;
    const entries = activityLogService.getLog(
      subscriptionId as string | undefined,
      limit ? parseInt(limit as string, 10) : undefined,
      actionType as string | undefined
    );
    res.json({ success: true, data: entries });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get activity log",
    });
  }
}) as any);

export default router;
