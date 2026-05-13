import crypto from "crypto";
import { StorageService } from "./storageService";
import { GatewayService } from "./gatewayService";
import { logger } from "../config/logger";

export interface MaintenanceWindow {
  id: string;
  gatewayName: string;
  resourceGroup: string;
  subscriptionId: string;
  upgradeType: string;
  upgradeVersion: string;
  upgradeDescription: string;
  detectedAt: string;
  scheduledAt: string;
  deadlineAt: string;
  status: "scheduled" | "completed" | "overdue" | "in_progress";
  scheduledBy: string;
  notes?: string;
  scheduledTime?: string;
  estimatedDurationMinutes?: number;
  blackoutStart?: string;
  blackoutEnd?: string;
}

// Mock upgrade catalog — in real life, query Azure
const AVAILABLE_UPGRADES = [
  {
    type: "Security Patch",
    version: "v2.1.4",
    description: "Critical security patch for OWASP CRS 3.2 — addresses CVE-2026-1234",
    releaseDate: "2026-04-01",
  },
  {
    type: "Feature Update",
    version: "v2.2.0",
    description: "New WAF managed rule sets and improved performance metrics",
    releaseDate: "2026-04-05",
  },
  {
    type: "Platform Upgrade",
    version: "Standard_v2.5",
    description: "Underlying platform upgrade for improved scalability",
    releaseDate: "2026-03-20",
  },
];

export class MaintenanceService {
  private storage = new StorageService<MaintenanceWindow>("maintenance.json");
  private gatewayService = new GatewayService();

  // List available upgrades for all gateways in subscription
  async listAvailableUpgrades(subscriptionId: string): Promise<any[]> {
    try {
      const gateways = await this.gatewayService.listGateways(subscriptionId);
      const existing = this.storage.readAll();
      const existingMap = new Map(existing.map((w) => [`${w.gatewayName}-${w.upgradeVersion}`, w]));

      const upgrades: any[] = [];
      for (const gw of gateways) {
        for (const upgrade of AVAILABLE_UPGRADES) {
          const key = `${gw.name}-${upgrade.version}`;
          const existingWindow = existingMap.get(key);

          if (existingWindow) {
            upgrades.push({
              ...existingWindow,
              ...upgrade,
              gateway: gw,
              hasWindow: true,
            });
          } else {
            // Auto-detect: 30 days from "release date" or now
            const detectedAt = new Date();
            const deadlineAt = new Date(detectedAt.getTime() + 30 * 24 * 60 * 60 * 1000);

            upgrades.push({
              id: null,
              gatewayName: gw.name,
              resourceGroup: gw.resourceGroup,
              subscriptionId: gw.subscriptionId,
              upgradeType: upgrade.type,
              upgradeVersion: upgrade.version,
              upgradeDescription: upgrade.description,
              detectedAt: detectedAt.toISOString(),
              scheduledAt: deadlineAt.toISOString(),
              deadlineAt: deadlineAt.toISOString(),
              status: "scheduled",
              scheduledBy: "auto",
              gateway: gw,
              hasWindow: false,
              releaseDate: upgrade.releaseDate,
            });
          }
        }
      }
      return upgrades;
    } catch (error) {
      logger.error("Failed to list available upgrades", { error });
      return [];
    }
  }

  scheduleMaintenance(
    subscriptionId: string,
    resourceGroup: string,
    gatewayName: string,
    upgradeType: string,
    upgradeVersion: string,
    upgradeDescription: string,
    scheduledAt: string,
    scheduledBy: string,
    notes?: string,
    scheduledTime?: string,
    estimatedDurationMinutes?: number,
    blackoutStart?: string,
    blackoutEnd?: string
  ): MaintenanceWindow {
    const detectedAt = new Date().toISOString();
    const deadlineAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Check if scheduled date is within 30-day window
    const scheduled = new Date(scheduledAt);
    const deadline = new Date(deadlineAt);
    const finalScheduled = scheduled > deadline ? deadline : scheduled;

    const window: MaintenanceWindow = {
      id: crypto.randomUUID(),
      gatewayName,
      resourceGroup,
      subscriptionId,
      upgradeType,
      upgradeVersion,
      upgradeDescription,
      detectedAt,
      scheduledAt: finalScheduled.toISOString(),
      deadlineAt,
      status: "scheduled",
      scheduledBy,
      notes,
      scheduledTime: scheduledTime || "02:00",
      estimatedDurationMinutes: estimatedDurationMinutes || 30,
      blackoutStart: blackoutStart || "00:00",
      blackoutEnd: blackoutEnd || "06:00",
    };

    // Remove any existing window for the same gateway+upgrade
    const existing = this.storage.readAll();
    const filtered = existing.filter(
      (w) => !(w.gatewayName === gatewayName && w.upgradeVersion === upgradeVersion)
    );
    filtered.push(window);
    this.storage.writeAll(filtered);

    logger.info("Maintenance window scheduled", { gatewayName, version: upgradeVersion, scheduledAt });
    return window;
  }

  listScheduled(subscriptionId?: string): MaintenanceWindow[] {
    let windows = this.storage.readAll();
    if (subscriptionId) {
      windows = windows.filter((w) => w.subscriptionId === subscriptionId);
    }
    return windows.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }

  cancelWindow(id: string): void {
    this.storage.remove(id);
    logger.info("Maintenance window cancelled", { id });
  }

  markComplete(id: string): MaintenanceWindow {
    const w = this.storage.findById(id);
    if (!w) throw new Error("Window not found");
    w.status = "completed";
    this.storage.update(id, w);
    return w;
  }
}
