import { Router, Response } from "express";
import { DiagnosticService } from "../services/diagnosticService";
import { AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const diagnosticService = new DiagnosticService();

// Run full diagnostics
router.get("/:subscriptionId/:resourceGroup/:gatewayName", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, gatewayName } = req.params;
    const results = await diagnosticService.runFullDiagnostics(subscriptionId, resourceGroup, gatewayName);

    const summary = {
      total: results.length,
      passed: results.filter((r) => r.status === "pass").length,
      warnings: results.filter((r) => r.status === "warn").length,
      failed: results.filter((r) => r.status === "fail").length,
    };

    res.json({ success: true, data: { summary, results } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to run diagnostics",
    });
  }
}) as any);

export default router;
