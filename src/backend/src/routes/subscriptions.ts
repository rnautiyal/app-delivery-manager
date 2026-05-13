import { Router, Response } from "express";
import { SubscriptionService } from "../services/subscriptionService";
import { AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const subscriptionService = new SubscriptionService();

router.get("/", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const subscriptions = await subscriptionService.listSubscriptions();
    res.json({ success: true, data: subscriptions });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to list subscriptions",
    });
  }
}) as any);

export default router;
