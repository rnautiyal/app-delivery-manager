import { Router, Request, Response } from "express";
import { AfdService } from "../services/afdService";
import { logger } from "../config/logger";

const router = Router();
const afdService = new AfdService();

// List all AFD profiles
router.get("/:subscriptionId", async (req: Request, res: Response) => {
  try {
    const profiles = await afdService.listProfiles(req.params.subscriptionId);
    res.json({ success: true, data: profiles });
  } catch (error) {
    logger.error("Failed to list AFD profiles", { error });
    res.status(500).json({ success: false, error: "Failed to list AFD profiles" });
  }
});

// Get single AFD profile
router.get("/:subscriptionId/:resourceGroup/:profileName", async (req: Request, res: Response) => {
  try {
    const profile = await afdService.getProfile(req.params.subscriptionId, req.params.resourceGroup, req.params.profileName);
    res.json({ success: true, data: profile });
  } catch (error) {
    logger.error("Failed to get AFD profile", { error });
    res.status(500).json({ success: false, error: "Failed to get AFD profile" });
  }
});

// List endpoints for a profile
router.get("/:subscriptionId/:resourceGroup/:profileName/endpoints", async (req: Request, res: Response) => {
  try {
    const endpoints = await afdService.listEndpoints(req.params.subscriptionId, req.params.resourceGroup, req.params.profileName);
    res.json({ success: true, data: endpoints });
  } catch (error) {
    logger.error("Failed to list AFD endpoints", { error });
    res.status(500).json({ success: false, error: "Failed to list AFD endpoints" });
  }
});

// List origin groups for a profile
router.get("/:subscriptionId/:resourceGroup/:profileName/origin-groups", async (req: Request, res: Response) => {
  try {
    const groups = await afdService.listOriginGroups(req.params.subscriptionId, req.params.resourceGroup, req.params.profileName);
    res.json({ success: true, data: groups });
  } catch (error) {
    logger.error("Failed to list AFD origin groups", { error });
    res.status(500).json({ success: false, error: "Failed to list AFD origin groups" });
  }
});

// List custom domains for a profile
router.get("/:subscriptionId/:resourceGroup/:profileName/custom-domains", async (req: Request, res: Response) => {
  try {
    const domains = await afdService.listCustomDomains(req.params.subscriptionId, req.params.resourceGroup, req.params.profileName);
    res.json({ success: true, data: domains });
  } catch (error) {
    logger.error("Failed to list AFD custom domains", { error });
    res.status(500).json({ success: false, error: "Failed to list AFD custom domains" });
  }
});

// List routes for an endpoint
router.get("/:subscriptionId/:resourceGroup/:profileName/endpoints/:endpointName/routes", async (req: Request, res: Response) => {
  try {
    const routes = await afdService.listRoutes(req.params.subscriptionId, req.params.resourceGroup, req.params.profileName, req.params.endpointName);
    res.json({ success: true, data: routes });
  } catch (error) {
    logger.error("Failed to list AFD routes", { error });
    res.status(500).json({ success: false, error: "Failed to list AFD routes" });
  }
});

// Purge endpoint content
router.post("/:subscriptionId/:resourceGroup/:profileName/endpoints/:endpointName/purge", async (req: Request, res: Response) => {
  try {
    const { contentPaths } = req.body;
    await afdService.purgeEndpoint(req.params.subscriptionId, req.params.resourceGroup, req.params.profileName, req.params.endpointName, contentPaths || ["/*"]);
    res.json({ success: true, message: "Purge initiated" });
  } catch (error) {
    logger.error("Failed to purge AFD endpoint", { error });
    res.status(500).json({ success: false, error: "Failed to purge AFD endpoint" });
  }
});

// Delete AFD profile
router.delete("/:subscriptionId/:resourceGroup/:profileName", async (req: Request, res: Response) => {
  try {
    await afdService.deleteProfile(req.params.subscriptionId, req.params.resourceGroup, req.params.profileName);
    res.json({ success: true, message: "Profile deleted" });
  } catch (error) {
    logger.error("Failed to delete AFD profile", { error });
    res.status(500).json({ success: false, error: "Failed to delete AFD profile" });
  }
});

// Create full AFD profile (profile + endpoint + origin group + origin + route)
router.post("/:subscriptionId/create", async (req: Request, res: Response) => {
  try {
    const result = await afdService.createFullProfile(req.params.subscriptionId, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error("Failed to create AFD profile", { error });
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
