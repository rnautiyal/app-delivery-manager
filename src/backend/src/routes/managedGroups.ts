import { Router, Request, Response } from "express";
import { ManagedGroupService } from "../services/managedGroupService";
import { ConfigSyncService } from "../services/configSyncService";

const router = Router();
const service = new ManagedGroupService();
const syncService = new ConfigSyncService();

// List groups (optionally filter by subscription)
router.get("/", (req: Request, res: Response) => {
  const subscriptionId = req.query.subscriptionId as string | undefined;
  const groups = service.listGroups(subscriptionId);
  res.json({ success: true, data: groups });
});

// Get single group
router.get("/:id", (req: Request, res: Response) => {
  const group = service.getGroup(req.params.id);
  if (!group) { res.status(404).json({ success: false, error: "Group not found" }); return; }
  res.json({ success: true, data: group });
});

// Create group
router.post("/", (req: Request, res: Response) => {
  try {
    const group = service.createGroup(req.body);
    res.status(201).json({ success: true, data: group });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Update group
router.put("/:id", (req: Request, res: Response) => {
  try {
    const group = service.updateGroup(req.params.id, req.body);
    res.json({ success: true, data: group });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Delete group
router.delete("/:id", (req: Request, res: Response) => {
  try {
    service.deleteGroup(req.params.id);
    res.json({ success: true, message: "Group deleted" });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Add resource to group
router.post("/:id/resources", (req: Request, res: Response) => {
  try {
    const { resourceType, resourceId } = req.body;
    const group = service.addResource(req.params.id, resourceType, resourceId);
    res.json({ success: true, data: group });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Remove resource from group
router.delete("/:id/resources", (req: Request, res: Response) => {
  try {
    const { resourceType, resourceId } = req.body;
    const group = service.removeResource(req.params.id, resourceType, resourceId);
    res.json({ success: true, data: group });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Set master gateway
router.post("/:id/master", (req: Request, res: Response) => {
  try {
    const { gatewayId } = req.body;
    const group = service.setMaster(req.params.id, gatewayId);
    res.json({ success: true, data: group });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Update sync config
router.put("/:id/sync-config", (req: Request, res: Response) => {
  try {
    const group = service.updateSyncConfig(req.params.id, req.body);
    res.json({ success: true, data: group });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Trigger sync from master to slaves
router.post("/:id/sync", async (req: Request, res: Response) => {
  try {
    const result = await syncService.syncGroup(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Preview sync (diff before applying)
router.get("/:id/sync-preview", async (req: Request, res: Response) => {
  try {
    const diffs = await syncService.previewSync(req.params.id);
    res.json({ success: true, data: diffs });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Get sync history
router.get("/:id/sync-history", (req: Request, res: Response) => {
  const history = syncService.getSyncHistory(req.params.id);
  res.json({ success: true, data: history });
});

export default router;
