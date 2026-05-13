import { Router, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { TemplateService } from "../services/templateService";
import { ActivityLogService } from "../services/activityLogService";

const router = Router();
const templateService = new TemplateService();
const activityLog = new ActivityLogService();

// Save template from gateway
router.post("/", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, gatewayName, name, description } = req.body;
    if (!subscriptionId || !resourceGroup || !gatewayName || !name) {
      return res.status(400).json({ success: false, error: "Missing required fields: subscriptionId, resourceGroup, gatewayName, name" });
    }
    const template = await templateService.saveTemplate(
      subscriptionId, resourceGroup, gatewayName, name, description || "",
      req.appUser?.email || "unknown"
    );
    activityLog.log(req.appUser?.email || "unknown", "template.save", "template", name, subscriptionId, `From gateway ${gatewayName}`);
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to save template" });
  }
}) as any);

// List all templates
router.get("/", (async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const templates = templateService.listTemplates();
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to list templates" });
  }
}) as any);

// Get template detail
router.get("/:id", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const template = templateService.getTemplate(req.params.id);
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to get template" });
  }
}) as any);

// Delete template
router.delete("/:id", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    templateService.deleteTemplate(req.params.id);
    activityLog.log(req.appUser?.email || "unknown", "template.delete", "template", req.params.id);
    res.json({ success: true, message: "Template deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to delete template" });
  }
}) as any);

// Apply template to a gateway
router.post("/:id/apply", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, gatewayName } = req.body;
    if (!subscriptionId || !resourceGroup || !gatewayName) {
      return res.status(400).json({ success: false, error: "Missing required fields: subscriptionId, resourceGroup, gatewayName" });
    }
    const result = await templateService.applyTemplate(req.params.id, subscriptionId, resourceGroup, gatewayName);
    activityLog.log(req.appUser?.email || "unknown", "template.apply", "template", req.params.id, subscriptionId, `Applied to ${gatewayName}`);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to apply template" });
  }
}) as any);

// Export template as JSON
// Export as ARM template
router.get("/:id/export/arm", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const arm = templateService.exportAsArm(req.params.id);
    res.json({ success: true, data: arm });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to export ARM template" });
  }
}) as any);

// Export as Bicep
router.get("/:id/export/bicep", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bicep = templateService.exportAsBicep(req.params.id);
    res.json({ success: true, data: { content: bicep, format: "bicep" } });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to export Bicep" });
  }
}) as any);

// Export as Terraform
router.get("/:id/export/terraform", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tf = templateService.exportAsTerraform(req.params.id);
    res.json({ success: true, data: { content: tf, format: "terraform" } });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to export Terraform" });
  }
}) as any);

// Export template as JSON
router.get("/:id/export", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const exported = templateService.exportTemplate(req.params.id);
    res.json({ success: true, data: exported });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to export template" });
  }
}) as any);

// Import template from JSON
router.post("/import", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { template } = req.body;
    if (!template) {
      return res.status(400).json({ success: false, error: "Template data is required" });
    }
    const imported = templateService.importTemplate({ template });
    activityLog.log(req.appUser?.email || "unknown", "template.import", "template", imported.name);
    res.status(201).json({ success: true, data: imported });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to import template" });
  }
}) as any);

// Get template versions
router.get("/:id/versions", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const versions = templateService.getTemplateVersions(req.params.id);
    res.json({ success: true, data: versions });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to get versions" });
  }
}) as any);

// Restore a specific template version
router.post("/:id/versions/:versionIndex/restore", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const versionIndex = parseInt(req.params.versionIndex);
    const restored = templateService.restoreTemplateVersion(req.params.id, versionIndex);
    activityLog.log(req.appUser?.email || "unknown", "template.restore_version", "template", req.params.id);
    res.json({ success: true, data: restored });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to restore version" });
  }
}) as any);

// Deploy template as new gateway via ARM
router.post("/:id/deploy", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, gatewayName, location } = req.body;
    if (!subscriptionId || !resourceGroup || !gatewayName || !location) {
      return res.status(400).json({ success: false, error: "Missing required fields: subscriptionId, resourceGroup, gatewayName, location" });
    }
    const result = await templateService.deployNew(req.params.id, subscriptionId, resourceGroup, gatewayName, location);
    activityLog.log(
      req.appUser?.email || "unknown", "template.deploy_new", "gateway",
      gatewayName, subscriptionId, `Deployed from template to ${resourceGroup} in ${location}`
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to deploy gateway" });
  }
}) as any);

export default router;
