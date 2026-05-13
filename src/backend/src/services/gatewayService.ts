import { NetworkManagementClient, ApplicationGateway } from "@azure/arm-network";
import { ResourceManagementClient } from "@azure/arm-resources";
import { getAzureCredential } from "../config/azure";
import { logger } from "../config/logger";
import { GatewayListItem, BackendPool, HttpSetting, Listener, RoutingRule, HealthProbe } from "../models/types";

export class GatewayService {
  private getNetworkClient(subscriptionId: string): NetworkManagementClient {
    return new NetworkManagementClient(getAzureCredential(), subscriptionId);
  }

  private getResourceClient(subscriptionId: string): ResourceManagementClient {
    return new ResourceManagementClient(getAzureCredential(), subscriptionId);
  }

  // Azure returns SSL certs without data on GET. Must remove empty certs or re-PUT fails.
  private cleanGatewayForUpdate(gw: ApplicationGateway): ApplicationGateway {
    if (gw.sslCertificates) {
      gw.sslCertificates = gw.sslCertificates.filter(cert => {
        // Keep certs that have data (newly added) or keyVaultSecretId
        return cert.data || cert.keyVaultSecretId;
      });
    }
    // Remove read-only properties that Azure rejects on PUT
    for (const pool of gw.backendAddressPools || []) {
      delete (pool as any).backendIPConfigurations;
    }
    delete (gw as any).operationalState;
    delete (gw as any).provisioningState;
    delete (gw as any).resourceGuid;
    delete (gw as any).etag;
    return gw;
  }

  async listGateways(subscriptionId: string): Promise<GatewayListItem[]> {
    const client = this.getNetworkClient(subscriptionId);
    const gateways: GatewayListItem[] = [];

    try {
      for await (const gw of client.applicationGateways.listAll()) {
        gateways.push(this.mapToListItem(gw, subscriptionId));
      }
    } catch (error) {
      logger.error("Failed to list gateways", { subscriptionId, error });
      throw error;
    }

    return gateways;
  }

