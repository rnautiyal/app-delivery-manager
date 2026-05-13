import { StorageService } from "./storageService";
import { logger } from "../config/logger";
import crypto from "crypto";

export interface ManagedGroup {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  subscriptionId: string;
  masterGatewayId: string;
  resources: {
    gateways: string[];       // resource IDs
    wafPolicies: string[];    // resource IDs
    trafficManagers: string[];// resource IDs
    frontDoors: string[];     // resource IDs
  };
  syncConfig: {
    syncBackendPools: boolean;
    syncHttpSettings: boolean;
    syncListeners: boolean;
    syncRules: boolean;
    syncProbes: boolean;
    syncWafConfig: boolean;
    syncSslCerts: boolean;
  };
  lastSyncAt: string;
  lastSyncStatus: string;
  tags: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export class ManagedGroupService {
  private storage = new StorageService<ManagedGroup>("managed-groups.json");

  listGroups(subscriptionId?: string): ManagedGroup[] {
    const all = this.storage.readAll();
    if (subscriptionId) {
      return all.filter(g => g.subscriptionId === subscriptionId);
    }
    return all;
  }

  getGroup(id: string): ManagedGroup | undefined {
    return this.storage.findById(id);
  }

  createGroup(params: {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    subscriptionId: string;
    resources?: ManagedGroup["resources"];
  }): ManagedGroup {
    const group: ManagedGroup = {
      id: crypto.randomUUID(),
      name: params.name,
      description: params.description || "",
      color: params.color || "#0078d4",
      icon: params.icon || "📦",
      subscriptionId: params.subscriptionId,
      masterGatewayId: "",
      resources: params.resources || {
        gateways: [],
        wafPolicies: [],
        trafficManagers: [],
        frontDoors: [],
      },
      syncConfig: {
        syncBackendPools: true,
        syncHttpSettings: true,
        syncListeners: false,
        syncRules: false,
        syncProbes: true,
        syncWafConfig: true,
        syncSslCerts: false,
      },
      lastSyncAt: "",
      lastSyncStatus: "",
      tags: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.storage.add(group);
    logger.info("Created managed group", { name: group.name, id: group.id });
    return group;
  }

  updateGroup(id: string, params: Partial<Omit<ManagedGroup, "id" | "createdAt">>): ManagedGroup {
    const existing = this.storage.findById(id);
    if (!existing) throw new Error(`Group not found: ${id}`);

    const updated: ManagedGroup = {
      ...existing,
      ...params,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.storage.update(id, updated);
    logger.info("Updated managed group", { name: updated.name, id });
    return updated;
  }

  deleteGroup(id: string): void {
    this.storage.remove(id);
    logger.info("Deleted managed group", { id });
  }

  addResource(groupId: string, resourceType: keyof ManagedGroup["resources"], resourceId: string): ManagedGroup {
    const group = this.storage.findById(groupId);
    if (!group) throw new Error(`Group not found: ${groupId}`);

    if (!group.resources[resourceType].includes(resourceId)) {
      group.resources[resourceType].push(resourceId);
      group.updatedAt = new Date().toISOString();
      this.storage.update(groupId, group);
    }
    return group;
  }

  removeResource(groupId: string, resourceType: keyof ManagedGroup["resources"], resourceId: string): ManagedGroup {
    const group = this.storage.findById(groupId);
    if (!group) throw new Error(`Group not found: ${groupId}`);

    group.resources[resourceType] = group.resources[resourceType].filter(id => id !== resourceId);
    // Clear master if removed
    if (resourceType === "gateways" && group.masterGatewayId === resourceId) {
      group.masterGatewayId = "";
    }
    group.updatedAt = new Date().toISOString();
    this.storage.update(groupId, group);
    return group;
  }

  setMaster(groupId: string, gatewayId: string): ManagedGroup {
    const group = this.storage.findById(groupId);
    if (!group) throw new Error(`Group not found: ${groupId}`);
    if (!group.resources.gateways.includes(gatewayId)) {
      throw new Error("Gateway must be in the group before setting as master");
    }
    group.masterGatewayId = gatewayId;
    group.updatedAt = new Date().toISOString();
    this.storage.update(groupId, group);
    logger.info("Set master gateway", { groupId, gatewayId });
    return group;
  }

  updateSyncConfig(groupId: string, config: Partial<ManagedGroup["syncConfig"]>): ManagedGroup {
    const group = this.storage.findById(groupId);
    if (!group) throw new Error(`Group not found: ${groupId}`);
    group.syncConfig = { ...group.syncConfig, ...config };
    group.updatedAt = new Date().toISOString();
    this.storage.update(groupId, group);
    return group;
  }

  updateSyncStatus(groupId: string, status: string): void {
    const group = this.storage.findById(groupId);
    if (!group) return;
    group.lastSyncAt = new Date().toISOString();
    group.lastSyncStatus = status;
    group.updatedAt = new Date().toISOString();
    this.storage.update(groupId, group);
  }
}
