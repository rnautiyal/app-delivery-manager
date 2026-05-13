import { Router, Request, Response } from "express";
import { BillingService } from "../services/billingService";
import { AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const billingService = new BillingService();

// Get all plans
router.get("/plans", (_req: Request, res: Response) => {
  res.json({ success: true, data: billingService.getPlans() });
});

// Get current user's billing summary
router.get("/summary", (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.appUser?.oid || "anonymous";
  const userName = authReq.appUser?.name || "User";
  const summary = billingService.getBillingSummary(userId, userName);
  res.json({ success: true, data: summary });
});

// Change plan
router.post("/change-plan", (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.appUser?.oid || "anonymous";
  const userName = authReq.appUser?.name || "User";
  try {
    const account = billingService.changePlan(userId, userName, req.body.planId);
    res.json({ success: true, data: account });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Admin: get all accounts
router.get("/accounts", (_req: Request, res: Response) => {
  const accounts = billingService.getAllAccounts();
  res.json({ success: true, data: accounts });
});

export default router;
