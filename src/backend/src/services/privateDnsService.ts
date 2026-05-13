import { PrivateDnsManagementClient } from "@azure/arm-privatedns";
import { getAzureCredential } from "../config/azure";
import { logger } from "../config/logger";

export class PrivateDnsService {
  private getClient(subscriptionId: string): PrivateDnsManagementClient {
    return new PrivateDnsManagementClient(getAzureCredential(), subscriptionId);
  }

  async listZones(subscriptionId: string) {
    const client = this.getClient(subscriptionId);
    const zones = [];
    for await (const zone of client.privateZones.list()) {
      zones.push({
        name: zone.name,
        resourceGroup: zone.id?.split("/resourceGroups/")[1]?.split("/")[0],
        numberOfRecordSets: zone.numberOfRecordSets,
        numberOfVirtualNetworkLinks: zone.numberOfVirtualNetworkLinks,
      });
    }
    return zones;
  }

  async listRecords(subscriptionId: string, resourceGroup: string, zoneName: string) {
    const client = this.getClient(subscriptionId);
    const records = [];
    for await (const record of client.recordSets.list(resourceGroup, zoneName)) {
      if (record.aRecords && record.aRecords.length > 0) {
        records.push({
          name: record.name,
          type: "A",
          ttl: record.ttl,
          ips: record.aRecords.map((r) => r.ipv4Address),
        });
      }
    }
    return records;
  }

  async getARecord(subscriptionId: string, resourceGroup: string, zoneName: string, recordName: string) {
    const client = this.getClient(subscriptionId);
    try {
      const record = await client.recordSets.get(resourceGroup, zoneName, "A", recordName);
      return {
        name: record.name,
        ttl: record.ttl,
        ips: (record.aRecords || []).map((r) => r.ipv4Address),
      };
    } catch (error: any) {
      if (error.statusCode === 404) return null;
      throw error;
    }
  }

  async addIpToRecord(subscriptionId: string, resourceGroup: string, zoneName: string, recordName: string, ip: string, ttl: number = 10) {
    const client = this.getClient(subscriptionId);
    const existing = await this.getARecord(subscriptionId, resourceGroup, zoneName, recordName);
    const currentIps = existing?.ips || [];

    if (currentIps.includes(ip)) {
      logger.info("IP already in DNS record", { zoneName, recordName, ip });
      return { action: "no_change", ips: currentIps };
    }

    const aRecords = [...currentIps, ip].map((ipAddr) => ({ ipv4Address: ipAddr }));
    await client.recordSets.createOrUpdate(resourceGroup, zoneName, "A", recordName, {
      ttl,
      aRecords,
    });

    logger.info("Added IP to DNS record", { zoneName, recordName, ip });
    return { action: "added", ip, ips: [...currentIps, ip] };
  }

  async removeIpFromRecord(subscriptionId: string, resourceGroup: string, zoneName: string, recordName: string, ip: string) {
    const client = this.getClient(subscriptionId);
    const existing = await this.getARecord(subscriptionId, resourceGroup, zoneName, recordName);
    if (!existing) throw new Error(`Record ${recordName}.${zoneName} not found`);

    const remainingIps = (existing.ips || []).filter((existingIp) => existingIp !== ip);

    if (remainingIps.length === 0) {
      logger.warn("Cannot remove last IP from DNS record — would leave record empty", { zoneName, recordName, ip });
      return { action: "blocked", reason: "Cannot remove last IP — at least one endpoint must remain active", ips: existing.ips };
    }

    if (remainingIps.length === existing.ips!.length) {
      logger.info("IP not found in DNS record", { zoneName, recordName, ip });
      return { action: "no_change", ips: existing.ips };
    }

    await client.recordSets.createOrUpdate(resourceGroup, zoneName, "A", recordName, {
      ttl: existing.ttl || 10,
      aRecords: remainingIps.map((ipAddr) => ({ ipv4Address: ipAddr })),
    });

    logger.info("Removed IP from DNS record", { zoneName, recordName, ip, remaining: remainingIps });
    return { action: "removed", ip, ips: remainingIps };
  }
}
