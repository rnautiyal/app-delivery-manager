import crypto from "crypto";
import { StorageService } from "./storageService";
import { ActivityLogEntry } from "../models/types";

export class ActivityLogService {
  private storage = new StorageService<ActivityLogEntry>("activity-log.json");

  log(
    user: string,
    action: string,
    resourceType: string,
    resourceName: string,
    subscriptionId?: string,
    details?: string
  ): void {
    const entry: ActivityLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      user,
      action,
      resourceType,
      resourceName,
      subscriptionId,
      details,
    };
    // Keep max 1000 entries
    const all = this.storage.readAll();
    all.push(entry);
    if (all.length > 1000) {
      this.storage.writeAll(all.slice(all.length - 1000));
    } else {
      this.storage.writeAll(all);
    }
  }

  getLog(subscriptionId?: string, limit?: number, actionType?: string): ActivityLogEntry[] {
    let entries = this.storage.readAll();
    if (subscriptionId) {
      entries = entries.filter((e) => e.subscriptionId === subscriptionId);
    }
    if (actionType) {
      entries = entries.filter((e) => e.action.startsWith(actionType));
    }
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (limit) {
      entries = entries.slice(0, limit);
    }
    return entries;
  }
}
