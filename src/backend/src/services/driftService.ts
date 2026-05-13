import crypto from "crypto";
import { StorageService } from "./storageService";
import { GatewayService } from "./gatewayService";
import { BaselineSnapshot, DriftChange, DriftReport } from "../models/types";
import { logger } from "../config/logger";

export class DriftService {
  private storage = new StorageService<BaselineSnapshot>("baselines.json");
  private gatewayService = new GatewayService();

  async saveBaseline(
    subscriptionId: string,
    resourceGroup: string,
    gatewayName: string,
    createdBy: string
  ): Promise<BaselineSnapshot> {
    const gw = await this.gatewayService.getGateway(subscriptionId, resourceGroup, gatewayName);

    const baseline: BaselineSnapshot = {
      id: crypto.randomUUID(),
      gatewayId: gw.id || "",
      gatewayName,
      resourceGroup,
      subscriptionId,
      createdAt: new Date().toISOString(),
      createdBy,
      config: {
        backendAddressPools: gw.backendAddressPools || [],
        backendHttpSettingsCollection: gw.backendHttpSettingsCollection || [],
        httpListeners: gw.httpListeners || [],
        requestRoutingRules: gw.requestRoutingRules || [],
        probes: gw.probes || [],
        frontendPorts: gw.frontendPorts || [],
        sslCertificates: gw.sslCertificates || [],
        sku: gw.sku,
        webApplicationFirewallConfiguration: gw.webApplicationFirewallConfiguration,
        tags: gw.tags || {},
      },
    };

    this.storage.add(baseline);
    logger.info("Baseline snapshot saved", { baselineId: baseline.id, gatewayName });
    return baseline;
  }

