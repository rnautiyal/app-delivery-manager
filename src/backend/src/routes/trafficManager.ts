import { Router, Response } from "express";
import { TrafficManagerService } from "../services/trafficManagerService";
import { tmHealthMonitor } from "../services/tmHealthMonitor";
import { AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const trafficManagerService = new TrafficManagerService();

// List all Traffic Manager profiles in a subscription
router.get("/:subscriptionId", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profiles = await trafficManagerService.listProfiles(req.params.subscriptionId);
    res.json({ success: true, data: profiles });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to list Traffic Manager profiles",
    });
  }
}) as any);

// Get a specific Traffic Manager profile
router.get("/:subscriptionId/:resourceGroup/:profileName", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, profileName } = req.params;
    const profile = await trafficManagerService.getProfile(subscriptionId, resourceGroup, profileName);
    res.json({ success: true, data: profile });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get Traffic Manager profile",
    });
  }
}) as any);

// Get endpoints for a Traffic Manager profile
router.get("/:subscriptionId/:resourceGroup/:profileName/endpoints", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, profileName } = req.params;
    const endpoints = await trafficManagerService.getEndpoints(subscriptionId, resourceGroup, profileName);
    res.json({ success: true, data: endpoints });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get Traffic Manager endpoints",
    });
  }
}) as any);

// Enable a Traffic Manager profile
router.post("/:subscriptionId/:resourceGroup/:profileName/enable", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, profileName } = req.params;
    await trafficManagerService.enableProfile(subscriptionId, resourceGroup, profileName);
    res.json({ success: true, message: "Profile enabled" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to enable profile" });
  }
}) as any);

// Disable a Traffic Manager profile
router.post("/:subscriptionId/:resourceGroup/:profileName/disable", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, profileName } = req.params;
    await trafficManagerService.disableProfile(subscriptionId, resourceGroup, profileName);
    res.json({ success: true, message: "Profile disabled" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to disable profile" });
  }
}) as any);

// Update routing method
router.post("/:subscriptionId/:resourceGroup/:profileName/routing-method", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, profileName } = req.params;
    const { routingMethod } = req.body;
    await trafficManagerService.updateRoutingMethod(subscriptionId, resourceGroup, profileName, routingMethod);
    res.json({ success: true, message: `Routing method updated to ${routingMethod}` });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update routing method" });
  }
}) as any);

// Delete a Traffic Manager profile
router.delete("/:subscriptionId/:resourceGroup/:profileName", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, profileName } = req.params;
    await trafficManagerService.deleteProfile(subscriptionId, resourceGroup, profileName);
    res.json({ success: true, message: "Profile deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to delete profile" });
  }
}) as any);

// Add a failover endpoint (created in Disabled state)
router.post("/:subscriptionId/:resourceGroup/:profileName/endpoints/failover", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, profileName } = req.params;
    const { name, target, targetResourceId, type, priority, weight, endpointLocation } = req.body;
    if (!name || !type || (!target && !targetResourceId)) {
      res.status(400).json({ success: false, error: "name, type, and target (or targetResourceId) are required" });
      return;
    }
    await trafficManagerService.addFailoverEndpoint(subscriptionId, resourceGroup, profileName, { name, target, type, priority, weight, targetResourceId, endpointLocation });
    res.json({ success: true, message: "Failover endpoint added (disabled until needed)" });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to add failover endpoint" });
  }
}) as any);

// Check endpoints and auto-enable failover if primary is faulty
router.post("/:subscriptionId/:resourceGroup/:profileName/check-failover", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, profileName } = req.params;
    const result = await trafficManagerService.checkAndFailover(subscriptionId, resourceGroup, profileName);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to check failover" });
  }
}) as any);

// Enable an endpoint
router.post("/:subscriptionId/:resourceGroup/:profileName/endpoints/:endpointType/:endpointName/enable", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, profileName, endpointType, endpointName } = req.params;
    await trafficManagerService.enableEndpoint(subscriptionId, resourceGroup, profileName, endpointType, endpointName);
    res.json({ success: true, message: "Endpoint enabled" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to enable endpoint" });
  }
}) as any);

// Disable an endpoint
router.post("/:subscriptionId/:resourceGroup/:profileName/endpoints/:endpointType/:endpointName/disable", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, profileName, endpointType, endpointName } = req.params;
    await trafficManagerService.disableEndpoint(subscriptionId, resourceGroup, profileName, endpointType, endpointName);
    res.json({ success: true, message: "Endpoint disabled" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to disable endpoint" });
  }
}) as any);

// ── Auto-failover health monitor routes ──

// Get monitor status
router.get("/monitor/status", ((_req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    data: {
      running: tmHealthMonitor.isRunning(),
      profiles: tmHealthMonitor.getMonitoredProfiles(),
      recentEvents: tmHealthMonitor.getFailoverHistory().slice(-20),
    },
  });
}) as any);

// Start the monitor
router.post("/monitor/start", ((req: AuthenticatedRequest, res: Response) => {
  const intervalMs = req.body.intervalMs || 60000;
  tmHealthMonitor.start(intervalMs);
  res.json({ success: true, message: `Health monitor started (interval: ${intervalMs}ms)` });
}) as any);

// Stop the monitor
router.post("/monitor/stop", ((_req: AuthenticatedRequest, res: Response) => {
  tmHealthMonitor.stop();
  res.json({ success: true, message: "Health monitor stopped" });
}) as any);

// Add a profile to monitor
router.post("/monitor/profiles", ((req: AuthenticatedRequest, res: Response) => {
  const { subscriptionId, resourceGroup, profileName } = req.body;
  if (!subscriptionId || !resourceGroup || !profileName) {
    res.status(400).json({ success: false, error: "subscriptionId, resourceGroup, and profileName are required" });
    return;
  }
  tmHealthMonitor.addProfile(subscriptionId, resourceGroup, profileName);
  // Auto-start if not running
  if (!tmHealthMonitor.isRunning()) {
    tmHealthMonitor.start();
  }
  res.json({ success: true, message: `Now monitoring "${profileName}" for auto-failover` });
}) as any);

// Remove a profile from monitor
router.post("/monitor/profiles/remove", ((req: AuthenticatedRequest, res: Response) => {
  const { subscriptionId, resourceGroup, profileName } = req.body;
  if (!subscriptionId || !resourceGroup || !profileName) {
    res.status(400).json({ success: false, error: "subscriptionId, resourceGroup, and profileName are required" });
    return;
  }
  tmHealthMonitor.removeProfile(subscriptionId, resourceGroup, profileName);
  res.json({ success: true, message: `Stopped monitoring "${profileName}"` });
}) as any);

// Get failover history
router.get("/monitor/history", ((_req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, data: tmHealthMonitor.getFailoverHistory() });
}) as any);

export default router;
