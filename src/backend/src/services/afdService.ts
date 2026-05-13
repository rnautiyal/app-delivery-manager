import { CdnManagementClient } from "@azure/arm-cdn";
import { ResourceManagementClient } from "@azure/arm-resources";
import { getAzureCredential } from "../config/azure";
import { logger } from "../config/logger";

export interface AfdProfile {
  id: string;
  name: string;
  resourceGroup: string;
  subscriptionId: string;
  location: string;
  sku: string;
  provisioningState: string;
  resourceState: string;
  frontDoorId: string;
  originResponseTimeoutSeconds: number;
  tags: Record<string, string>;
  endpointCount: number;
  customDomainCount: number;
  originGroupCount: number;
}

export interface AfdEndpoint {
  id: string;
  name: string;
  hostName: string;
  enabledState: string;
  provisioningState: string;
  deploymentStatus: string;
}

export interface AfdOriginGroup {
  id: string;
  name: string;
  provisioningState: string;
  healthProbeSettings: {
    probePath: string;
    probeProtocol: string;
    probeIntervalInSeconds: number;
    probeRequestType: string;
  } | null;
  loadBalancingSettings: {
    sampleSize: number;
    successfulSamplesRequired: number;
    additionalLatencyInMilliseconds: number;
  } | null;
  origins: AfdOrigin[];
}

export interface AfdOrigin {
  id: string;
  name: string;
  hostName: string;
  httpPort: number;
  httpsPort: number;
  originHostHeader: string;
  priority: number;
  weight: number;
  enabledState: string;
  provisioningState: string;
}

export interface AfdCustomDomain {
  id: string;
  name: string;
  hostName: string;
  validationState: string;
  domainValidationState: string;
  provisioningState: string;
  deploymentStatus: string;
  tlsSettings: string;
}

export interface AfdRoute {
  id: string;
  name: string;
  endpointName: string;
  customDomains: string[];
  originGroup: string;
  originPath: string;
  patternsToMatch: string[];
  supportedProtocols: string[];
  httpsRedirect: string;
  forwardingProtocol: string;
  provisioningState: string;
}

export class AfdService {
  private getClient(subscriptionId: string): CdnManagementClient {
    return new CdnManagementClient(getAzureCredential(), subscriptionId);
  }

