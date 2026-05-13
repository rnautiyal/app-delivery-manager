import { GatewayService } from "./gatewayService";
import { ManagedGroupService, ManagedGroup } from "./managedGroupService";
import { ApplicationGateway } from "@azure/arm-network";
import { logger } from "../config/logger";

interface SyncResult {
  groupId: string;
  masterGateway: string;
  slaveResults: {
    gatewayId: string;
    gatewayName: string;
    status: "success" | "failed" | "skipped";
    message: string;
  }[];
  syncedAt: string;
}

interface SyncDiff {
  slaveGateway: string;
  differences: {
    component: string;
    change: "will_add" | "will_remove" | "will_modify" | "in_sync";
    name: string;
  }[];
  summary: string;
}

// In-memory sync history
const syncHistory: Array<SyncResult & { id: string }> = [];

export class ConfigSyncService {
  private gatewayService = new GatewayService();
  private groupService = new ManagedGroupService();

  private parseResourceId(resourceId: string) {
    const parts = resourceId.split("/");
    const subIdx = parts.indexOf("subscriptions");
    const rgIdx = parts.indexOf("resourceGroups") !== -1 ? parts.indexOf("resourceGroups") : parts.indexOf("resourcegroups");
    return {
      subscriptionId: subIdx >= 0 ? parts[subIdx + 1] : "",
      resourceGroup: rgIdx >= 0 ? parts[rgIdx + 1] : "",
      name: parts[parts.length - 1],
    };
  }

  async syncGroup(groupId: string): Promise<SyncResult> {
    const group = this.groupService.getGroup(groupId);
    if (!group) throw new Error("Group not found");
    if (!group.masterGatewayId) throw new Error("No master gateway set for this group");

    const masterParts = this.parseResourceId(group.masterGatewayId);
    logger.info("Starting config sync", { groupId, master: masterParts.name });

    // Get master gateway config
    let masterGw: ApplicationGateway;
    try {
      masterGw = await this.gatewayService.getGateway(
        masterParts.subscriptionId,
        masterParts.resourceGroup,
        masterParts.name
      );
    } catch (error) {
      this.groupService.updateSyncStatus(groupId, "failed");
      throw new Error(`Failed to read master gateway: ${(error as Error).message}`);
    }

    // Get slave gateway IDs (all gateways except master)
    const slaveIds = group.resources.gateways.filter(id => id !== group.masterGatewayId);
    if (slaveIds.length === 0) {
      this.groupService.updateSyncStatus(groupId, "no_slaves");
      return {
        groupId,
        masterGateway: masterParts.name,
        slaveResults: [],
        syncedAt: new Date().toISOString(),
      };
    }

    const results: SyncResult["slaveResults"] = [];

    for (const slaveId of slaveIds) {
      const slaveParts = this.parseResourceId(slaveId);
      try {
        // Get current slave config
        const slaveGw = await this.gatewayService.getGateway(
          slaveParts.subscriptionId,
          slaveParts.resourceGroup,
          slaveParts.name
        );

        // Apply master config to slave
        const updatedSlave = this.applyMasterConfig(masterGw, slaveGw, group);

        // Update the slave gateway
        await this.gatewayService.updateGateway(
          slaveParts.subscriptionId,
          slaveParts.resourceGroup,
          slaveParts.name,
          updatedSlave
        );

        results.push({
          gatewayId: slaveId,
          gatewayName: slaveParts.name,
          status: "success",
          message: "Config sync started (2-5 min to complete)",
        });

        logger.info("Synced slave gateway", { slave: slaveParts.name, master: masterParts.name });
      } catch (error) {
        results.push({
          gatewayId: slaveId,
          gatewayName: slaveParts.name,
          status: "failed",
          message: (error as Error).message,
        });
        logger.error("Failed to sync slave", { slave: slaveParts.name, error });
      }
    }

    const allSuccess = results.every(r => r.status === "success");
    const anyFailed = results.some(r => r.status === "failed");
    const status = allSuccess ? "success" : anyFailed ? "partial" : "success";
    this.groupService.updateSyncStatus(groupId, status);

    const syncResult: SyncResult = {
      groupId,
      masterGateway: masterParts.name,
      slaveResults: results,
      syncedAt: new Date().toISOString(),
    };

    // Save to history
    syncHistory.unshift({ ...syncResult, id: `sync-${Date.now()}` });
    if (syncHistory.length > 50) syncHistory.length = 50;

    return syncResult;
  }

