import { Router, Response } from "express";
import { GatewayService } from "../services/gatewayService";
import { ActivityLogService } from "../services/activityLogService";
import { AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const gatewayService = new GatewayService();
const activityLog = new ActivityLogService();

// List all gateways for a subscription
router.get("/:subscriptionId", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gateways = await gatewayService.listGateways(req.params.subscriptionId);
    res.json({ success: true, data: gateways });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to list gateways",
    });
  }
}) as any);

// Get a specific gateway
router.get("/:subscriptionId/:resourceGroup/:gatewayName", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, gatewayName } = req.params;
    const gateway = await gatewayService.getGateway(subscriptionId, resourceGroup, gatewayName);

    const parsed = {
      backendPools: gatewayService.getBackendPools(gateway),
      httpSettings: gatewayService.getHttpSettings(gateway),
      listeners: gatewayService.getListeners(gateway),
      routingRules: gatewayService.getRoutingRules(gateway),
      healthProbes: gatewayService.getHealthProbes(gateway),
    };
    const details = {
      ...gateway,
      ...parsed,
      _parsed: parsed,
    };

    res.json({ success: true, data: details });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get gateway",
    });
  }
}) as any);

// Create a new gateway
router.post("/:subscriptionId/:resourceGroup/:gatewayName", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, gatewayName } = req.params;
    const gateway = await gatewayService.createGateway(subscriptionId, resourceGroup, gatewayName, req.body);
    activityLog.log(req.appUser?.email || "unknown", "gateway.create", "gateway", gatewayName, subscriptionId);
    res.status(201).json({ success: true, data: gateway });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to create gateway",
    });
  }
}) as any);

// Delete a gateway
router.delete("/:subscriptionId/:resourceGroup/:gatewayName", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, gatewayName } = req.params;
    await gatewayService.deleteGateway(subscriptionId, resourceGroup, gatewayName);
    activityLog.log(req.appUser?.email || "unknown", "gateway.delete", "gateway", gatewayName, subscriptionId);
    res.json({ success: true, message: "Gateway deleted successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete gateway",
    });
  }
}) as any);

// Start a gateway
router.post("/:subscriptionId/:resourceGroup/:gatewayName/start", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, gatewayName } = req.params;
    await gatewayService.startGateway(subscriptionId, resourceGroup, gatewayName);
    activityLog.log(req.appUser?.email || "unknown", "gateway.start", "gateway", gatewayName, subscriptionId);
    res.json({ success: true, message: "Gateway started successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to start gateway",
    });
  }
}) as any);

// Stop a gateway
router.post("/:subscriptionId/:resourceGroup/:gatewayName/stop", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, gatewayName } = req.params;
    await gatewayService.stopGateway(subscriptionId, resourceGroup, gatewayName);
    activityLog.log(req.appUser?.email || "unknown", "gateway.stop", "gateway", gatewayName, subscriptionId);
    res.json({ success: true, message: "Gateway stopped successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to stop gateway",
    });
  }
}) as any);

// Add HTTPS listener with certificate
router.post("/:subscriptionId/:resourceGroup/:gatewayName/https-listener", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, gatewayName } = req.params;
    const { certData, certPassword, certName, listenerName, port, hostName } = req.body;
    if (!certData || !certPassword) {
      return res.status(400).json({ success: false, error: "certData and certPassword are required" });
    }
    const result = await gatewayService.addHttpsListener(
      subscriptionId, resourceGroup, gatewayName,
      certData, certPassword,
      certName || `ssl-cert-${Date.now()}`,
      listenerName || "httpsListener",
      port || 443,
      hostName
    );
    activityLog.log(req.appUser?.email || "unknown", "gateway.https-listener", "gateway", gatewayName, subscriptionId, `Added HTTPS listener ${listenerName || "httpsListener"}`);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to add HTTPS listener",
    });
  }
}) as any);

// Check DDoS protection
router.get("/:subscriptionId/:resourceGroup/:gatewayName/ddos", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, gatewayName } = req.params;
    const ddos = await gatewayService.checkDdosProtection(subscriptionId, resourceGroup, gatewayName);
    res.json({ success: true, data: ddos });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to check DDoS protection",
    });
  }
}) as any);

// Enable DDoS protection on gateway's VNet
router.post("/:subscriptionId/:resourceGroup/:gatewayName/ddos/enable", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, gatewayName } = req.params;
    const result = await gatewayService.enableDdosProtection(subscriptionId, resourceGroup, gatewayName);
    res.json({ success: result.success, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to enable DDoS protection",
    });
  }
}) as any);

// Disable DDoS protection on gateway's VNet
router.post("/:subscriptionId/:resourceGroup/:gatewayName/ddos/disable", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, gatewayName } = req.params;
    const result = await gatewayService.disableDdosProtection(subscriptionId, resourceGroup, gatewayName);
    res.json({ success: result.success, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to disable DDoS protection",
    });
  }
}) as any);

// Enable VNet encryption on gateway's VNet
router.post("/:subscriptionId/:resourceGroup/:gatewayName/vnet-encryption/enable", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, gatewayName } = req.params;
    const result = await gatewayService.enableVnetEncryption(subscriptionId, resourceGroup, gatewayName);
    res.json({ success: result.success, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to enable VNet encryption",
    });
  }
}) as any);

// Disable VNet encryption on gateway's VNet
router.post("/:subscriptionId/:resourceGroup/:gatewayName/vnet-encryption/disable", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, gatewayName } = req.params;
    const result = await gatewayService.disableVnetEncryption(subscriptionId, resourceGroup, gatewayName);
    res.json({ success: result.success, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to disable VNet encryption",
    });
  }
}) as any);

// Get backend health
router.get("/:subscriptionId/:resourceGroup/:gatewayName/health", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId, resourceGroup, gatewayName } = req.params;
    const health = await gatewayService.getBackendHealth(subscriptionId, resourceGroup, gatewayName);
    res.json({ success: true, data: health });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get backend health",
    });
  }
}) as any);

export default router;
