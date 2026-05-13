import { Router, Response } from "express";
import { FirewallService } from "../services/firewallService";
import { AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const firewallService = new FirewallService();

// List all Azure Firewalls
router.get("/firewalls/:subscriptionId", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const firewalls = await firewallService.listFirewalls(req.params.subscriptionId);
    res.json({ success: true, data: firewalls });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to list firewalls" });
  }
}) as any);

// List all Firewall Policies
router.get("/policies/:subscriptionId", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const policies = await firewallService.listFirewallPolicies(req.params.subscriptionId);
    res.json({ success: true, data: policies });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to list firewall policies" });
  }
}) as any);

// Get rule collection groups for a policy
router.get("/policies/:subscriptionId/:resourceGroup/:policyName/rules", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, policyName } = req.params;
    const groups = await firewallService.getFirewallPolicyRuleGroups(subscriptionId, resourceGroup, policyName);
    res.json({ success: true, data: groups });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to list rule groups" });
  }
}) as any);

export default router;