  async listProfiles(subscriptionId: string): Promise<AfdProfile[]> {
    const client = this.getClient(subscriptionId);
    const profiles: AfdProfile[] = [];

    try {
      for await (const profile of client.profiles.list()) {
        // Only include AFD profiles (Standard_AzureFrontDoor or Premium_AzureFrontDoor)
        const skuName = profile.sku?.name || "";
        if (skuName.includes("AzureFrontDoor")) {
          const rg = profile.id?.split(/resourceGroups\//i)[1]?.split("/")[0] || "";

          // Get counts
          let endpointCount = 0;
          let customDomainCount = 0;
          let originGroupCount = 0;

          try {
            for await (const _ of client.afdEndpoints.listByProfile(rg, profile.name!)) { endpointCount++; }
          } catch (e) { logger.warn("Failed to count AFD endpoints", { profile: profile.name, error: (e as Error).message }); }
          try {
            for await (const _ of client.afdCustomDomains.listByProfile(rg, profile.name!)) { customDomainCount++; }
          } catch (e) { logger.warn("Failed to count AFD custom domains", { profile: profile.name, error: (e as Error).message }); }
          try {
            for await (const _ of client.afdOriginGroups.listByProfile(rg, profile.name!)) { originGroupCount++; }
          } catch (e) { logger.warn("Failed to count AFD origin groups", { profile: profile.name, error: (e as Error).message }); }

          logger.info("AFD profile found", { name: profile.name, rg, endpointCount, customDomainCount, originGroupCount });

          profiles.push({
            id: profile.id || "",
            name: profile.name || "",
            resourceGroup: rg,
            subscriptionId,
            location: profile.location || "Global",
            sku: skuName,
            provisioningState: profile.provisioningState || "",
            resourceState: (profile as any).resourceState || "Active",
            frontDoorId: (profile as any).frontDoorId || "",
            originResponseTimeoutSeconds: (profile as any).originResponseTimeoutSeconds || 60,
            tags: (profile.tags as Record<string, string>) || {},
            endpointCount,
            customDomainCount,
            originGroupCount,
          });
        }
      }
    } catch (error) {
      logger.error("Failed to list AFD profiles", { error });
      throw error;
    }

    return profiles;
  }

  async getProfile(subscriptionId: string, resourceGroup: string, profileName: string): Promise<AfdProfile | null> {
    const client = this.getClient(subscriptionId);
    try {
      const profile = await client.profiles.get(resourceGroup, profileName);
      const skuName = profile.sku?.name || "";

      let endpointCount = 0;
      let customDomainCount = 0;
      let originGroupCount = 0;
      try { for await (const _ of client.afdEndpoints.listByProfile(resourceGroup, profileName)) { endpointCount++; } } catch { }
      try { for await (const _ of client.afdCustomDomains.listByProfile(resourceGroup, profileName)) { customDomainCount++; } } catch { }
      try { for await (const _ of client.afdOriginGroups.listByProfile(resourceGroup, profileName)) { originGroupCount++; } } catch { }

      return {
        id: profile.id || "",
        name: profile.name || "",
        resourceGroup,
        subscriptionId,
        location: profile.location || "Global",
        sku: skuName,
        provisioningState: profile.provisioningState || "",
        resourceState: (profile as any).resourceState || "Active",
        frontDoorId: (profile as any).frontDoorId || "",
        originResponseTimeoutSeconds: (profile as any).originResponseTimeoutSeconds || 60,
        tags: (profile.tags as Record<string, string>) || {},
        endpointCount,
        customDomainCount,
        originGroupCount,
      };
    } catch (error) {
      logger.error("Failed to get AFD profile", { error, profileName });
      throw error;
    }
  }

  async listEndpoints(subscriptionId: string, resourceGroup: string, profileName: string): Promise<AfdEndpoint[]> {
    const client = this.getClient(subscriptionId);
    const endpoints: AfdEndpoint[] = [];
    try {
      for await (const ep of client.afdEndpoints.listByProfile(resourceGroup, profileName)) {
        endpoints.push({
          id: ep.id || "",
          name: ep.name || "",
          hostName: (ep as any).hostName || "",
          enabledState: (ep as any).enabledState || "",
          provisioningState: ep.provisioningState || "",
          deploymentStatus: (ep as any).deploymentStatus || "",
        });
      }
    } catch (error) {
      logger.error("Failed to list AFD endpoints", { error });
      throw error;
    }
    return endpoints;
  }

  async listOriginGroups(subscriptionId: string, resourceGroup: string, profileName: string): Promise<AfdOriginGroup[]> {
    const client = this.getClient(subscriptionId);
    const groups: AfdOriginGroup[] = [];
    try {
      for await (const og of client.afdOriginGroups.listByProfile(resourceGroup, profileName)) {
        const origins: AfdOrigin[] = [];
        try {
          for await (const origin of client.afdOrigins.listByOriginGroup(resourceGroup, profileName, og.name!)) {
            origins.push({
              id: origin.id || "",
              name: origin.name || "",
              hostName: (origin as any).hostName || "",
              httpPort: (origin as any).httpPort || 80,
              httpsPort: (origin as any).httpsPort || 443,
              originHostHeader: (origin as any).originHostHeader || "",
              priority: (origin as any).priority || 1,
              weight: (origin as any).weight || 1000,
              enabledState: (origin as any).enabledState || "",
              provisioningState: origin.provisioningState || "",
            });
          }
        } catch { }

        const hp = (og as any).healthProbeSettings;
        const lb = (og as any).loadBalancingSettings;
        groups.push({
          id: og.id || "",
          name: og.name || "",
          provisioningState: og.provisioningState || "",
          healthProbeSettings: hp ? {
            probePath: hp.probePath || "/",
            probeProtocol: hp.probeProtocol || "Https",
            probeIntervalInSeconds: hp.probeIntervalInSeconds || 30,
            probeRequestType: hp.probeRequestType || "HEAD",
          } : null,
          loadBalancingSettings: lb ? {
            sampleSize: lb.sampleSize || 4,
            successfulSamplesRequired: lb.successfulSamplesRequired || 3,
            additionalLatencyInMilliseconds: lb.additionalLatencyInMilliseconds || 50,
          } : null,
          origins,
        });
      }
    } catch (error) {
      logger.error("Failed to list AFD origin groups", { error });
      throw error;
    }
    return groups;
  }

  async listCustomDomains(subscriptionId: string, resourceGroup: string, profileName: string): Promise<AfdCustomDomain[]> {
    const client = this.getClient(subscriptionId);
    const domains: AfdCustomDomain[] = [];
    try {
      for await (const d of client.afdCustomDomains.listByProfile(resourceGroup, profileName)) {
        domains.push({
          id: d.id || "",
          name: d.name || "",
          hostName: (d as any).hostName || "",
          validationState: (d as any).validationProperties?.validationToken ? "Pending" : "Approved",
          domainValidationState: (d as any).domainValidationState || "",
          provisioningState: d.provisioningState || "",
          deploymentStatus: (d as any).deploymentStatus || "",
          tlsSettings: (d as any).tlsSettings?.certificateType || "ManagedCertificate",
        });
      }
    } catch (error) {
      logger.error("Failed to list AFD custom domains", { error });
      throw error;
    }
    return domains;
  }

  async listRoutes(subscriptionId: string, resourceGroup: string, profileName: string, endpointName: string): Promise<AfdRoute[]> {
    const client = this.getClient(subscriptionId);
    const routes: AfdRoute[] = [];
    try {
      for await (const r of client.routes.listByEndpoint(resourceGroup, profileName, endpointName)) {
        routes.push({
          id: r.id || "",
          name: r.name || "",
          endpointName,
          customDomains: ((r as any).customDomains || []).map((d: any) => d.id?.split("/").pop() || ""),
          originGroup: (r as any).originGroup?.id?.split("/").pop() || "",
          originPath: (r as any).originPath || "",
          patternsToMatch: (r as any).patternsToMatch || ["/*"],
          supportedProtocols: (r as any).supportedProtocols || [],
          httpsRedirect: (r as any).httpsRedirect || "Disabled",
          forwardingProtocol: (r as any).forwardingProtocol || "MatchRequest",
          provisioningState: r.provisioningState || "",
        });
      }
    } catch (error) {
      logger.error("Failed to list AFD routes", { error });
      throw error;
    }
    return routes;
  }

  async purgeEndpoint(subscriptionId: string, resourceGroup: string, profileName: string, endpointName: string, contentPaths: string[]): Promise<void> {
    const client = this.getClient(subscriptionId);
    try {
      await client.afdEndpoints.beginPurgeContentAndWait(resourceGroup, profileName, endpointName, { contentPaths });
      logger.info("Purged AFD endpoint", { profileName, endpointName, contentPaths });
    } catch (error) {
      logger.error("Failed to purge AFD endpoint", { error });
      throw error;
    }
  }

  async deleteProfile(subscriptionId: string, resourceGroup: string, profileName: string): Promise<void> {
    const client = this.getClient(subscriptionId);
    try {
      await client.profiles.beginDeleteAndWait(resourceGroup, profileName);
      logger.info("Deleted AFD profile", { profileName });
    } catch (error) {
      logger.error("Failed to delete AFD profile", { error });
      throw error;
    }
  }

  async createFullProfile(subscriptionId: string, params: {
    resourceGroup: string;
    location: string;
    profileName: string;
    sku: string;
    endpointName: string;
    originGroupName: string;
    originName: string;
    originHostName: string;
    originHostHeader: string;
    routeName: string;
    probeProtocol?: string;
    probePath?: string;
    probeIntervalInSeconds?: number;
    httpPort?: number;
    httpsPort?: number;
    priority?: number;
    weight?: number;
    patternsToMatch?: string[];
    forwardingProtocol?: string;
    httpsRedirect?: string;
  }): Promise<{ status: string; steps: { step: string; status: string; message: string }[] }> {
    const client = this.getClient(subscriptionId);
    const resClient = new ResourceManagementClient(getAzureCredential(), subscriptionId);
    const steps: { step: string; status: string; message: string }[] = [];

    // Step 1: Ensure resource group
    try {
      await resClient.resourceGroups.createOrUpdate(params.resourceGroup, { location: params.location });
      steps.push({ step: "Resource Group", status: "success", message: `${params.resourceGroup} ready` });
    } catch (error) {
      steps.push({ step: "Resource Group", status: "failed", message: (error as Error).message });
      return { status: "failed", steps };
    }

    // Step 2: Create AFD Profile
    try {
      await client.profiles.beginCreateAndWait(params.resourceGroup, params.profileName, {
        location: "Global",
        sku: { name: params.sku as any },
      });
      steps.push({ step: "AFD Profile", status: "success", message: `${params.profileName} created` });
    } catch (error) {
      steps.push({ step: "AFD Profile", status: "failed", message: (error as Error).message });
      return { status: "failed", steps };
    }

    // Step 3: Create Endpoint
    try {
      await client.afdEndpoints.beginCreateAndWait(params.resourceGroup, params.profileName, params.endpointName, {
        location: "Global",
        enabledState: "Enabled",
      });
      steps.push({ step: "Endpoint", status: "success", message: `${params.endpointName} created` });
    } catch (error) {
      steps.push({ step: "Endpoint", status: "failed", message: (error as Error).message });
      return { status: "failed", steps };
    }

    // Step 4: Create Origin Group
    try {
      await client.afdOriginGroups.beginCreateAndWait(params.resourceGroup, params.profileName, params.originGroupName, {
        healthProbeSettings: {
          probePath: params.probePath || "/",
          probeProtocol: (params.probeProtocol as any) || "Https",
          probeIntervalInSeconds: params.probeIntervalInSeconds || 100,
          probeRequestType: "HEAD",
        },
        loadBalancingSettings: {
          sampleSize: 4,
          successfulSamplesRequired: 3,
          additionalLatencyInMilliseconds: 50,
        },
      });
      steps.push({ step: "Origin Group", status: "success", message: `${params.originGroupName} created` });
    } catch (error) {
      steps.push({ step: "Origin Group", status: "failed", message: (error as Error).message });
      return { status: "failed", steps };
    }

    // Step 5: Create Origin
    try {
      await client.afdOrigins.beginCreateAndWait(params.resourceGroup, params.profileName, params.originGroupName, params.originName, {
        hostName: params.originHostName,
        originHostHeader: params.originHostHeader || params.originHostName,
        httpPort: params.httpPort || 80,
        httpsPort: params.httpsPort || 443,
        priority: params.priority || 1,
        weight: params.weight || 1000,
        enabledState: "Enabled",
      });
      steps.push({ step: "Origin", status: "success", message: `${params.originName} → ${params.originHostName}` });
    } catch (error) {
      steps.push({ step: "Origin", status: "failed", message: (error as Error).message });
      return { status: "failed", steps };
    }

    // Step 6: Create Route
    try {
      await client.routes.beginCreateAndWait(params.resourceGroup, params.profileName, params.endpointName, params.routeName, {
        originGroup: {
          id: `/subscriptions/${subscriptionId}/resourceGroups/${params.resourceGroup}/providers/Microsoft.Cdn/profiles/${params.profileName}/originGroups/${params.originGroupName}`,
        },
        patternsToMatch: params.patternsToMatch || ["/*"],
        supportedProtocols: ["Https"],
        forwardingProtocol: (params.forwardingProtocol as any) || "HttpsOnly",
        httpsRedirect: (params.httpsRedirect as any) || "Enabled",
        linkToDefaultDomain: "Enabled",
      });
      steps.push({ step: "Route", status: "success", message: `${params.routeName} configured` });
    } catch (error) {
      steps.push({ step: "Route", status: "failed", message: (error as Error).message });
      return { status: "partial", steps };
    }

    logger.info("Created full AFD profile", { profileName: params.profileName, steps: steps.length });
    return { status: "success", steps };
  }
}
