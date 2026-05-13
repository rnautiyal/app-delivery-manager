import { TrafficManagerService } from "./trafficManagerService";
import { logger } from "../config/logger";

interface MonitoredProfile {
  subscriptionId: string;
  resourceGroup: string;
  profileName: string;
}

interface FailoverEvent {
  timestamp: string;
  profileName: string;
  action: string;
  failedEndpoints: string[];
  enabledEndpoints: string[];
  details: string[];
}

const DEFAULT_INTERVAL_MS = 60_000; // 1 minute

export class TmHealthMonitor {
  private tmService = new TrafficManagerService();
  private monitoredProfiles: MonitoredProfile[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number = DEFAULT_INTERVAL_MS;
  private failoverHistory: FailoverEvent[] = [];
  private running = false;

  /** Add a profile to be monitored for automatic failover */
  addProfile(subscriptionId: string, resourceGroup: string, profileName: string): void {
    const exists = this.monitoredProfiles.some(
      p => p.subscriptionId === subscriptionId && p.resourceGroup === resourceGroup && p.profileName === profileName
    );
    if (!exists) {
      this.monitoredProfiles.push({ subscriptionId, resourceGroup, profileName });
      logger.info("TM Health Monitor: added profile", { profileName, resourceGroup });
    }
  }

  /** Remove a profile from monitoring */
  removeProfile(subscriptionId: string, resourceGroup: string, profileName: string): void {
    this.monitoredProfiles = this.monitoredProfiles.filter(
      p => !(p.subscriptionId === subscriptionId && p.resourceGroup === resourceGroup && p.profileName === profileName)
    );
    logger.info("TM Health Monitor: removed profile", { profileName });
  }

  /** Get all monitored profiles */
  getMonitoredProfiles(): MonitoredProfile[] {
    return [...this.monitoredProfiles];
  }

  /** Get failover event history */
  getFailoverHistory(): FailoverEvent[] {
    return [...this.failoverHistory];
  }

  /** Whether the monitor loop is running */
  isRunning(): boolean {
    return this.running;
  }

  /** Start the periodic health check loop */
  start(intervalMs?: number): void {
    if (this.intervalId) return; // already running
    this.intervalMs = intervalMs || DEFAULT_INTERVAL_MS;
    this.running = true;
    logger.info("TM Health Monitor: started", { intervalMs: this.intervalMs, profiles: this.monitoredProfiles.length });

    this.intervalId = setInterval(() => {
      this.checkAll().catch(err =>
        logger.error("TM Health Monitor: check cycle failed", { error: (err as Error).message })
      );
    }, this.intervalMs);
  }

  /** Stop the periodic health check loop */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    logger.info("TM Health Monitor: stopped");
  }

  /** Run a single health check cycle across all monitored profiles */
  async checkAll(): Promise<FailoverEvent[]> {
    const events: FailoverEvent[] = [];

    for (const profile of this.monitoredProfiles) {
      try {
        const result = await this.tmService.checkAndFailover(
          profile.subscriptionId, profile.resourceGroup, profile.profileName
        );

        if (result.action !== "none") {
          const event: FailoverEvent = {
            timestamp: new Date().toISOString(),
            profileName: profile.profileName,
            action: result.action,
            failedEndpoints: result.failedEndpoints,
            enabledEndpoints: result.enabledEndpoints,
            details: result.details,
          };
          events.push(event);
          this.failoverHistory.push(event);
          // Keep history bounded
          if (this.failoverHistory.length > 100) {
            this.failoverHistory = this.failoverHistory.slice(-100);
          }
          logger.warn("TM Health Monitor: failover event", event);
        }
      } catch (err) {
        logger.error("TM Health Monitor: failed to check profile", {
          profileName: profile.profileName,
          error: (err as Error).message,
        });
      }
    }

    return events;
  }
}

// Singleton instance
export const tmHealthMonitor = new TmHealthMonitor();
