import crypto from "crypto";
import { StorageService } from "./storageService";
import { logger } from "../config/logger";

export interface AutoscaleSchedule {
  id: string;
  name: string;
  subscriptionId: string;
  gatewayNames: string[];
  startTime: string; // "HH:MM" format
  startMinInstances: number;
  startMaxInstances: number;
  endTime: string;
  endMinInstances: number;
  endMaxInstances: number;
  daysOfWeek: string[]; // ["Mon", "Tue", ...]
  enabled: boolean;
  createdAt: string;
  createdBy: string;
}

export class AutoscaleService {
  private storage = new StorageService<AutoscaleSchedule>("autoscale-schedules.json");

  createSchedule(params: Omit<AutoscaleSchedule, "id" | "createdAt">): AutoscaleSchedule {
    const schedule: AutoscaleSchedule = {
      ...params,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.storage.add(schedule);
    logger.info("Autoscale schedule created", { id: schedule.id, name: schedule.name, gateways: schedule.gatewayNames });
    return schedule;
  }

  listSchedules(subscriptionId?: string): AutoscaleSchedule[] {
    let schedules = this.storage.readAll();
    if (subscriptionId) {
      schedules = schedules.filter((s) => s.subscriptionId === subscriptionId);
    }
    return schedules.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getSchedule(id: string): AutoscaleSchedule {
    const s = this.storage.findById(id);
    if (!s) throw new Error(`Schedule not found: ${id}`);
    return s;
  }

  toggleSchedule(id: string, enabled: boolean): AutoscaleSchedule {
    const s = this.getSchedule(id);
    s.enabled = enabled;
    this.storage.update(id, s);
    return s;
  }

  deleteSchedule(id: string): void {
    this.storage.remove(id);
    logger.info("Autoscale schedule deleted", { id });
  }
}
