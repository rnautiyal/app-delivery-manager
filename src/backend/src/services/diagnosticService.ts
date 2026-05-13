import { NetworkManagementClient } from "@azure/arm-network";
import { getAzureCredential } from "../config/azure";
import { logger } from "../config/logger";
import { DiagnosticResult } from "../models/types";
import { GatewayService } from "./gatewayService";

export class DiagnosticService {
  private gatewayService: GatewayService;

  constructor() {
    this.gatewayService = new GatewayService();
  }

  private getNetworkClient(subscriptionId: string): NetworkManagementClient {
    return new NetworkManagementClient(getAzureCredential(), subscriptionId);
  }

  async runFullDiagnostics(
    subscriptionId: string,
    resourceGroup: string,
    gatewayName: string
  ): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    try {
      const gateway = await this.gatewayService.getGateway(subscriptionId, resourceGroup, gatewayName);

      // Check provisioning state
      results.push(this.checkProvisioningState(gateway.provisioningState));

      // Check operational state
      results.push(this.checkOperationalState(gateway.operationalState));

      // Check SKU configuration
      results.push(this.checkSkuConfiguration(gateway.sku));

      // Check backend pools
      results.push(...this.checkBackendPools(gateway.backendAddressPools));

      // Check listeners
      results.push(...this.checkListeners(gateway.httpListeners, gateway.sslCertificates));

      // Check health probes
      results.push(...this.checkHealthProbes(gateway.probes));

      // Check WAF configuration
      results.push(this.checkWafConfig(gateway.webApplicationFirewallConfiguration, gateway.firewallPolicy));

      // Check backend health
      try {
        const backendHealth = await this.gatewayService.getBackendHealth(
          subscriptionId,
          resourceGroup,
          gatewayName
        );
        results.push(...this.analyzeBackendHealth(backendHealth));
      } catch (_e) {
        results.push({
          category: "Backend Health",
          status: "warn",
          message: "Could not retrieve backend health status",
          recommendation: "Ensure the gateway is running and accessible",
        });
      }
    } catch (error) {
      logger.error("Diagnostics failed", { subscriptionId, resourceGroup, gatewayName, error });
      results.push({
        category: "General",
        status: "fail",
        message: "Failed to run diagnostics",
        details: error instanceof Error ? error.message : String(error),
      });
    }