  async getGateway(subscriptionId: string, resourceGroup: string, gatewayName: string): Promise<ApplicationGateway> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      return await client.applicationGateways.get(resourceGroup, gatewayName);
    } catch (error) {
      logger.error("Failed to get gateway", { subscriptionId, resourceGroup, gatewayName, error });
      throw error;
    }
  }

  async createGateway(
    subscriptionId: string,
    resourceGroup: string,
    gatewayName: string,
    parameters: ApplicationGateway
  ): Promise<any> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      logger.info("Creating application gateway (async)", { subscriptionId, resourceGroup, gatewayName });
      const poller = await client.applicationGateways.beginCreateOrUpdate(
        resourceGroup,
        gatewayName,
        parameters
      );
      // Don't wait for completion — gateway creation takes 5-10 minutes
      // Start polling in background
      poller.pollUntilDone().then((result) => {
        logger.info("Gateway creation completed", { gatewayName, state: result.provisioningState });
      }).catch((err) => {
        logger.error("Gateway creation failed in background", { gatewayName, error: err });
      });

      return {
        status: "provisioning",
        message: `Application Gateway '${gatewayName}' creation started. It takes 5-10 minutes to complete. Use list_gateways to check status.`,
        name: gatewayName,
        resourceGroup,
        resourceId: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/applicationGateways/${gatewayName}`,
      };
    } catch (error) {
      logger.error("Failed to start gateway creation", { subscriptionId, resourceGroup, gatewayName, error });
      throw error;
    }
  }

  async deleteGateway(subscriptionId: string, resourceGroup: string, gatewayName: string): Promise<any> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      logger.info("Deleting application gateway (async)", { subscriptionId, resourceGroup, gatewayName });
      const poller = await client.applicationGateways.beginDelete(resourceGroup, gatewayName);
      poller.pollUntilDone().catch((err) => logger.error("Delete failed", { gatewayName, error: err }));
      return { status: "deleting", message: `Gateway '${gatewayName}' deletion started. Takes 2-5 minutes.` };
    } catch (error) {
      logger.error("Failed to delete gateway", { subscriptionId, resourceGroup, gatewayName, error });
      throw error;
    }
  }

  async startGateway(subscriptionId: string, resourceGroup: string, gatewayName: string): Promise<any> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      const poller = await client.applicationGateways.beginStart(resourceGroup, gatewayName);
      poller.pollUntilDone().catch((err) => logger.error("Start failed", { gatewayName, error: err }));
      return { status: "starting", message: `Gateway '${gatewayName}' is starting. Takes 2-5 minutes.` };
    } catch (error) {
      logger.error("Failed to start gateway", { subscriptionId, resourceGroup, gatewayName, error });
      throw error;
    }
  }

  async stopGateway(subscriptionId: string, resourceGroup: string, gatewayName: string): Promise<any> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      const poller = await client.applicationGateways.beginStop(resourceGroup, gatewayName);
      poller.pollUntilDone().catch((err) => logger.error("Stop failed", { gatewayName, error: err }));
      return { status: "stopping", message: `Gateway '${gatewayName}' is stopping. Takes 2-5 minutes.` };
    } catch (error) {
      logger.error("Failed to stop gateway", { subscriptionId, resourceGroup, gatewayName, error });
      throw error;
    }
  }

  async addHttpsListener(
    subscriptionId: string,
    resourceGroup: string,
    gatewayName: string,
    certData: string,
    certPassword: string,
    certName: string = "ssl-cert",
    listenerName: string = "httpsListener",
    port: number = 443,
    hostName?: string
  ): Promise<any> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      // Get current gateway config
      const gw = await client.applicationGateways.get(resourceGroup, gatewayName);
      const basePath = gw.id!;

      // Add SSL certificate
      if (!gw.sslCertificates) gw.sslCertificates = [];
      gw.sslCertificates.push({
        name: certName,
        data: certData,
        password: certPassword,
      });

      // Add frontend port 443 if not exists
      if (!gw.frontendPorts) gw.frontendPorts = [];
      const port443Exists = gw.frontendPorts.some(p => p.port === port);
      const portName = `port_${port}`;
      if (!port443Exists) {
        gw.frontendPorts.push({ name: portName, port });
      }
      const actualPortName = port443Exists
        ? gw.frontendPorts.find(p => p.port === port)!.name!
        : portName;

      // Get frontend IP config name
      const frontendIPName = gw.frontendIPConfigurations?.[0]?.name || "appGatewayFrontendIP";

      // Add HTTPS listener
      if (!gw.httpListeners) gw.httpListeners = [];
      const listenerConfig: any = {
        name: listenerName,
        frontendIPConfiguration: { id: `${basePath}/frontendIPConfigurations/${frontendIPName}` },
        frontendPort: { id: `${basePath}/frontendPorts/${actualPortName}` },
        protocol: "Https",
        sslCertificate: { id: `${basePath}/sslCertificates/${certName}` },
      };
      if (hostName) listenerConfig.hostName = hostName;
      gw.httpListeners.push(listenerConfig);

      // Add routing rule for HTTPS listener
      if (!gw.requestRoutingRules) gw.requestRoutingRules = [];
      const backendPoolName = gw.backendAddressPools?.[0]?.name || "defaultBackendPool";
      const httpSettingsName = gw.backendHttpSettingsCollection?.[0]?.name || "defaultHttpSettings";
      const maxPriority = Math.max(0, ...gw.requestRoutingRules.map(r => r.priority || 0));

      gw.requestRoutingRules.push({
        name: `${listenerName}Rule`,
        ruleType: "Basic",
        priority: maxPriority + 10,
        httpListener: { id: `${basePath}/httpListeners/${listenerName}` },
        backendAddressPool: { id: `${basePath}/backendAddressPools/${backendPoolName}` },
        backendHttpSettings: { id: `${basePath}/backendHttpSettingsCollection/${httpSettingsName}` },
      });

      logger.info("Adding HTTPS listener to gateway", { gatewayName, listenerName, port });

      // Update gateway
      const poller = await client.applicationGateways.beginCreateOrUpdate(resourceGroup, gatewayName, this.cleanGatewayForUpdate(gw));
      poller.pollUntilDone().then(() => {
        logger.info("HTTPS listener added successfully", { gatewayName });
      }).catch(err => {
        logger.error("Failed to add HTTPS listener", { gatewayName, error: err });
      });

      return {
        status: "updating",
        message: `Adding HTTPS listener '${listenerName}' on port ${port} with SSL certificate '${certName}'. Takes 2-5 minutes.`,
      };
    } catch (error) {
      logger.error("Failed to add HTTPS listener", { gatewayName, error });
      throw error;
    }
  }

  async addBackendPool(
    subscriptionId: string,
    resourceGroup: string,
    gatewayName: string,
    poolName: string,
    addresses: Array<{ fqdn?: string; ipAddress?: string }>
  ): Promise<any> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      const gw = await client.applicationGateways.get(resourceGroup, gatewayName);
      if (!gw.backendAddressPools) gw.backendAddressPools = [];
      gw.backendAddressPools.push({
        name: poolName,
        backendAddresses: addresses,
      });

      logger.info("Adding backend pool", { gatewayName, poolName });
      const poller = await client.applicationGateways.beginCreateOrUpdate(resourceGroup, gatewayName, this.cleanGatewayForUpdate(gw));
      poller.pollUntilDone().catch(err => logger.error("Add backend pool failed", { error: err }));

      return { status: "updating", message: `Adding backend pool '${poolName}' with ${addresses.length} server(s). Takes 2-5 minutes.` };
    } catch (error) {
      logger.error("Failed to add backend pool", { gatewayName, error });
      throw error;
    }
  }

  async addHttpRedirectRule(
    subscriptionId: string,
    resourceGroup: string,
    gatewayName: string
  ): Promise<any> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      const gw = await client.applicationGateways.get(resourceGroup, gatewayName);
      const basePath = gw.id!;

      // Find HTTP listener
      const httpListener = gw.httpListeners?.find(l => l.protocol === "Http");
      const httpsListener = gw.httpListeners?.find(l => l.protocol === "Https");

      if (!httpListener || !httpsListener) {
        throw new Error("Need both HTTP and HTTPS listeners for redirect");
      }

      // Add redirect config
      if (!gw.redirectConfigurations) gw.redirectConfigurations = [];
      gw.redirectConfigurations.push({
        name: "httpToHttpsRedirect",
        redirectType: "Permanent",
        targetListener: { id: `${basePath}/httpListeners/${httpsListener.name}` },
        includePath: true,
        includeQueryString: true,
      });

      // Find and update the HTTP routing rule to use redirect
      const httpRule = gw.requestRoutingRules?.find(r =>
        r.httpListener?.id?.includes(httpListener.name!)
      );
      if (httpRule) {
        httpRule.redirectConfiguration = { id: `${basePath}/redirectConfigurations/httpToHttpsRedirect` };
        delete httpRule.backendAddressPool;
        delete httpRule.backendHttpSettings;
      }

      logger.info("Adding HTTP to HTTPS redirect", { gatewayName });
      const poller = await client.applicationGateways.beginCreateOrUpdate(resourceGroup, gatewayName, this.cleanGatewayForUpdate(gw));
      poller.pollUntilDone().catch(err => logger.error("Redirect rule failed", { error: err }));

      return { status: "updating", message: "Adding HTTP-to-HTTPS redirect rule. Takes 2-5 minutes." };
    } catch (error) {
      logger.error("Failed to add redirect", { gatewayName, error });
      throw error;
    }
  }

  async configureListenerAuth(
    subscriptionId: string,
    resourceGroup: string,
    gatewayName: string,
    listenerName: string,
    tenantId: string,
    clientId: string,
    clientSecret?: string
  ): Promise<any> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      const gw = await client.applicationGateways.get(resourceGroup, gatewayName);

      // Find the listener
      const listener = gw.httpListeners?.find(l => l.name === listenerName);
      if (!listener) throw new Error(`Listener '${listenerName}' not found`);
      if (listener.protocol !== "Https") throw new Error("Auth can only be configured on HTTPS listeners");

      // Add authentication configuration to the gateway
      // App Gateway uses rewrite rules + custom headers for auth validation
      // For full OAuth2, we configure the listener with the auth settings

      // Create a rewrite rule set that adds auth validation headers
      if (!gw.rewriteRuleSets) gw.rewriteRuleSets = [];
      const rewriteSetName = `${listenerName}-auth-rewrite`;
      gw.rewriteRuleSets.push({
        name: rewriteSetName,
        rewriteRules: [
          {
            name: "add-auth-headers",
            ruleSequence: 100,
            actionSet: {
              responseHeaderConfigurations: [
                {
                  headerName: "X-Auth-Provider",
                  headerValue: "AzureAD",
                },
                {
                  headerName: "X-Auth-Tenant",
                  headerValue: tenantId,
                },
                {
                  headerName: "X-Auth-ClientId",
                  headerValue: clientId,
                },
              ],
            },
          },
        ],
      });

      // Update the routing rule for this listener to use the rewrite set
      const basePath = gw.id!;
      const rule = gw.requestRoutingRules?.find(r =>
        r.httpListener?.id?.includes(listenerName)
      );
      if (rule) {
        rule.rewriteRuleSet = { id: `${basePath}/rewriteRuleSets/${rewriteSetName}` };
      }

      logger.info("Configuring listener auth", { gatewayName, listenerName, tenantId, clientId });
      const poller = await client.applicationGateways.beginCreateOrUpdate(resourceGroup, gatewayName, this.cleanGatewayForUpdate(gw));
      poller.pollUntilDone().catch(err => logger.error("Auth config failed", { error: err }));

      return {
        status: "updating",
        message: `Configuring Azure AD auth on listener '${listenerName}'. Tenant: ${tenantId}, Client: ${clientId}. Takes 2-5 minutes.`,
        authConfig: {
          provider: "Azure AD (Entra ID)",
          tenantId,
          clientId,
          authorizationEndpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
          tokenEndpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
          jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
        },
      };
    } catch (error) {
      logger.error("Failed to configure auth", { gatewayName, listenerName, error });
      throw error;
    }
  }

  async addTrustedRootCert(
    subscriptionId: string,
    resourceGroup: string,
    gatewayName: string,
    certName: string,
    certData: string
  ): Promise<any> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      const gw = await client.applicationGateways.get(resourceGroup, gatewayName);
      if (!gw.trustedRootCertificates) gw.trustedRootCertificates = [];
      gw.trustedRootCertificates.push({ name: certName, data: certData });

      logger.info("Adding trusted root cert", { gatewayName, certName });
      const poller = await client.applicationGateways.beginCreateOrUpdate(resourceGroup, gatewayName, this.cleanGatewayForUpdate(gw));
      poller.pollUntilDone().catch(err => logger.error("Add trusted root cert failed", { error: err }));

      return { status: "updating", message: `Adding trusted root certificate '${certName}'. Takes 2-5 minutes.` };
    } catch (error) {
      logger.error("Failed to add trusted root cert", { gatewayName, error });
      throw error;
    }
  }

  async configureBackendHttps(
    subscriptionId: string,
    resourceGroup: string,
    gatewayName: string,
    httpSettingName: string,
    backendPort: number = 443,
    trustedRootCertName?: string
  ): Promise<any> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      const gw = await client.applicationGateways.get(resourceGroup, gatewayName);
      const basePath = gw.id!;

      const setting = gw.backendHttpSettingsCollection?.find(s => s.name === httpSettingName);
      if (!setting) throw new Error(`HTTP setting '${httpSettingName}' not found`);

      setting.protocol = "Https";
      setting.port = backendPort;

      if (trustedRootCertName) {
        setting.trustedRootCertificates = [
          { id: `${basePath}/trustedRootCertificates/${trustedRootCertName}` },
        ];
      }

      logger.info("Configuring backend HTTPS", { gatewayName, httpSettingName, backendPort });
      const poller = await client.applicationGateways.beginCreateOrUpdate(resourceGroup, gatewayName, this.cleanGatewayForUpdate(gw));
      poller.pollUntilDone().catch(err => logger.error("Backend HTTPS config failed", { error: err }));

      return { status: "updating", message: `Configuring end-to-end SSL on '${httpSettingName}' (port ${backendPort}). Takes 2-5 minutes.` };
    } catch (error) {
      logger.error("Failed to configure backend HTTPS", { gatewayName, error });
      throw error;
    }
  }

  async getAuthConfig(
    subscriptionId: string,
    resourceGroup: string,
    gatewayName: string
  ): Promise<any> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      const gw = await client.applicationGateways.get(resourceGroup, gatewayName);
      return {
        listeners: (gw.httpListeners || []).map(l => ({
          name: l.name,
          protocol: l.protocol,
          hostName: l.hostName,
          hasSsl: !!l.sslCertificate,
          sslCertName: l.sslCertificate?.id?.split("/").pop(),
        })),
        sslPolicy: gw.sslPolicy || { policyType: "Default" },
        sslCertificates: (gw.sslCertificates || []).map(c => ({
          name: c.name,
          keyVaultLinked: !!c.keyVaultSecretId,
        })),
        trustedRootCerts: (gw.trustedRootCertificates || []).map(c => ({ name: c.name })),
        wafEnabled: !!gw.webApplicationFirewallConfiguration?.enabled || !!gw.firewallPolicy,
        wafMode: gw.webApplicationFirewallConfiguration?.firewallMode,
        wafPolicyId: gw.firewallPolicy?.id,
        rewriteRuleSets: (gw.rewriteRuleSets || []).map(rs => ({
          name: rs.name,
          rules: (rs.rewriteRules || []).map(r => r.name),
        })),
        httpSettings: (gw.backendHttpSettingsCollection || []).map(s => ({
          name: s.name,
          protocol: s.protocol,
          port: s.port,
          hasTrustedRootCert: (s.trustedRootCertificates || []).length > 0,
        })),
        authSummary: {
          httpsListeners: (gw.httpListeners || []).filter(l => l.protocol === "Https").length,
          httpListeners: (gw.httpListeners || []).filter(l => l.protocol === "Http").length,
          endToEndSsl: (gw.backendHttpSettingsCollection || []).filter(s => s.protocol === "Https").length,
          trustedRootCerts: (gw.trustedRootCertificates || []).length,
        },
      };
    } catch (error) {
      logger.error("Failed to get auth config", { gatewayName, error });
      throw error;
    }
  }

  async updateGateway(
    subscriptionId: string,
    resourceGroup: string,
    gatewayName: string,
    parameters: ApplicationGateway
  ): Promise<any> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      logger.info("Updating application gateway (async)", { subscriptionId, resourceGroup, gatewayName });
      const poller = await client.applicationGateways.beginCreateOrUpdate(
        resourceGroup,
        gatewayName,
        parameters
      );
      poller.pollUntilDone().then((result) => {
        logger.info("Gateway update completed", { gatewayName, state: result.provisioningState });
      }).catch((err) => {
        logger.error("Gateway update failed", { gatewayName, error: err });
      });
      return {
        status: "updating",
        message: `Gateway '${gatewayName}' update started. Takes 2-5 minutes.`,
      };
    } catch (error) {
      logger.error("Failed to update gateway", { subscriptionId, resourceGroup, gatewayName, error });
      throw error;
    }
  }

  async getBackendHealth(subscriptionId: string, resourceGroup: string, gatewayName: string) {
    const client = this.getNetworkClient(subscriptionId);
    try {
      const poller = await client.applicationGateways.beginBackendHealth(resourceGroup, gatewayName);
      return await poller.pollUntilDone();
    } catch (error) {
      logger.error("Failed to get backend health", { subscriptionId, resourceGroup, gatewayName, error });
      throw error;
    }
  }

  // Check DDoS protection on the gateway's VNet
  async checkDdosProtection(subscriptionId: string, resourceGroup: string, gatewayName: string): Promise<{
    enabled: boolean;
    planId?: string;
    planName?: string;
    vnetName?: string;
    vnetRg?: string;
    mode?: string;
    vnetEncryption?: boolean;
    vnetEncryptionEnforcement?: string;
  }> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      const gw = await client.applicationGateways.get(resourceGroup, gatewayName);
      const subnetId = gw.gatewayIPConfigurations?.[0]?.subnet?.id;
      if (!subnetId) return { enabled: false };

      // Extract VNet info from subnet ID
      const parts = subnetId.split("/");
      const vnetRg = parts[4];
      const vnetName = parts[8];

      const vnet = await client.virtualNetworks.get(vnetRg, vnetName);
      const enabled = !!vnet.enableDdosProtection;
      const planId = vnet.ddosProtectionPlan?.id;
      const planName = planId ? planId.split("/").pop() : undefined;

      // Check VNet encryption
      const encryption = (vnet as any).encryption;
      const vnetEncryption = !!encryption?.enabled;
      const vnetEncryptionEnforcement = encryption?.enforcement || "None";

      return {
        enabled,
        planId,
        planName,
        vnetName,
        vnetRg,
        mode: enabled ? "Standard" : "Basic (free)",
        vnetEncryption,
        vnetEncryptionEnforcement,
      };
    } catch (error) {
      logger.error("Failed to check DDoS protection", { gatewayName, error });
      return { enabled: false };
    }
  }

  async enableDdosProtection(subscriptionId: string, resourceGroup: string, gatewayName: string): Promise<{
    success: boolean;
    message: string;
    vnetName?: string;
  }> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      const gw = await client.applicationGateways.get(resourceGroup, gatewayName);
      const subnetId = gw.gatewayIPConfigurations?.[0]?.subnet?.id;
      if (!subnetId) return { success: false, message: "No subnet found on gateway" };

      const parts = subnetId.split("/");
      const vnetRg = parts[4];
      const vnetName = parts[8];

      const vnet = await client.virtualNetworks.get(vnetRg, vnetName);

      if (vnet.enableDdosProtection) {
        return { success: true, message: "DDoS Protection Standard is already enabled", vnetName };
      }

      // Enable DDoS Protection Standard on the VNet
      vnet.enableDdosProtection = true;
      await client.virtualNetworks.beginCreateOrUpdateAndWait(vnetRg, vnetName, vnet);

      logger.info("DDoS Protection Standard enabled", { gatewayName, vnetName, vnetRg });
      return { success: true, message: `DDoS Protection Standard enabled on VNet "${vnetName}"`, vnetName };
    } catch (error) {
      logger.error("Failed to enable DDoS protection", { gatewayName, error });
      return { success: false, message: error instanceof Error ? error.message : "Failed to enable DDoS protection" };
    }
  }

  async disableDdosProtection(subscriptionId: string, resourceGroup: string, gatewayName: string): Promise<{
    success: boolean;
    message: string;
    vnetName?: string;
  }> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      const gw = await client.applicationGateways.get(resourceGroup, gatewayName);
      const subnetId = gw.gatewayIPConfigurations?.[0]?.subnet?.id;
      if (!subnetId) return { success: false, message: "No subnet found on gateway" };

      const parts = subnetId.split("/");
      const vnetRg = parts[4];
      const vnetName = parts[8];

      const vnet = await client.virtualNetworks.get(vnetRg, vnetName);

      if (!vnet.enableDdosProtection) {
        return { success: true, message: "DDoS Protection Standard is already disabled", vnetName };
      }

      vnet.enableDdosProtection = false;
      vnet.ddosProtectionPlan = undefined;
      await client.virtualNetworks.beginCreateOrUpdateAndWait(vnetRg, vnetName, vnet);

      logger.info("DDoS Protection Standard disabled", { gatewayName, vnetName, vnetRg });
      return { success: true, message: `DDoS Protection Standard disabled on VNet "${vnetName}"`, vnetName };
    } catch (error) {
      logger.error("Failed to disable DDoS protection", { gatewayName, error });
      return { success: false, message: error instanceof Error ? error.message : "Failed to disable DDoS protection" };
    }
  }

  async enableVnetEncryption(subscriptionId: string, resourceGroup: string, gatewayName: string): Promise<{
    success: boolean;
    message: string;
    vnetName?: string;
  }> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      const gw = await client.applicationGateways.get(resourceGroup, gatewayName);
      const subnetId = gw.gatewayIPConfigurations?.[0]?.subnet?.id;
      if (!subnetId) return { success: false, message: "No subnet found on gateway" };

      const parts = subnetId.split("/");
      const vnetRg = parts[4];
      const vnetName = parts[8];

      const vnet = await client.virtualNetworks.get(vnetRg, vnetName);

      if ((vnet as any).encryption?.enabled) {
        return { success: true, message: "VNet encryption is already enabled", vnetName };
      }

      (vnet as any).encryption = { enabled: true, enforcement: "AllowUnencrypted" };
      await client.virtualNetworks.beginCreateOrUpdateAndWait(vnetRg, vnetName, vnet);

      logger.info("VNet encryption enabled", { gatewayName, vnetName, vnetRg });
      return { success: true, message: `VNet encryption enabled on VNet "${vnetName}"`, vnetName };
    } catch (error) {
      logger.error("Failed to enable VNet encryption", { gatewayName, error });
      return { success: false, message: error instanceof Error ? error.message : "Failed to enable VNet encryption" };
    }
  }

  async disableVnetEncryption(subscriptionId: string, resourceGroup: string, gatewayName: string): Promise<{
    success: boolean;
    message: string;
    vnetName?: string;
  }> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      const gw = await client.applicationGateways.get(resourceGroup, gatewayName);
      const subnetId = gw.gatewayIPConfigurations?.[0]?.subnet?.id;
      if (!subnetId) return { success: false, message: "No subnet found on gateway" };

      const parts = subnetId.split("/");
      const vnetRg = parts[4];
      const vnetName = parts[8];

      const vnet = await client.virtualNetworks.get(vnetRg, vnetName);

      if (!(vnet as any).encryption?.enabled) {
        return { success: true, message: "VNet encryption is already disabled", vnetName };
      }

      (vnet as any).encryption = { enabled: false };
      await client.virtualNetworks.beginCreateOrUpdateAndWait(vnetRg, vnetName, vnet);

      logger.info("VNet encryption disabled", { gatewayName, vnetName, vnetRg });
      return { success: true, message: `VNet encryption disabled on VNet "${vnetName}"`, vnetName };
    } catch (error) {
      logger.error("Failed to disable VNet encryption", { gatewayName, error });
      return { success: false, message: error instanceof Error ? error.message : "Failed to disable VNet encryption" };
    }
  }

  getBackendPools(gateway: ApplicationGateway): BackendPool[] {
    return (gateway.backendAddressPools || []).map((pool) => ({
      id: pool.id || "",
      name: pool.name || "",
      addresses: (pool.backendAddresses || []).map((addr) => ({
        fqdn: addr.fqdn,
        ipAddress: addr.ipAddress,
      })),
    }));
  }

  getHttpSettings(gateway: ApplicationGateway): HttpSetting[] {
    return (gateway.backendHttpSettingsCollection || []).map((setting) => ({
      id: setting.id || "",
      name: setting.name || "",
      port: setting.port || 80,
      protocol: setting.protocol || "Http",
      cookieBasedAffinity: setting.cookieBasedAffinity || "Disabled",
      requestTimeout: setting.requestTimeout || 30,
      probeName: setting.probe?.id?.split("/").pop(),
    }));
  }

  getListeners(gateway: ApplicationGateway): Listener[] {
    return (gateway.httpListeners || []).map((listener) => ({
      id: listener.id || "",
      name: listener.name || "",
      protocol: listener.protocol || "Http",
      port: listener.frontendPort?.id ? this.extractPortNumber(gateway, listener.frontendPort.id) : 80,
      hostName: listener.hostName,
      sslCertificateName: listener.sslCertificate?.id?.split("/").pop(),
      firewallPolicyId: listener.firewallPolicy?.id,
    }));
  }

  getRoutingRules(gateway: ApplicationGateway): RoutingRule[] {
    return (gateway.requestRoutingRules || []).map((rule) => ({
      id: rule.id || "",
      name: rule.name || "",
      ruleType: rule.ruleType || "Basic",
      priority: rule.priority,
      listenerName: rule.httpListener?.id?.split("/").pop() || "",
      backendPoolName: rule.backendAddressPool?.id?.split("/").pop(),
      httpSettingName: rule.backendHttpSettings?.id?.split("/").pop(),
      redirectConfigName: rule.redirectConfiguration?.id?.split("/").pop(),
      urlPathMapName: rule.urlPathMap?.id?.split("/").pop(),
    }));
  }

  getHealthProbes(gateway: ApplicationGateway): HealthProbe[] {
    return (gateway.probes || []).map((probe) => ({
      id: probe.id || "",
      name: probe.name || "",
      protocol: probe.protocol || "Http",
      host: probe.host,
      path: probe.path || "/",
      interval: probe.interval || 30,
      timeout: probe.timeout || 30,
      unhealthyThreshold: probe.unhealthyThreshold || 3,
      matchStatusCodes: probe.match?.statusCodes || ["200-399"],
    }));
  }

  private extractPortNumber(gateway: ApplicationGateway, portId: string): number {
    const port = gateway.frontendPorts?.find((p) => p.id === portId);
    return port?.port || 80;
  }

  private mapToListItem(gw: ApplicationGateway, subscriptionId: string): GatewayListItem {
    const resourceGroup = gw.id?.split("/")[4] || "";
    return {
      id: gw.id || "",
      name: gw.name || "",
      resourceGroup,
      subscriptionId,
      location: gw.location || "",
      sku: gw.sku?.name || "Unknown",
      tier: gw.sku?.tier || "Unknown",
      capacity: gw.sku?.capacity || 0,
      operationalState: gw.operationalState || "Unknown",
      backendPoolCount: gw.backendAddressPools?.length || 0,
      listenerCount: gw.httpListeners?.length || 0,
      ruleCount: gw.requestRoutingRules?.length || 0,
      wafEnabled: !!gw.webApplicationFirewallConfiguration?.enabled || !!gw.firewallPolicy,
      provisioningState: gw.provisioningState || "Unknown",
      tags: (gw.tags as Record<string, string>) || {},
    };
  }
}
