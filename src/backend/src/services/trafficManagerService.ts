import { TrafficManagerManagementClient } from "@azure/arm-trafficmanager";
import { getAzureCredential } from "../config/azure";
import { logger } from "../config/logger";

export interface TrafficManagerProfile {
  id: string;
  name: string;
  resourceGroup: string;
  subscriptionId: string;
  location: string;
  profileStatus: string;
  trafficRoutingMethod: string;
  dnsConfig: {
    relativeName: string;
    fqdn: string;
    ttl: number;
  };
  monitorConfig: {
    protocol: string;
    port: number;
    path: string;
    profileMonitorStatus: string;
    intervalInSeconds: number;
    timeoutInSeconds: number;
    toleratedNumberOfFailures: number;
  };
  endpoints: TrafficManagerEndpoint[];
  maxReturn?: number;
  tags: Record<string, string>;
}

export interface TrafficManagerEndpoint {
  id: string;
  name: string;
  type: string;
  targetResourceId?: string;
  target?: string;
  endpointStatus: string;
  endpointMonitorStatus: string;
  weight?: number;
  priority?: number;
  endpointLocation?: string;
}

export class TrafficManagerService {
  private getClient(subscriptionId: string): TrafficManagerManagementClient {
    return new TrafficManagerManagementClient(getAzureCredential(), subscriptionId);
  }

  async listProfiles(subscriptionId: string): Promise<TrafficManagerProfile[]> {
    const client = this.getClient(subscriptionId);
    const profiles: TrafficManagerProfile[] = [];

    try {
      for await (const profile of client.profiles.listBySubscription()) {
        profiles.push(this.mapProfile(profile, subscriptionId));
      }
    } catch (error) {
      logger.error("Failed to list Traffic Manager profiles", { subscriptionId, error });
      throw error;
    }

    return profiles;
  }

  async getProfile(
    subscriptionId: string,
    resourceGroup: string,
    profileName: string
  ): Promise<TrafficManagerProfile> {
    const client = this.getClient(subscriptionId);
    try {
      const profile = await client.profiles.get(resourceGroup, profileName);
      return this.mapProfile(profile, subscriptionId);
    } catch (error) {
      logger.error("Failed to get Traffic Manager profile", { subscriptionId, resourceGroup, profileName, error });
      throw error;
    }
  }

  async getEndpoints(
    subscriptionId: string,
    resourceGroup: string,
    profileName: string
  ): Promise<TrafficManagerEndpoint[]> {
    const profile = await this.getProfile(subscriptionId, resourceGroup, profileName);
    return profile.endpoints;
  }

  private mapProfile(profile: any, subscriptionId: string): TrafficManagerProfile {
    const resourceGroup = profile.id?.split("/resourceGroups/")[1]?.split("/")[0] || "";

    return {
      id: profile.id || "",
      name: profile.name || "",
      resourceGroup,
      subscriptionId,
      location: profile.location || "global",
      profileStatus: profile.profileStatus || "Unknown",
      trafficRoutingMethod: profile.trafficRoutingMethod || "Unknown",
      dnsConfig: {
        relativeName: profile.dnsConfig?.relativeName || "",
        fqdn: profile.dnsConfig?.fqdn || "",
        ttl: profile.dnsConfig?.ttl || 0,
      },
      monitorConfig: {
        protocol: profile.monitorConfig?.protocol || "",
        port: profile.monitorConfig?.port || 0,
        path: profile.monitorConfig?.path || "",
        profileMonitorStatus: profile.monitorConfig?.profileMonitorStatus || "Unknown",
        intervalInSeconds: profile.monitorConfig?.intervalInSeconds || 30,
        timeoutInSeconds: profile.monitorConfig?.timeoutInSeconds || 10,
        toleratedNumberOfFailures: profile.monitorConfig?.toleratedNumberOfFailures || 3,
      },
      endpoints: (profile.endpoints || []).map((ep: any) => ({
        id: ep.id || "",
        name: ep.name || "",
        type: ep.type?.split("/").pop() || "",
        targetResourceId: ep.targetResourceId || undefined,
        target: ep.target || undefined,
        endpointStatus: ep.endpointStatus || "Unknown",
        endpointMonitorStatus: ep.endpointMonitorStatus || "Unknown",
        weight: ep.weight,
        priority: ep.priority,
        endpointLocation: ep.endpointLocation || undefined,
      })),
      maxReturn: profile.maxReturn,
      tags: profile.tags || {},
    };
  }

  async enableProfile(subscriptionId: string, resourceGroup: string, profileName: string): Promise<void> {
    const client = this.getClient(subscriptionId);
    try {
      await client.profiles.update(resourceGroup, profileName, { profileStatus: "Enabled" });
      logger.info("Enabled Traffic Manager profile", { profileName });
    } catch (error) {
      logger.error("Failed to enable TM profile", { error, profileName });
      throw error;
    }
  }

  async disableProfile(subscriptionId: string, resourceGroup: string, profileName: string): Promise<void> {
    const client = this.getClient(subscriptionId);
    try {
      await client.profiles.update(resourceGroup, profileName, { profileStatus: "Disabled" });
      logger.info("Disabled Traffic Manager profile", { profileName });
    } catch (error) {
      logger.error("Failed to disable TM profile", { error, profileName });
      throw error;
    }
  }

  async updateRoutingMethod(subscriptionId: string, resourceGroup: string, profileName: string, routingMethod: string): Promise<void> {
    const client = this.getClient(subscriptionId);
    try {
      await client.profiles.update(resourceGroup, profileName, { trafficRoutingMethod: routingMethod as any });
      logger.info("Updated TM routing method", { profileName, routingMethod });
    } catch (error) {
      logger.error("Failed to update TM routing method", { error, profileName, routingMethod });
      throw error;
    }
  }