    return results;
  }

  private checkProvisioningState(state?: string): DiagnosticResult {
    if (state === "Succeeded") {
      return { category: "Provisioning", status: "pass", message: "Gateway provisioning state is Succeeded" };
    }
    return {
      category: "Provisioning",
      status: "fail",
      message: `Gateway provisioning state is ${state || "Unknown"}`,
      recommendation: "Wait for provisioning to complete or check for deployment errors",
    };
  }

  private checkOperationalState(state?: string): DiagnosticResult {
    if (state === "Running") {
      return { category: "Operational", status: "pass", message: "Gateway is running" };
    }
    return {
      category: "Operational",
      status: state === "Starting" ? "warn" : "fail",
      message: `Gateway operational state is ${state || "Unknown"}`,
      recommendation: state === "Stopped" ? "Start the gateway" : "Check gateway status in Azure portal",
    };
  }

  private checkSkuConfiguration(sku?: any): DiagnosticResult {
    if (!sku) {
      return { category: "SKU", status: "warn", message: "SKU information not available" };
    }

    const isV2 = sku.tier?.includes("v2");
    if (!isV2) {
      return {
        category: "SKU",
        status: "warn",
        message: `Using legacy SKU tier: ${sku.tier}`,
        recommendation: "Consider upgrading to v2 SKU for better performance, autoscaling, and zone redundancy",
      };
    }

    return {
      category: "SKU",
      status: "pass",
      message: `Using ${sku.name} (${sku.tier}) with capacity ${sku.capacity}`,
    };
  }

  private checkBackendPools(pools?: any[]): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];

    if (!pools || pools.length === 0) {
      results.push({
        category: "Backend Pools",
        status: "warn",
        message: "No backend pools configured",
        recommendation: "Add at least one backend pool with backend targets",
      });
      return results;
    }

    for (const pool of pools) {
      if (!pool.backendAddresses || pool.backendAddresses.length === 0) {
        results.push({
          category: "Backend Pools",
          status: "warn",
          message: `Backend pool "${pool.name}" has no targets`,
          recommendation: "Add backend addresses (IP or FQDN) to the pool",
        });
      } else {
        results.push({
          category: "Backend Pools",
          status: "pass",
          message: `Backend pool "${pool.name}" has ${pool.backendAddresses.length} target(s)`,
        });
      }
    }

    return results;
  }

  private checkListeners(listeners?: any[], sslCerts?: any[]): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];

    if (!listeners || listeners.length === 0) {
      results.push({
        category: "Listeners",
        status: "fail",
        message: "No listeners configured",
        recommendation: "Configure at least one HTTP or HTTPS listener",
      });
      return results;
    }

    const httpsListeners = listeners.filter((l) => l.protocol === "Https");
    const httpListeners = listeners.filter((l) => l.protocol === "Http");

    if (httpListeners.length > 0 && httpsListeners.length === 0) {
      results.push({
        category: "Listeners",
        status: "warn",
        message: "Only HTTP listeners configured, no HTTPS",
        recommendation: "Configure HTTPS listeners with SSL certificates for secure traffic",
      });
    } else {
      results.push({
        category: "Listeners",
        status: "pass",
        message: `${listeners.length} listener(s) configured (${httpsListeners.length} HTTPS, ${httpListeners.length} HTTP)`,
      });
    }

    return results;
  }

  private checkHealthProbes(probes?: any[]): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];

    if (!probes || probes.length === 0) {
      results.push({
        category: "Health Probes",
        status: "warn",
        message: "No custom health probes configured",
        recommendation: "Configure custom health probes for better backend monitoring",
      });
      return results;
    }

    for (const probe of probes) {
      if (probe.interval > 60) {
        results.push({
          category: "Health Probes",
          status: "warn",
          message: `Probe "${probe.name}" has a long interval (${probe.interval}s)`,
          recommendation: "Consider reducing probe interval to 30s for faster failure detection",
        });
      } else {
        results.push({
          category: "Health Probes",
          status: "pass",
          message: `Probe "${probe.name}" configured (interval: ${probe.interval}s, path: ${probe.path})`,
        });
      }
    }

    return results;
  }

  private checkWafConfig(wafConfig?: any, firewallPolicy?: any): DiagnosticResult {
    if (firewallPolicy) {
      return {
        category: "WAF",
        status: "pass",
        message: "WAF policy is associated with this gateway",
      };
    }

    if (wafConfig?.enabled) {
      return {
        category: "WAF",
        status: wafConfig.firewallMode === "Prevention" ? "pass" : "warn",
        message: `WAF is enabled in ${wafConfig.firewallMode} mode`,
        recommendation:
          wafConfig.firewallMode === "Detection"
            ? "Consider switching to Prevention mode for active threat blocking"
            : undefined,
      };
    }

    return {
      category: "WAF",
      status: "warn",
      message: "WAF is not enabled",
      recommendation: "Enable WAF to protect against common web vulnerabilities (OWASP Top 10)",
    };
  }

  private analyzeBackendHealth(backendHealth: any): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];

    for (const pool of backendHealth.backendAddressPools || []) {
      for (const httpSettings of pool.backendHttpSettingsCollection || []) {
        for (const server of httpSettings.servers || []) {
          if (server.health === "Unhealthy") {
            results.push({
              category: "Backend Health",
              status: "fail",
              message: `Server ${server.address} is unhealthy in pool`,
              details: server.healthProbeLog,
              recommendation: "Check backend server connectivity, NSG rules, and health probe configuration",
            });
          } else if (server.health === "Healthy") {
            results.push({
              category: "Backend Health",
              status: "pass",
              message: `Server ${server.address} is healthy`,
            });
          }
        }
      }
    }

    if (results.length === 0) {
      results.push({
        category: "Backend Health",
        status: "warn",
        message: "No backend health data available",
      });
    }

    return results;
  }
}
