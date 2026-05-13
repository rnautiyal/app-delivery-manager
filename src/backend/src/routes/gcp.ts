import { Router, Request, Response } from "express";
import { GcpLbService } from "../services/gcpLbService";
import { logger } from "../config/logger";
import fs from "fs";
import path from "path";

const router = Router();
const gcpService = new GcpLbService();

// Upload GCP credentials
router.post("/credentials", (req: Request, res: Response) => {
  try {
    const dataDir = process.env.DATA_DIR || path.join(__dirname, "../../data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const credFile = path.join(dataDir, "gcp-credentials.json");
    fs.writeFileSync(credFile, JSON.stringify(req.body, null, 2), "utf-8");
    logger.info("GCP credentials saved");
    res.json({ success: true, message: "GCP credentials saved" });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Check if GCP is configured
router.get("/status", (_req: Request, res: Response) => {
  res.json({ success: true, data: { configured: gcpService.isConfigured(), projectId: process.env.GCP_PROJECT_ID || "" } });
});

// List all GCP load balancers
router.get("/load-balancers", async (_req: Request, res: Response) => {
  if (!gcpService.isConfigured()) {
    res.status(400).json({ success: false, error: "GCP not configured. Set GCP_PROJECT_ID and GCP_CREDENTIALS_JSON." });
    return;
  }
  try {
    const lbs = await gcpService.listLoadBalancers();
    res.json({ success: true, data: lbs });
  } catch (error) {
    logger.error("Failed to list GCP LBs", { error });
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Get single LB detail
router.get("/load-balancers/:name", async (req: Request, res: Response) => {
  try {
    const detail = await gcpService.getLoadBalancerDetail(req.params.name);
    res.json({ success: true, data: detail });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