  listBaselines(subscriptionId?: string, gatewayName?: string): BaselineSnapshot[] {
    let baselines = this.storage.readAll();
    if (subscriptionId) {
      baselines = baselines.filter((b) => b.subscriptionId === subscriptionId);
    }
    if (gatewayName) {
      baselines = baselines.filter((b) => b.gatewayName === gatewayName);
    }
    return baselines.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getBaseline(id: string): BaselineSnapshot {
    const baseline = this.storage.findById(id);
    if (!baseline) throw new Error(`Baseline not found: ${id}`);
    return baseline;
  }

  deleteBaseline(id: string): void {
    this.storage.remove(id);
    logger.info("Baseline deleted", { baselineId: id });
  }

  async checkDrift(baselineId: string): Promise<DriftReport> {
    const baseline = this.getBaseline(baselineId);
    const currentGw = await this.gatewayService.getGateway(
      baseline.subscriptionId,
      baseline.resourceGroup,
      baseline.gatewayName
    );

    const changes: DriftChange[] = [];

    // Compare each component category
    const comparisons: { component: string; baselineArr: any[]; currentArr: any[]; fields: string[] }[] = [
      {
        component: "Backend Pool",
        baselineArr: baseline.config.backendAddressPools || [],
        currentArr: currentGw.backendAddressPools || [],
        fields: ["backendAddresses"],
      },
      {
        component: "HTTP Setting",
        baselineArr: baseline.config.backendHttpSettingsCollection || [],
        currentArr: currentGw.backendHttpSettingsCollection || [],
        fields: ["port", "protocol", "cookieBasedAffinity", "requestTimeout"],
      },
      {
        component: "Listener",
        baselineArr: baseline.config.httpListeners || [],
        currentArr: currentGw.httpListeners || [],
        fields: ["protocol", "hostName", "requireServerNameIndication"],
      },
      {
        component: "Routing Rule",
        baselineArr: baseline.config.requestRoutingRules || [],
        currentArr: currentGw.requestRoutingRules || [],
        fields: ["ruleType", "priority"],
      },
      {
        component: "Health Probe",
        baselineArr: baseline.config.probes || [],
        currentArr: currentGw.probes || [],
        fields: ["protocol", "path", "interval", "timeout", "unhealthyThreshold"],
      },
      {
        component: "Frontend Port",
        baselineArr: baseline.config.frontendPorts || [],
        currentArr: currentGw.frontendPorts || [],
        fields: ["port"],
      },
    ];

    for (const { component, baselineArr, currentArr, fields } of comparisons) {
      changes.push(...this.compareArrays(component, baselineArr, currentArr, fields));
    }

    // Compare tags
    const baselineTags = baseline.config.tags || {};
    const currentTags = currentGw.tags || {};
    for (const key of new Set([...Object.keys(baselineTags), ...Object.keys(currentTags)])) {
      if (!(key in baselineTags)) {
        changes.push({ component: "Tag", name: key, changeType: "added", currentValue: currentTags[key] });
      } else if (!(key in currentTags)) {
        changes.push({ component: "Tag", name: key, changeType: "removed", baselineValue: baselineTags[key] });
      } else if (baselineTags[key] !== currentTags[key]) {
        changes.push({
          component: "Tag",
          name: key,
          changeType: "modified",
          baselineValue: baselineTags[key],
          currentValue: currentTags[key],
        });
      }
    }

    const additions = changes.filter((c) => c.changeType === "added").length;
    const removals = changes.filter((c) => c.changeType === "removed").length;
    const modifications = changes.filter((c) => c.changeType === "modified").length;

    const report: DriftReport = {
      gatewayName: baseline.gatewayName,
      resourceGroup: baseline.resourceGroup,
      subscriptionId: baseline.subscriptionId,
      baselineId,
      baselineDate: baseline.createdAt,
      checkedAt: new Date().toISOString(),
      hasDrift: changes.length > 0,
      totalChanges: changes.length,
      additions,
      removals,
      modifications,
      changes,
    };

    logger.info("Drift check completed", {
      baselineId,
      gatewayName: baseline.gatewayName,
      hasDrift: report.hasDrift,
      totalChanges: report.totalChanges,
    });

    return report;
  }

  private compareArrays(
    component: string,
    baselineArr: any[],
    currentArr: any[],
    fields: string[]
  ): DriftChange[] {
    const changes: DriftChange[] = [];
    const baselineMap = new Map(baselineArr.map((item) => [item.name, item]));
    const currentMap = new Map(currentArr.map((item) => [item.name, item]));

    // Find added items (in current but not baseline)
    for (const [name] of currentMap) {
      if (!baselineMap.has(name)) {
        changes.push({
          component,
          name,
          changeType: "added",
          currentValue: this.summarizeItem(currentMap.get(name), fields),
        });
      }
    }

    // Find removed items (in baseline but not current)
    for (const [name] of baselineMap) {
      if (!currentMap.has(name)) {
        changes.push({
          component,
          name,
          changeType: "removed",
          baselineValue: this.summarizeItem(baselineMap.get(name), fields),
        });
      }
    }

    // Find modified items
    for (const [name, baselineItem] of baselineMap) {
      const currentItem = currentMap.get(name);
      if (!currentItem) continue;

      const diffs: string[] = [];
      for (const field of fields) {
        const bVal = JSON.stringify(baselineItem[field]);
        const cVal = JSON.stringify(currentItem[field]);
        if (bVal !== cVal) {
          diffs.push(field);
        }
      }

      if (diffs.length > 0) {
        changes.push({
          component,
          name,
          changeType: "modified",
          baselineValue: this.summarizeItem(baselineItem, diffs),
          currentValue: this.summarizeItem(currentItem, diffs),
          details: `Changed fields: ${diffs.join(", ")}`,
        });
      }
    }

    return changes;
  }

  private summarizeItem(item: any, fields: string[]): Record<string, any> {
    const summary: Record<string, any> = {};
    for (const field of fields) {
      if (item[field] !== undefined) {
        summary[field] = item[field];
      }
    }
    return summary;
  }
}
