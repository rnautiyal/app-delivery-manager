import crypto from "crypto";
import { StorageService } from "./storageService";
import { GatewayService } from "./gatewayService";
import { NetworkService } from "./networkService";
import { logger } from "../config/logger";

export interface GatewayBackup {
  id: string;
  gatewayName: string;
  resourceGroup: string;
  subscriptionId: string;
  location: string;
  createdAt: string;
  createdBy: string;
  description: string;
  sku: string;
  config: any;
  // Infrastructure references for full restore
  infra: {
    subnetId: string;
    vnetName: string;
    subnetName: string;
    publicIpId?: string;
    publicIpName?: string;
  };
}

export class BackupService {
  private storage = new StorageService<GatewayBackup>("backups.json");
  private gatewayService = new GatewayService();
  private networkService = new NetworkService();

  async createBackup(
    subscriptionId: string,
    resourceGroup: string,
    gatewayName: string,
    createdBy: string,
    description?: string
  ): Promise<GatewayBackup> {
    const gw = await this.gatewayService.getGateway(subscriptionId, resourceGroup, gatewayName);

    // Extract infrastructure references from the gateway config
    const subnetId = gw.gatewayIPConfigurations?.[0]?.subnet?.id || "";
    const publicIpId = gw.frontendIPConfigurations?.[0]?.publicIPAddress?.id || "";

    // Parse names from resource IDs
    // Subnet ID format: /subscriptions/.../virtualNetworks/{vnetName}/subnets/{subnetName}
    const subnetParts = subnetId.split("/");
    const vnetName = subnetParts[subnetParts.indexOf("virtualNetworks") + 1] || "";
    const subnetName = subnetParts[subnetParts.indexOf("subnets") + 1] || "";
    const publicIpName = publicIpId ? publicIpId.split("/").pop() || "" : "";

    const backup: GatewayBackup = {
      id: crypto.randomUUID(),
      gatewayName,
      resourceGroup,
      subscriptionId,
      location: gw.location || "",
      createdAt: new Date().toISOString(),
      createdBy,
      description: description || `Backup of ${gatewayName}`,
      sku: `${gw.sku?.name} / ${gw.sku?.tier}`,
      config: gw,
      infra: {
        subnetId,
        vnetName,
        subnetName,
        publicIpId,
        publicIpName,
      },
    };

    this.storage.add(backup);
    logger.info("Gateway backup created", {
      backupId: backup.id,
      gatewayName,
      vnet: vnetName,
      subnet: subnetName,
      publicIp: publicIpName,
    });
    return backup;
  }