  async previewSync(groupId: string): Promise<SyncDiff[]> {
    const group = this.groupService.getGroup(groupId);
    if (!group) throw new Error("Group not found");
    if (!group.masterGatewayId) throw new Error("No master gateway set for this group");

    const masterParts = this.parseResourceId(group.masterGatewayId);
    const masterGw = await this.gatewayService.getGateway(masterParts.subscriptionId, masterParts.resourceGroup, masterParts.name);

    const slaveIds = group.resources.gateways.filter(id => id !== group.masterGatewayId);
    const diffs: SyncDiff[] = [];

    for (const slaveId of slaveIds) {
      const slaveParts = this.parseResourceId(slaveId);
      try {
        const slaveGw = await this.gatewayService.getGateway(slaveParts.subscriptionId, slaveParts.resourceGroup, slaveParts.name);
        const differences: SyncDiff["differences"] = [];
        const cfg = group.syncConfig;

        const compareArrays = (component: string, shouldSync: boolean, masterArr: any[], slaveArr: any[]) => {
          if (!shouldSync) return;
          const masterNames = new Set((masterArr || []).map((a: any) => a.name));
          const slaveNames = new Set((slaveArr || []).map((a: any) => a.name));
          for (const n of masterNames) {
            if (!slaveNames.has(n)) {
              differences.push({ component, change: "will_add", name: n });
            } else {
              const m = masterArr.find((a: any) => a.name === n);
              const s = slaveArr.find((a: any) => a.name === n);
              // Compare without IDs
              const mClean = JSON.stringify({ ...m, id: undefined, etag: undefined, provisioningState: undefined });
              const sClean = JSON.stringify({ ...s, id: undefined, etag: undefined, provisioningState: undefined });
              if (mClean !== sClean) {
                differences.push({ component, change: "will_modify", name: n });
              } else {
                differences.push({ component, change: "in_sync", name: n });
              }
            }
          }
          for (const n of slaveNames) {
            if (!masterNames.has(n)) {
              differences.push({ component, change: "will_remove", name: n });
            }
          }
        };

        compareArrays("backendPools", cfg.syncBackendPools, masterGw.backendAddressPools || [], slaveGw.backendAddressPools || []);
        compareArrays("httpSettings", cfg.syncHttpSettings, masterGw.backendHttpSettingsCollection || [], slaveGw.backendHttpSettingsCollection || []);
        compareArrays("listeners", cfg.syncListeners, masterGw.httpListeners || [], slaveGw.httpListeners || []);
        compareArrays("routingRules", cfg.syncRules, masterGw.requestRoutingRules || [], slaveGw.requestRoutingRules || []);
        compareArrays("probes", cfg.syncProbes, masterGw.probes || [], slaveGw.probes || []);

        const changesCount = differences.filter(d => d.change !== "in_sync").length;
        diffs.push({
          slaveGateway: slaveParts.name,
          differences,
          summary: changesCount === 0 ? "Already in sync" : `${changesCount} change(s) will be applied`,
        });
      } catch (error) {
        diffs.push({
          slaveGateway: slaveParts.name,
          differences: [],
          summary: `Cannot read slave: ${(error as Error).message}`,
        });
      }
    }

    return diffs;
  }

  getSyncHistory(groupId?: string): Array<SyncResult & { id: string }> {
    if (groupId) return syncHistory.filter(h => h.groupId === groupId);
    return syncHistory;
  }

