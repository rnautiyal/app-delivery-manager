import { NetworkManagementClient } from "@azure/arm-network";
import { getAzureCredential } from "../config/azure";
import { logger } from "../config/logger";
import { PrivateDnsService } from "./privateDnsService";
import { FailoverGroup, FailoverHistoryEntry, FailoverStatus } from "../models/types";
import * as fs from "fs";
import * as path from "path";

const DATA_FILE = path.join(__dirname, "../../data/failover-groups.json");

export class FailoverService {
  private privateDns = new PrivateDnsService();
  private probeTimer: NodeJS.Timeout | null = null;
  // Track consecutive failures per endpoint
  private failureCounts: Map<string, number> = new Map();

  private loadData(): { failoverGroups: FailoverGroup[]; failoverHistory: FailoverHistoryEntry[] } {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  }

  private saveData(data: { failoverGroups: FailoverGroup[]; failoverHistory: FailoverHistoryEntry[] }) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  }

  // ==================== CRUD ====================

  listGroups(): FailoverGroup[] {
    return this.loadData().failoverGroups;
  }

  getGroup(id: string): FailoverGroup | undefined {
    return this.loadData().failoverGroups.find((g) => g.id === id);
  }

  createGroup(group: Omit<FailoverGroup, "id" | "createdAt">): FailoverGroup {
    const data = this.loadData();
    const newGroup: FailoverGroup = {
      ...group,
      id: `fg-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    data.failoverGroups.push(newGroup);
    this.saveData(data);
    logger.info("Created failover group", { id: newGroup.id, name: newGroup.name });
    return newGroup;
  }

  deleteGroup(id: string): boolean {
    const data = this.loadData();
    const idx = data.failoverGroups.findIndex((g) => g.id === id);
    if (idx === -1) return false;
    data.failoverGroups.splice(idx, 1);
    this.saveData(data);
    return true;
  }

  updateGroup(id: string, updates: Partial<FailoverGroup>): FailoverGroup | null {
    const data = this.loadData();
    const idx = data.failoverGroups.findIndex((g) => g.id === id);
    if (idx === -1) return null;
    const group = data.failoverGroups[idx];
    // Only allow updating safe fields
    if (updates.failoverMode) group.failoverMode = updates.failoverMode;
    if (updates.probeIntervalSeconds !== undefined) group.probeIntervalSeconds = updates.probeIntervalSeconds;
    if (updates.failureThreshold !== undefined) group.failureThreshold = updates.failureThreshold;
    if (updates.autoFailover !== undefined) group.autoFailover = updates.autoFailover;
    if (updates.ttlSeconds !== undefined) group.ttlSeconds = updates.ttlSeconds;
    if (updates.name) group.name = updates.name;
    data.failoverGroups[idx] = group;
    this.saveData(data);
    logger.info("Updated failover group", { id, updates });
    return group;
  }

  getHistory(groupId?: string, limit: number = 20): FailoverHistoryEntry[] {
    const data = this.loadData();
    let history = data.failoverHistory;
    if (groupId) history = history.filter((h) => h.failoverGroupId === groupId);
    return history.slice(-limit).reverse();
  }

  private addHistory(entry: Omit<FailoverHistoryEntry, "id" | "timestamp">) {
    const data = this.loadData();
    data.failoverHistory.push({
      ...entry,
      id: `fh-${Date.now()}`,
      timestamp: new Date().toISOString(),
    });
    // Keep last 100 entries
    if (data.failoverHistory.length > 100) {
      data.failoverHistory = data.failoverHistory.slice(-100);
    }
    this.saveData(data);
  }

  // ==================== HEALTH CHECK ====================

  private getNetworkClient(subscriptionId: string): NetworkManagementClient {
    return new NetworkManagementClient(getAzureCredential(), subscriptionId);
  }

  async checkEndpointHealth(subscriptionId: string, resourceGroup: string, gatewayName: string): Promise<{ operationalState: string; healthy: boolean }> {
    try {
      const client = this.getNetworkClient(subscriptionId);

      // First check if the gateway resource is running at all
      const gw = await client.applicationGateways.get(resourceGroup, gatewayName);
      const state = gw.operationalState || "Unknown";
      if (state !== "Running") {
        return { operationalState: state, healthy: false };
      }

      // Gateway is running — now check actual backend health via ARM API
      // This calls GET /backendhealth which runs real health probes against backends
      try {
        const backendHealth = await client.applicationGateways.beginBackendHealthAndWait(resourceGroup, gatewayName);
        const pools = backendHealth.backendAddressPools || [];
        let totalServers = 0;
        let healthyServers = 0;

        for (const pool of pools) {
          for (const httpSettings of pool.backendHttpSettingsCollection || []) {
            for (const server of httpSettings.servers || []) {
              totalServers++;
              if (server.health === "Healthy") {
                healthyServers++;
              }
            }
          }
        }

        if (totalServers === 0) {
          // No backend servers configured — treat as healthy (gateway-level only)
          return { operationalState: "Running", healthy: true };
        }

        const allHealthy = healthyServers > 0;
        const healthState = allHealthy
          ? `Running (${healthyServers}/${totalServers} backends healthy)`
          : `BackendsUnhealthy (0/${totalServers} healthy)`;

        logger.info("Backend health check result", { gatewayName, healthyServers, totalServers });
        return { operationalState: healthState, healthy: allHealthy };
      } catch (backendErr: any) {
        // If backend health check fails, fall back to operationalState
        logger.warn("Backend health API failed, using operationalState", { gatewayName, error: backendErr.message });
        return { operationalState: state, healthy: state === "Running" };
      }
    } catch (error: any) {
      logger.error("Failed to check endpoint health", { gatewayName, error: error.message });
      return { operationalState: "Error", healthy: false };
    }
  }

  // ==================== STATUS ====================

  async getFailoverStatus(groupId: string): Promise<FailoverStatus | null> {
    const group = this.getGroup(groupId);
    if (!group) return null;

    // Get current DNS record
    const dnsRecord = await this.privateDns.getARecord(
      group.subscriptionId, group.dnsResourceGroup, group.dnsZone, group.recordName
    );
    const activeIps = (dnsRecord?.ips || []).filter((ip): ip is string => ip !== undefined);

    // Check each endpoint's health
    const endpointHealth = await Promise.all(
      group.endpoints.map(async (ep) => {
        const health = await this.checkEndpointHealth(group.subscriptionId, ep.resourceGroup, ep.appGateway);
        return {
          ip: ep.ip,
          appGateway: ep.appGateway,
          region: ep.region,
          label: ep.label,
          operationalState: health.operationalState,
          healthy: health.healthy,
          inDns: activeIps.includes(ep.ip),
        };
      })
    );

    const healthyInDns = endpointHealth.filter((e) => e.healthy && e.inDns).length;
    const mode = healthyInDns >= 2 ? "active-active" : healthyInDns === 1 ? "degraded" : "single";

    const history = this.getHistory(groupId, 1);

    return {
      group,
      activeIps,
      endpointHealth,
      mode,
      lastFailover: history[0],
    };
  }

  // ==================== FAILOVER ACTIONS ====================

  async removeEndpoint(groupId: string, ip: string, reason: string, triggeredBy: string) {
    const group = this.getGroup(groupId);
    if (!group) throw new Error(`Failover group ${groupId} not found`);

    const endpoint = group.endpoints.find((e) => e.ip === ip);
    if (!endpoint) throw new Error(`Endpoint ${ip} not found in group ${groupId}`);

    const result = await this.privateDns.removeIpFromRecord(
      group.subscriptionId, group.dnsResourceGroup, group.dnsZone, group.recordName, ip
    );

    if (result.action === "removed") {
      this.addHistory({
        failoverGroupId: groupId,
        action: "ip_removed",
        ip,
        appGateway: endpoint.appGateway,
        region: endpoint.region,
        reason,
        triggeredBy,
      });
    }

    return result;
  }

  async addEndpoint(groupId: string, ip: string, reason: string, triggeredBy: string) {
    const group = this.getGroup(groupId);
    if (!group) throw new Error(`Failover group ${groupId} not found`);

    const endpoint = group.endpoints.find((e) => e.ip === ip);
    if (!endpoint) throw new Error(`Endpoint ${ip} not found in group ${groupId}`);

    const result = await this.privateDns.addIpToRecord(
      group.subscriptionId, group.dnsResourceGroup, group.dnsZone, group.recordName, ip, group.ttlSeconds
    );

    if (result.action === "added") {
      this.addHistory({
        failoverGroupId: groupId,
        action: "ip_added",
        ip,
        appGateway: endpoint.appGateway,
        region: endpoint.region,
        reason,
        triggeredBy,
      });
    }

    return result;
  }

  async triggerManualFailover(groupId: string, targetIp: string, triggeredBy: string) {
    const group = this.getGroup(groupId);
    if (!group) throw new Error(`Failover group ${groupId} not found`);

    const dnsRecord = await this.privateDns.getARecord(
      group.subscriptionId, group.dnsResourceGroup, group.dnsZone, group.recordName
    );
    const currentIps = (dnsRecord?.ips || []).filter((ip): ip is string => ip !== undefined);

    // Remove all IPs except target
    const results = [];
    for (const ip of currentIps) {
      if (ip !== targetIp) {
        const r = await this.privateDns.removeIpFromRecord(
          group.subscriptionId, group.dnsResourceGroup, group.dnsZone, group.recordName, ip
        );
        results.push(r);
      }
    }

    // Make sure target is in DNS
    await this.privateDns.addIpToRecord(
      group.subscriptionId, group.dnsResourceGroup, group.dnsZone, group.recordName, targetIp, group.ttlSeconds
    );

    const endpoint = group.endpoints.find((e) => e.ip === targetIp);
    this.addHistory({
      failoverGroupId: groupId,
      action: "manual_failover",
      ip: targetIp,
      appGateway: endpoint?.appGateway || "unknown",
      region: endpoint?.region || "unknown",
      reason: `Manual failover to ${targetIp} (${endpoint?.label})`,
      triggeredBy,
    });

    return { action: "failover_complete", activeIp: targetIp, label: endpoint?.label };
  }

  // ==================== AUTO-PROBE LOOP ====================

  startProbeLoop() {
    if (this.probeTimer) return;
    logger.info("Starting failover probe loop");

    this.probeTimer = setInterval(async () => {
      try {
        await this.runProbeCheck();
      } catch (error) {
        logger.error("Probe loop error", { error });
      }
    }, 30000); // every 30 seconds
  }

  stopProbeLoop() {
    if (this.probeTimer) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
      logger.info("Stopped failover probe loop");
    }
  }

  async runProbeCheck() {
    const groups = this.listGroups().filter((g) => g.autoFailover);

    for (const group of groups) {
      if (group.failoverMode === "active-standby") {
        await this.probeActiveStandby(group);
      } else {
        await this.probeActiveActive(group);
      }
    }
  }

  /**
   * Active/Active: Both IPs in DNS. Remove dead IP, add back when recovered.
   */
  private async probeActiveActive(group: FailoverGroup) {
    const dnsRecord = await this.privateDns.getARecord(
      group.subscriptionId, group.dnsResourceGroup, group.dnsZone, group.recordName
    );
    const activeIps = (dnsRecord?.ips || []).filter((ip): ip is string => ip !== undefined);

    for (const endpoint of group.endpoints) {
      const health = await this.checkEndpointHealth(group.subscriptionId, endpoint.resourceGroup, endpoint.appGateway);
      const key = `${group.id}:${endpoint.ip}`;

      if (!health.healthy && activeIps.includes(endpoint.ip)) {
        const count = (this.failureCounts.get(key) || 0) + 1;
        this.failureCounts.set(key, count);

        if (count >= group.failureThreshold) {
          logger.warn("Active/Active: removing unhealthy endpoint", {
            group: group.name, gateway: endpoint.appGateway, ip: endpoint.ip, failures: count,
          });
          await this.removeEndpoint(group.id, endpoint.ip,
            `Auto-failover: ${endpoint.appGateway} unhealthy (${health.operationalState}) after ${count} consecutive checks`,
            "auto-probe"
          );
          this.failureCounts.delete(key);
        }
      } else if (health.healthy && !activeIps.includes(endpoint.ip)) {
        logger.info("Active/Active: adding recovered endpoint", {
          group: group.name, gateway: endpoint.appGateway, ip: endpoint.ip,
        });
        await this.addEndpoint(group.id, endpoint.ip,
          `Auto-recovery: ${endpoint.appGateway} is healthy again (${health.operationalState})`,
          "auto-probe"
        );
        this.failureCounts.delete(key);
      } else if (health.healthy) {
        this.failureCounts.delete(key);
      }
    }
  }

  /**
   * Active/Standby: Only primary IP (priority=1) in DNS.
   * On primary failure → insert standby IP (priority=2).
   * On primary recovery → switch back to primary, remove standby.
   */
  private async probeActiveStandby(group: FailoverGroup) {
    const sorted = [...group.endpoints].sort((a, b) => a.priority - b.priority);
    const primary = sorted[0];
    const standby = sorted[1];
    if (!primary || !standby) return;

    const dnsRecord = await this.privateDns.getARecord(
      group.subscriptionId, group.dnsResourceGroup, group.dnsZone, group.recordName
    );
    const activeIps = (dnsRecord?.ips || []).filter((ip): ip is string => ip !== undefined);

    const primaryHealth = await this.checkEndpointHealth(group.subscriptionId, primary.resourceGroup, primary.appGateway);
    const standbyHealth = await this.checkEndpointHealth(group.subscriptionId, standby.resourceGroup, standby.appGateway);

    const primaryKey = `${group.id}:${primary.ip}`;

    if (!primaryHealth.healthy) {
      const count = (this.failureCounts.get(primaryKey) || 0) + 1;
      this.failureCounts.set(primaryKey, count);

      if (count >= group.failureThreshold && !activeIps.includes(standby.ip) && standbyHealth.healthy) {
        // Primary down → insert standby
        logger.warn("Active/Standby: primary down, inserting standby", {
          group: group.name, primary: primary.appGateway, standby: standby.appGateway,
        });

        // Add standby IP FIRST (so primary is no longer the last IP)
        await this.addEndpoint(group.id, standby.ip,
          `Auto-failover: inserting standby ${standby.appGateway} (primary ${primary.appGateway} is down)`,
          "auto-probe"
        );

        // Now remove primary IP (safe — standby is already in DNS)
        if (activeIps.includes(primary.ip)) {
          await this.removeEndpoint(group.id, primary.ip,
            `Auto-failover: primary ${primary.appGateway} unhealthy (${primaryHealth.operationalState})`,
            "auto-probe"
          );
        }

        this.failureCounts.delete(primaryKey);
      }
    } else if (primaryHealth.healthy) {
      this.failureCounts.delete(primaryKey);

      // Primary is healthy — ensure it's in DNS
      if (!activeIps.includes(primary.ip)) {
        await this.addEndpoint(group.id, primary.ip,
          `Auto-recovery: primary ${primary.appGateway} is healthy again`,
          "auto-probe"
        );
      }

      // If standby is in DNS and primary is back, remove standby
      if (activeIps.includes(standby.ip)) {
        logger.info("Active/Standby: primary recovered, removing standby", {
          group: group.name, primary: primary.appGateway, standby: standby.appGateway,
        });
        await this.removeEndpoint(group.id, standby.ip,
          `Auto-recovery: removing standby ${standby.appGateway} (primary ${primary.appGateway} recovered)`,
          "auto-probe"
        );
      }
    }
  }
}
