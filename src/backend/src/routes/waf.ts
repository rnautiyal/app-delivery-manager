import { Router, Response } from "express";
import { WafService } from "../services/wafService";
import { AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const wafService = new WafService();

// List all WAF policies
router.get("/:subscriptionId", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const policies = await wafService.listWafPolicies(req.params.subscriptionId);
    res.json({ success: true, data: policies });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to list WAF policies",
    });
  }
}) as any);

// Get a specific WAF policy
router.get("/:subscriptionId/:resourceGroup/:policyName", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, policyName } = req.params;
    const policy = await wafService.getWafPolicy(subscriptionId, resourceGroup, policyName);
    res.json({ success: true, data: policy });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get WAF policy",
    });
  }
}) as any);

// Create or update WAF policy
router.put("/:subscriptionId/:resourceGroup/:policyName", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, policyName } = req.params;
    const policy = await wafService.createOrUpdateWafPolicy(subscriptionId, resourceGroup, policyName, req.body);
    res.json({ success: true, data: policy });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to create/update WAF policy",
    });
  }
}) as any);

// Delete WAF policy
router.delete("/:subscriptionId/:resourceGroup/:policyName", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, policyName } = req.params;
    await wafService.deleteWafPolicy(subscriptionId, resourceGroup, policyName);
    res.json({ success: true, message: "WAF policy deleted successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete WAF policy",
    });
  }
}) as any);

export default router;
