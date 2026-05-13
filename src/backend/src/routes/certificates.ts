import { Router, Response } from "express";
import { CertificateService } from "../services/certificateService";
import { CertGenService } from "../services/certGenService";
import { ActivityLogService } from "../services/activityLogService";
import { AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const certService = new CertificateService();
const certGenService = new CertGenService();
const activityLog = new ActivityLogService();

// List all certificates across gateways
router.get("/:subscriptionId", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const certs = await certService.listCertificatesAcrossGateways(req.params.subscriptionId);
    res.json({ success: true, data: certs });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to list certificates",
    });
  }
}) as any);

// Get expiring certificates
router.get("/:subscriptionId/expiring", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const certs = await certService.getExpiringCertificates(req.params.subscriptionId, days);
    res.json({ success: true, data: certs });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get expiring certificates",
    });
  }
}) as any);

// Generate self-signed certificate
router.post("/generate", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { commonName, daysValid } = req.body;
    if (!commonName) {
      return res.status(400).json({ success: false, error: "commonName is required" });
    }
    const cert = certGenService.generateSelfSignedCert(commonName, daysValid || 365);
    activityLog.log(
      req.appUser?.email || "unknown",
      "cert.generate",
      "certificate",
      commonName,
      undefined,
      `Self-signed cert generated for ${commonName}, valid ${daysValid || 365} days`
    );
    res.json({ success: true, data: { ...cert, commonName, daysValid: daysValid || 365 } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate certificate",
    });
  }
}) as any);

export default router;