  async deleteProfile(subscriptionId: string, resourceGroup: string, profileName: string): Promise<void> {
    const client = this.getClient(subscriptionId);
    try {
      await client.profiles.delete(resourceGroup, profileName);
      logger.info("Deleted Traffic Manager profile", { profileName });
    } catch (error) {
      logger.error("Failed to delete TM profile", { error, profileName });
      throw error;
    }
  }

  async enableEndpoint(subscriptionId: string, resourceGroup: string, profileName: string, endpointType: string, endpointName: string): Promise<void> {
    const client = this.getClient(subscriptionId);
    try {
      await client.endpoints.update(resourceGroup, profileName, endpointType as any, endpointName, { endpointStatus: "Enabled" });
      logger.info("Enabled TM endpoint", { profileName, endpointName });
    } catch (error) {
      logger.error("Failed to enable TM endpoint", { error, endpointName });
      throw error;
    }
  }

  async disableEndpoint(subscriptionId: string, resourceGroup: string, profileName: string, endpointType: string, endpointName: string): Promise<void> {
    const client = this.getClient(subscriptionId);
    try {
      await client.endpoints.update(resourceGroup, profileName, endpointType as any, endpointName, { endpointStatus: "Disabled" });
      logger.info("Disabled TM endpoint", { profileName, endpointName });
    } catch (error) {
      logger.error("Failed to disable TM endpoint", { error, endpointName });
      throw error;
    }
  }

  async addFailoverEndpoint(
    subscriptionId: string,
    resourceGroup: string,
    profileName: string,
    endpoint: { name: string; target: string; type: string; priority?: number; weight?: number; targetResourceId?: string; endpointLocation?: string }
  ): Promise<void> {
    const client = this.getClient(subscriptionId);
    try {
      const endpointParams: any = {
        endpointStatus: "Disabled",
        weight: endpoint.weight || 1,
        priority: endpoint.priority || 999,
      };

      // AzureEndpoints and NestedEndpoints require targetResourceId, not target
      if (endpoint.type === "AzureEndpoints" || endpoint.type === "NestedEndpoints") {
        endpointParams.targetResourceId = endpoint.targetResourceId || endpoint.target;
      } else {
        endpointParams.target = endpoint.target;
      }

      // Performance routing requires endpointLocation for External/Nested endpoints
      if (endpoint.endpointLocation) {
        endpointParams.endpointLocation = endpoint.endpointLocation;
      }

      await client.endpoints.createOrUpdate(resourceGroup, profileName, endpoint.type as any, endpoint.name, endpointParams);
      logger.info("Added failover endpoint (disabled)", { profileName, endpointName: endpoint.name, target: endpoint.target });
    } catch (error) {
      logger.error("Failed to add failover endpoint", { error, profileName, endpoint });
      throw error;
    }
  }

  async checkAndFailover(
    subscriptionId: string,
    resourceGroup: string,
    profileName: string
  ): Promise<{ action: string; details: string[]; failedEndpoints: string[]; enabledEndpoints: string[] }> {
    const profile = await this.getProfile(subscriptionId, resourceGroup, profileName);
    const details: string[] = [];
    const failedEndpoints: string[] = [];
    const enabledEndpoints: string[] = [];

    const enabled = profile.endpoints.filter(ep => ep.endpointStatus === "Enabled");
    const disabled = profile.endpoints.filter(ep => ep.endpointStatus === "Disabled");
    const healthyOnline = enabled.filter(ep => ep.endpointMonitorStatus === "Online");
    const faulty = enabled.filter(ep => 
      ep.endpointMonitorStatus === "Degraded" || ep.endpointMonitorStatus === "Stopped" || ep.endpointMonitorStatus === "CheckingEndpoint"
    );

    // No disabled endpoints to failover to
    if (disabled.length === 0) {
      return { action: "none", details: ["No disabled failover endpoints available."], failedEndpoints: [], enabledEndpoints: [] };
    }

    // Trigger failover if: any enabled endpoint is faulty, OR no healthy endpoints remain, OR disabled > enabled
    const shouldFailover = faulty.length > 0 || healthyOnline.length === 0 || disabled.length > enabled.length;
    
    if (!shouldFailover) {
      return { action: "none", details: ["Endpoints are healthy. No failover needed."], failedEndpoints: [], enabledEndpoints: [] };
    }

    for (const ep of faulty) {
      failedEndpoints.push(ep.name);
      details.push(`Endpoint "${ep.name}" is ${ep.endpointMonitorStatus}`);
    }
    if (healthyOnline.length === 0 && faulty.length === 0) {
      details.push("No healthy enabled endpoints remaining");
    }
    if (disabled.length > enabled.length) {
      details.push(`${disabled.length} disabled vs ${enabled.length} enabled — enabling backups`);
    }

    // Enable disabled endpoints as failover
    const client = this.getClient(subscriptionId);
    for (const candidate of disabled) {
      try {
        await client.endpoints.update(resourceGroup, profileName, candidate.type as any, candidate.name, { endpointStatus: "Enabled" });
        enabledEndpoints.push(candidate.name);
        details.push(`Enabled failover endpoint "${candidate.name}"`);
        logger.info("Failover: enabled backup endpoint", { profileName, endpoint: candidate.name });
      } catch (error) {
        details.push(`Failed to enable "${candidate.name}": ${(error as Error).message}`);
        logger.error("Failover: failed to enable endpoint", { error, endpoint: candidate.name });
      }
    }

    return {
      action: enabledEndpoints.length > 0 ? "failover_executed" : "failover_failed",
      details,
      failedEndpoints,
      enabledEndpoints,
    };
  }
}
