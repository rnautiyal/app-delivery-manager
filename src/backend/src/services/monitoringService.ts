import { MetricsQueryClient, LogsQueryClient } from "@azure/monitor-query";
import { getAzureCredential } from "../config/azure";
import { logger } from "../config/logger";
import { GatewayMetrics } from "../models/types";

export class MonitoringService {
  private metricsClient: MetricsQueryClient;
  private logsClient: LogsQueryClient;

  constructor() {
    const credential = getAzureCredential();
    this.metricsClient = new MetricsQueryClient(credential);
    this.logsClient = new LogsQueryClient(credential);
  }

  async getGatewayMetrics(
    resourceId: string,
    timeRange: string = "PT1H"
  ): Promise<GatewayMetrics> {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - this.parseDuration(timeRange));

      const response = await this.metricsClient.queryResource(resourceId, [
        "Throughput",
        "TotalRequests",
        "FailedRequests",
        "HealthyHostCount",
        "UnhealthyHostCount",
        "CurrentConnections",
        "ResponseStatus",
      ], {
        timespan: { startTime, endTime },
        granularity: "PT5M",
      });

      const metrics: GatewayMetrics = {
        throughput: [],
        totalRequests: [],
        failedRequests: [],
        healthyHostCount: [],
        unhealthyHostCount: [],
        responseStatus: {},
        currentConnections: [],
        timestamps: [],
      };

      for (const metric of response.metrics) {
        const timeSeries = metric.timeseries?.[0];
        if (!timeSeries?.data) continue;

        for (const point of timeSeries.data) {
          const metricName = metric.name.toLowerCase();
          const value = point.average ?? point.total ?? 0;

          if (metricName === "throughput") metrics.throughput.push(value);
          else if (metricName === "totalrequests") metrics.totalRequests.push(value);
          else if (metricName === "failedrequests") metrics.failedRequests.push(value);
          else if (metricName === "healthyhostcount") metrics.healthyHostCount.push(value);
          else if (metricName === "unhealthyhostcount") metrics.unhealthyHostCount.push(value);
          else if (metricName === "currentconnections") metrics.currentConnections.push(value);

          if (metricName === "throughput" && point.timeStamp) {
            metrics.timestamps.push(point.timeStamp.toISOString());
          }
        }
      }

      return metrics;
    } catch (error) {
      logger.error("Failed to get gateway metrics", { resourceId, error });
      throw error;
    }
  }

  async queryAccessLogs(workspaceId: string, gatewayName: string, hours: number = 1) {
    try {
      const query = `
        AzureDiagnostics
        | where ResourceType == "APPLICATIONGATEWAYS"
        | where Resource == "${gatewayName}"
        | where TimeGenerated > ago(${hours}h)
        | project TimeGenerated, httpStatus_d, serverRouted_s, clientIP_s, requestUri_s, timeTaken_d, host_s
        | order by TimeGenerated desc
        | take 100
      `;

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

      const result = await this.logsClient.queryWorkspace(workspaceId, query, {
        startTime,
        endTime,
      });

      return result;
    } catch (error) {
      logger.error("Failed to query access logs", { workspaceId, gatewayName, error });
      throw error;
    }
  }

  async queryWafLogs(workspaceId: string, gatewayName: string, hours: number = 1) {
    try {
      const query = `
        AzureDiagnostics
        | where ResourceType == "APPLICATIONGATEWAYS"
        | where Resource == "${gatewayName}"
        | where Category == "ApplicationGatewayFirewallLog"
        | where TimeGenerated > ago(${hours}h)
        | project TimeGenerated, action_s, ruleId_s, message_s, clientIp_s, requestUri_s, ruleSetType_s
        | order by TimeGenerated desc
        | take 100
      `;

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

      return await this.logsClient.queryWorkspace(workspaceId, query, {
        startTime,
        endTime,
      });
    } catch (error) {
      logger.error("Failed to query WAF logs", { workspaceId, gatewayName, error });
      throw error;
    }
  }

  async get502ErrorAnalysis(workspaceId: string, gatewayName: string) {
    try {
      const query = `
        AzureDiagnostics
        | where ResourceType == "APPLICATIONGATEWAYS"
        | where Resource == "${gatewayName}"
        | where httpStatus_d == 502
        | where TimeGenerated > ago(24h)
        | summarize Count=count() by serverRouted_s, bin(TimeGenerated, 5m)
        | order by TimeGenerated desc
      `;

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

      return await this.logsClient.queryWorkspace(workspaceId, query, {
        startTime,
        endTime,
      });
    } catch (error) {
      logger.error("Failed to analyze 502 errors", { workspaceId, gatewayName, error });
      throw error;
    }
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/PT(\d+)([HM])/);
    if (!match) return 3600000;
    const value = parseInt(match[1]);
    return match[2] === "H" ? value * 3600000 : value * 60000;
  }
}