  listBackups(subscriptionId?: string, gatewayName?: string): GatewayBackup[] {
    let backups = this.storage.readAll();
    if (subscriptionId) backups = backups.filter((b) => b.subscriptionId === subscriptionId);
    if (gatewayName) backups = backups.filter((b) => b.gatewayName === gatewayName);
    return backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getBackup(id: string): GatewayBackup {
    const backup = this.storage.findById(id);
    if (!backup) throw new Error(`Backup not found: ${id}`);
    return backup;
  }

  deleteBackup(id: string): void {
    this.storage.remove(id);
    logger.info("Gateway backup deleted", { backupId: id });
  }

  compareBackups(id1: string, id2: string): { differences: any[]; summary: string } {
    const b1 = this.getBackup(id1);
    const b2 = this.getBackup(id2);
    const differences: any[] = [];

    const compareArrays = (name: string, arr1: any[], arr2: any[]) => {
      const names1 = new Set((arr1 || []).map((a: any) => a.name));
      const names2 = new Set((arr2 || []).map((a: any) => a.name));
      for (const n of names1) if (!names2.has(n)) differences.push({ component: name, change: "removed", name: n });
      for (const n of names2) if (!names1.has(n)) differences.push({ component: name, change: "added", name: n });
      for (const n of names1) {
        if (names2.has(n)) {
          const item1 = arr1.find((a: any) => a.name === n);
          const item2 = arr2.find((a: any) => a.name === n);
          const s1 = JSON.stringify(item1, null, 0);
          const s2 = JSON.stringify(item2, null, 0);
          if (s1 !== s2) differences.push({ component: name, change: "modified", name: n });
        }
      }
    };

    compareArrays("backendAddressPools", b1.config.backendAddressPools, b2.config.backendAddressPools);
    compareArrays("backendHttpSettingsCollection", b1.config.backendHttpSettingsCollection, b2.config.backendHttpSettingsCollection);
    compareArrays("httpListeners", b1.config.httpListeners, b2.config.httpListeners);
    compareArrays("requestRoutingRules", b1.config.requestRoutingRules, b2.config.requestRoutingRules);
    compareArrays("probes", b1.config.probes, b2.config.probes);
    compareArrays("frontendPorts", b1.config.frontendPorts, b2.config.frontendPorts);

    const summary = differences.length === 0
      ? "Backups are identical"
      : `${differences.length} difference(s): ${differences.filter(d => d.change === "added").length} added, ${differences.filter(d => d.change === "removed").length} removed, ${differences.filter(d => d.change === "modified").length} modified`;

    return { differences, summary };
  }

  async compareWithLive(backupId: string): Promise<{ differences: any[]; summary: string }> {
    const backup = this.getBackup(backupId);
    try {
      const liveGw = await this.gatewayService.getGateway(backup.subscriptionId, backup.resourceGroup, backup.gatewayName);
      const liveBackup: GatewayBackup = { ...backup, id: "live", config: liveGw, createdAt: new Date().toISOString() };
      // Temporarily store for comparison
      const differences: any[] = [];
      const compareArrays = (name: string, arr1: any[], arr2: any[]) => {
        const names1 = new Set((arr1 || []).map((a: any) => a.name));
        const names2 = new Set((arr2 || []).map((a: any) => a.name));
        for (const n of names1) if (!names2.has(n)) differences.push({ component: name, change: "in_backup_only", name: n });
        for (const n of names2) if (!names1.has(n)) differences.push({ component: name, change: "in_live_only", name: n });
        for (const n of names1) {
          if (names2.has(n)) {
            const item1 = arr1.find((a: any) => a.name === n);
            const item2 = arr2.find((a: any) => a.name === n);
            if (JSON.stringify(item1) !== JSON.stringify(item2)) differences.push({ component: name, change: "modified", name: n });
          }
        }
      };
      compareArrays("backendAddressPools", backup.config.backendAddressPools, liveGw.backendAddressPools || []);
      compareArrays("backendHttpSettingsCollection", backup.config.backendHttpSettingsCollection, liveGw.backendHttpSettingsCollection || []);
      compareArrays("httpListeners", backup.config.httpListeners, liveGw.httpListeners || []);
      compareArrays("requestRoutingRules", backup.config.requestRoutingRules, liveGw.requestRoutingRules || []);
      compareArrays("probes", backup.config.probes, liveGw.probes || []);

      const summary = differences.length === 0
        ? "Backup matches live configuration"
        : `${differences.length} difference(s) between backup and live config`;
      return { differences, summary };
    } catch {
      return { differences: [], summary: "Gateway not found — cannot compare with live" };
    }
  }

  async restoreBackup(backupId: string): Promise<any> {
    const backup = this.getBackup(backupId);
    const { subscriptionId, resourceGroup, gatewayName, location } = backup;
    const steps: string[] = [];

    // Step 0: Auto-backup current state before restoring (if gateway exists)
    let gatewayExists = false;
    try {
      await this.gatewayService.getGateway(subscriptionId, resourceGroup, gatewayName);
      gatewayExists = true;
    } catch {
      gatewayExists = false;
    }

    if (gatewayExists) {
      // Create auto-backup before restore
      try {
        steps.push("Creating auto-backup of current state before restore");
        await this.createBackup(subscriptionId, resourceGroup, gatewayName, "system", `Auto-backup before restore from backup ${backupId}`);
        steps.push("Auto-backup created successfully");
      } catch (err: any) {
        steps.push(`Auto-backup warning: ${err.message}`);
        logger.warn("Auto-backup before restore failed", { backupId, error: err.message });
      }

      // Gateway exists — do a config update
      logger.info("Gateway exists, restoring config via update", { gatewayName });
      steps.push("Gateway exists — updating configuration");

      const config = this.cleanConfigForUpdate(backup.config);
      const result = await this.gatewayService.updateGateway(subscriptionId, resourceGroup, gatewayName, config);
      steps.push("Gateway configuration restore started (2-5 min)");

      return { status: "restoring", steps, result };
    }

    // Gateway deleted — full rebuild
    logger.info("Gateway not found, performing full restore", { gatewayName, resourceGroup });

    // Step 2: Ensure resource group exists
    try {
      steps.push(`Creating resource group: ${resourceGroup}`);
      await this.networkService.createResourceGroup(subscriptionId, resourceGroup, location);
      steps.push("Resource group ready");
    } catch (err: any) {
      if (!err.message?.includes("already exists")) {
        steps.push(`Resource group: ${err.message}`);
      } else {
        steps.push("Resource group already exists");
      }
    }

    // Backfill infra info for old backups that don't have it
    if (!backup.infra) {
      const subnetId = backup.config?.gatewayIPConfigurations?.[0]?.subnet?.id || "";
      const publicIpId = backup.config?.frontendIPConfigurations?.[0]?.publicIPAddress?.id || "";
      const subnetParts = subnetId.split("/");
      backup.infra = {
        subnetId,
        vnetName: subnetParts[subnetParts.indexOf("virtualNetworks") + 1] || "",
        subnetName: subnetParts[subnetParts.indexOf("subnets") + 1] || "",
        publicIpId,
        publicIpName: publicIpId ? publicIpId.split("/").pop() || "" : "",
      };
      logger.info("Backfilled infra for legacy backup", { backupId, infra: backup.infra });
    }

    // Step 3: Ensure VNet + subnet exist (create together in one call)
    const { vnetName, subnetName } = backup.infra;
    if (vnetName && subnetName) {
      try {
        steps.push(`Creating VNet ${vnetName} with subnet ${subnetName}`);
        await this.networkService.createVnet(subscriptionId, resourceGroup, vnetName, location, "10.0.0.0/16", subnetName, "10.0.1.0/24");
        steps.push("VNet + subnet ready");
      } catch (err: any) {
        steps.push(`VNet: ${err.message?.includes("already exists") ? "already exists" : err.message}`);
      }
    }

    // Step 5: Ensure public IP exists
    const { publicIpName } = backup.infra;
    if (publicIpName) {
      try {
        steps.push(`Creating public IP: ${publicIpName}`);
        await this.networkService.createPublicIp(subscriptionId, resourceGroup, publicIpName, location, "Standard");
        steps.push("Public IP ready");
      } catch (err: any) {
        steps.push(`Public IP: ${err.message?.includes("already exists") ? "already exists" : err.message}`);
      }
    }

    // Step 6: Recreate gateway with rebuilt config (rewrite all resource IDs to match new infra)
    steps.push(`Creating Application Gateway: ${gatewayName}`);
    const config = this.rebuildConfigForCreate(backup, subscriptionId, resourceGroup, gatewayName);
    const result = await this.gatewayService.createGateway(subscriptionId, resourceGroup, gatewayName, config);
    steps.push("Gateway creation started (5-10 min to provision)");

    logger.info("Full gateway restore initiated", {
      backupId,
      gatewayName,
      steps,
    });

    return {
      status: "restoring_full",
      message: `Full restore of '${gatewayName}' started. Infrastructure recreated and gateway provisioning (5-10 min).`,
      steps,
      result,
    };
  }

  private cleanConfigForUpdate(config: any): any {
    const cleaned = { ...config };
    delete cleaned.operationalState;
    delete cleaned.provisioningState;
    delete cleaned.resourceGuid;
    delete cleaned.etag;

    if (cleaned.sslCertificates) {
      cleaned.sslCertificates = cleaned.sslCertificates.filter(
        (cert: any) => cert.data || cert.keyVaultSecretId
      );
    }

    for (const pool of cleaned.backendAddressPools || []) {
      delete pool.backendIPConfigurations;
    }

    return cleaned;
  }

  private cleanConfigForCreate(config: any): any {
    const cleaned = this.cleanConfigForUpdate(config);
    delete cleaned.id;
    return cleaned;
  }

  private rebuildConfigForCreate(backup: GatewayBackup, subscriptionId: string, resourceGroup: string, gatewayName: string): any {
    const config = this.cleanConfigForCreate(backup.config);
    const basePath = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/applicationGateways/${gatewayName}`;

    // Drop SSL certificates that don't have data (Azure strips data on GET)
    // Then drop any HTTPS listeners and routing rules that reference missing certs
    const validCertNames = new Set<string>();
    if (config.sslCertificates) {
      config.sslCertificates = config.sslCertificates.filter((cert: any) => {
        if (cert.data || cert.keyVaultSecretId) {
          validCertNames.add(cert.name);
          return true;
        }
        return false;
      });
    }

    // Drop HTTPS listeners that reference missing certs
    const droppedListenerNames = new Set<string>();
    if (config.httpListeners) {
      config.httpListeners = config.httpListeners.filter((listener: any) => {
        if (listener.protocol === "Https" && listener.sslCertificate?.id) {
          const certName = listener.sslCertificate.id.split("/").pop();
          if (!validCertNames.has(certName)) {
            droppedListenerNames.add(listener.name);
            logger.info("Dropping HTTPS listener with missing cert", { listener: listener.name, cert: certName });
            return false;
          }
        }
        return true;
      });
    }

    // Drop routing rules that reference dropped listeners
    if (config.requestRoutingRules) {
      config.requestRoutingRules = config.requestRoutingRules.filter((rule: any) => {
        const listenerName = rule.httpListener?.id?.split("/").pop();
        if (listenerName && droppedListenerNames.has(listenerName)) {
          logger.info("Dropping routing rule for dropped listener", { rule: rule.name, listener: listenerName });
          return false;
        }
        return true;
      });
    }

    // Drop redirect configurations that reference dropped listeners
    if (config.redirectConfigurations) {
      config.redirectConfigurations = config.redirectConfigurations.filter((rc: any) => {
        const targetListener = rc.targetListener?.id?.split("/").pop();
        return !targetListener || !droppedListenerNames.has(targetListener);
      });
    }

    // Rewrite all internal resource ID references to point to the correct gateway
    const rewriteId = (id: string | undefined): string | undefined => {
      if (!id) return id;
      // Extract the sub-resource path (everything after /applicationGateways/{name}/)
      const match = id.match(/\/applicationGateways\/[^/]+\/(.*)/);
      if (match) {
        return `${basePath}/${match[1]}`;
      }
      return id;
    };

    // Rewrite subnet reference
    if (config.gatewayIPConfigurations) {
      for (const ipConfig of config.gatewayIPConfigurations) {
        if (ipConfig.subnet?.id) {
          // Keep the original subnet ID — it points to the VNet/subnet we just recreated
          const { vnetName, subnetName } = backup.infra;
          ipConfig.subnet.id = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/virtualNetworks/${vnetName}/subnets/${subnetName}`;
        }
      }
    }

    // Rewrite public IP reference
    if (config.frontendIPConfigurations) {
      for (const feConfig of config.frontendIPConfigurations) {
        if (feConfig.publicIPAddress?.id) {
          const { publicIpName } = backup.infra;
          feConfig.publicIPAddress.id = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/publicIPAddresses/${publicIpName}`;
        }
        if (feConfig.id) feConfig.id = rewriteId(feConfig.id);
      }
    }

    // Rewrite all internal self-references
    const rewriteArray = (arr: any[] | undefined) => {
      if (!arr) return;
      for (const item of arr) {
        if (item.id) item.id = rewriteId(item.id);
        // Rewrite nested references
        for (const key of Object.keys(item)) {
          const val = item[key];
          if (val && typeof val === "object" && val.id && typeof val.id === "string") {
            val.id = rewriteId(val.id);
          }
        }
      }
    };

    rewriteArray(config.frontendPorts);
    rewriteArray(config.backendAddressPools);
    rewriteArray(config.backendHttpSettingsCollection);
    rewriteArray(config.httpListeners);
    rewriteArray(config.requestRoutingRules);
    rewriteArray(config.probes);
    rewriteArray(config.redirectConfigurations);
    rewriteArray(config.urlPathMaps);

    return config;
  }
}