  private applyMasterConfig(
    master: ApplicationGateway,
    slave: ApplicationGateway,
    group: ManagedGroup
  ): ApplicationGateway {
    const cfg = group.syncConfig;
    const slaveSubId = slave.id?.split("/subscriptions/")[1]?.split("/")[0] || "";
    const slaveRg = slave.id?.split(/resourceGroups\//i)[1]?.split("/")[0] || "";
    const slaveName = slave.name || "";

    // Helper: rewrite resource IDs from master to slave context
    const rewriteId = (id: string | undefined): string => {
      if (!id) return "";
      // Replace subscription, resource group, and gateway name in resource IDs
      const masterSub = master.id?.split("/subscriptions/")[1]?.split("/")[0] || "";
      const masterRg = master.id?.split(/resourceGroups\//i)[1]?.split("/")[0] || "";
      const masterName = master.name || "";

      return id
        .replace(masterSub, slaveSubId)
        .replace(new RegExp(masterRg, "gi"), slaveRg)
        .replace(new RegExp(`/applicationGateways/${masterName}/`, "gi"), `/applicationGateways/${slaveName}/`);
    };

    const rewriteIds = (obj: any): any => {
      if (!obj) return obj;
      if (typeof obj === "string") return obj;
      if (Array.isArray(obj)) return obj.map(rewriteIds);
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key === "id" && typeof value === "string" && value.includes("/applicationGateways/")) {
          result[key] = rewriteId(value);
        } else if (typeof value === "object" && value !== null) {
          result[key] = rewriteIds(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    };

    // Start from slave config and overlay master settings
    const updated = { ...slave };

    if (cfg.syncBackendPools && master.backendAddressPools) {
      updated.backendAddressPools = rewriteIds(JSON.parse(JSON.stringify(master.backendAddressPools)));
    }

    if (cfg.syncHttpSettings && master.backendHttpSettingsCollection) {
      updated.backendHttpSettingsCollection = rewriteIds(JSON.parse(JSON.stringify(master.backendHttpSettingsCollection)));
    }

    if (cfg.syncListeners && master.httpListeners) {
      // Listeners reference frontendIPConfigurations and frontendPorts by name.
      // These names differ per gateway, so we need to map master names to slave names.
      const masterFrontendIpMap = new Map<string, string>();
      const masterFrontendPortMap = new Map<string, string>();

      // Build mapping: master frontend IP name → slave frontend IP name (by index)
      const masterFips = master.frontendIPConfigurations || [];
      const slaveFips = slave.frontendIPConfigurations || [];
      for (let i = 0; i < masterFips.length && i < slaveFips.length; i++) {
        if (masterFips[i].name && slaveFips[i].name) {
          masterFrontendIpMap.set(masterFips[i].name!, slaveFips[i].name!);
        }
      }

      // Build mapping: master frontend port value → slave port (by port number)
      const masterPorts = master.frontendPorts || [];
      const slavePorts = slave.frontendPorts || [];
      const slavePortByValue = new Map<number, string>();
      for (const sp of slavePorts) {
        if (sp.port && sp.name) slavePortByValue.set(sp.port, sp.name);
      }

      // Sync frontend ports: add any missing ports from master to slave
      const updatedPorts = [...(slave.frontendPorts || [])];
      for (const mp of masterPorts) {
        if (mp.port && !slavePortByValue.has(mp.port)) {
          updatedPorts.push({ name: mp.name, port: mp.port });
          if (mp.name) slavePortByValue.set(mp.port, mp.name);
        }
        // Map master port name to slave port name by port value
        if (mp.port && mp.name) {
          const slaveName = slavePortByValue.get(mp.port);
          if (slaveName) masterFrontendPortMap.set(mp.name, slaveName);
        }
      }
      updated.frontendPorts = updatedPorts;

      // Rewrite listener references to use slave frontend IP/port names
      const syncedListeners = JSON.parse(JSON.stringify(master.httpListeners));
      for (const listener of syncedListeners) {
        // Rewrite frontend IP config reference
        if (listener.frontendIPConfiguration?.id) {
          let id = rewriteId(listener.frontendIPConfiguration.id);
          for (const [masterName, slaveName] of masterFrontendIpMap) {
            id = id.replace(`/frontendIPConfigurations/${masterName}`, `/frontendIPConfigurations/${slaveName}`);
          }
          listener.frontendIPConfiguration.id = id;
        }
        // Rewrite frontend port reference
        if (listener.frontendPort?.id) {
          let id = rewriteId(listener.frontendPort.id);
          for (const [masterName, slaveName] of masterFrontendPortMap) {
            id = id.replace(`/frontendPorts/${masterName}`, `/frontendPorts/${slaveName}`);
          }
          listener.frontendPort.id = id;
        }
        // Rewrite SSL cert reference
        if (listener.sslCertificate?.id) {
          listener.sslCertificate.id = rewriteId(listener.sslCertificate.id);
        }
        // Remove read-only props
        delete listener.provisioningState;
        delete listener.etag;
      }
      updated.httpListeners = syncedListeners;
      // Preserve slave's frontend IPs (they are unique per gateway)
      updated.frontendIPConfigurations = slave.frontendIPConfigurations;
    }

    if (cfg.syncRules && master.requestRoutingRules) {
      updated.requestRoutingRules = rewriteIds(JSON.parse(JSON.stringify(master.requestRoutingRules)));
      if (master.urlPathMaps) {
        updated.urlPathMaps = rewriteIds(JSON.parse(JSON.stringify(master.urlPathMaps)));
      }
      if (master.redirectConfigurations) {
        updated.redirectConfigurations = rewriteIds(JSON.parse(JSON.stringify(master.redirectConfigurations)));
      }
      if (master.rewriteRuleSets) {
        updated.rewriteRuleSets = rewriteIds(JSON.parse(JSON.stringify(master.rewriteRuleSets)));
      }
    }

    if (cfg.syncProbes && master.probes) {
      updated.probes = rewriteIds(JSON.parse(JSON.stringify(master.probes)));
    }

    if (cfg.syncWafConfig && master.webApplicationFirewallConfiguration) {
      updated.webApplicationFirewallConfiguration = JSON.parse(JSON.stringify(master.webApplicationFirewallConfiguration));
    }

    if (cfg.syncSslCerts && master.sslCertificates) {
      // Only sync Key Vault referenced certs, not inline data
      const kvCerts = master.sslCertificates.filter(c => c.keyVaultSecretId);
      if (kvCerts.length > 0) {
        updated.sslCertificates = rewriteIds(JSON.parse(JSON.stringify(kvCerts)));
      }
    }

    // Remove read-only props
    delete (updated as any).operationalState;
    delete (updated as any).provisioningState;
    delete (updated as any).resourceGuid;
    delete (updated as any).etag;

    // Clean empty SSL certs
    if (updated.sslCertificates) {
      updated.sslCertificates = updated.sslCertificates.filter(cert => cert.data || cert.keyVaultSecretId);
    }
    for (const pool of updated.backendAddressPools || []) {
      delete (pool as any).backendIPConfigurations;
    }

    return updated;
  }
}
