import { Router, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { AwsAlbService } from "../services/awsAlbService";

const router = Router();
const awsAlbService = new AwsAlbService();

// Check AWS connection status
router.get("/status", (async (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    data: {
      configured: awsAlbService.isConfigured(),
      regions: awsAlbService.getRegions(),
    },
  });
}) as any);

// List ALBs across all configured regions
router.get("/albs", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!awsAlbService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: "AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY env vars.",
      });
    }
    const region = req.query.region as string | undefined;
    const albs = region
      ? await awsAlbService.listAlbs(region)
      : await awsAlbService.listAlbsAcrossRegions();
    res.json({ success: true, data: albs });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to list ALBs",
    });
  }
}) as any);

// Get ALB details (listeners, target groups, target health)
router.get("/albs/:region/details", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const arn = req.query.arn as string;
    if (!arn) return res.status(400).json({ success: false, error: "ARN required" });
    const details = await awsAlbService.getAlbDetails(req.params.region, arn);
    res.json({ success: true, data: details });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get ALB details",
    });
  }
}) as any);

export default router;
