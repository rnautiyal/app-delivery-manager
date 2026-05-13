import { MonitorClient } from "@azure/arm-monitor";
import { getAzureCredential } from "../config/azure";
import { logger } from "../config/logger";

export class DiagnosticSettingsService {
  private getMonitorClient(subscriptionId: string): MonitorClient {
    return new MonitorClient(getAzureCredential(), subscriptionId);
  }

  async listDiagnosticSettings(subscriptionId: string, resourceId: string) {
    const client = this.getMonitorClient(subscriptionId);
    try {
      const result = await client.diagnosticSettings.list(resourceId);
      return (result.value || []).map(ds => ({
        id: ds.id,
        name: ds.name,
        workspaceId: ds.workspaceId,
        logs: (ds.logs || []).map(l => ({
          category: l.category,
          enabled: l.enabled,
        })),
        metrics: (ds.metrics || []).map(m => ({
          category: m.category,
          enabled: m.enabled,
        })),
      }));
    } catch (error) {
      logger.error("Failed to list diagnostic settings", { resourceId, error });
      throw error;
    }
  }

  async enableDiagnostics(
    subscriptionId: string,
    resourceId: string,
    workspaceId: string,
    settingsName: string = "appgw-diagnostics"
  ) {
    const client = this.getMonitorClient(subscriptionId);
    try {
      logger.info("Enabling diagnostic settings", { resourceId, workspaceId, settingsName });
      return await client.diagnosticSettings.createOrUpdate(resourceId, settingsName, {
        workspaceId,
        logs: [
          { category: "ApplicationGatewayAccessLog", enabled: true, retentionPolicy: { enabled: false, days: 0 } },
          { category: "ApplicationGatewayPerformanceLog", enabled: true, retentionPolicy: { enabled: false, days: 0 } },
          { category: "ApplicationGatewayFirewallLog", enabled: true, retentionPolicy: { enabled: false, days: 0 } },
        ],
        metrics: [
          { category: "AllMetrics", enabled: true, retentionPolicy: { enabled: false, days: 0 } },
        ],
      });
    } catch (error) {
      logger.error("Failed to enable diagnostic settings", { resourceId, error });
      throw error;
    }
  }

  async disableDiagnostics(subscriptionId: string, resourceId: string, settingsName: string) {
    const client = this.getMonitorClient(subscriptionId);
    try {
      await client.diagnosticSettings.delete(resourceId, settingsName);
    } catch (error) {
      logger.error("Failed to delete diagnostic settings", { resourceId, error });
      throw error;
    }
  }
}
