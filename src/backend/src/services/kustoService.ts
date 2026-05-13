import { LogsQueryClient } from "@azure/monitor-query";
import { getAzureCredential } from "../config/azure";
import { logger } from "../config/logger";

export class KustoService {
  private client: LogsQueryClient;

  constructor() {
    this.client = new LogsQueryClient(getAzureCredential());
  }

  async runKqlQuery(workspaceId: string, query: string, hoursBack: number = 24) {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - hoursBack * 60 * 60 * 1000);

      logger.info("Running KQL query", { workspaceId, query: query.substring(0, 200), hoursBack });

      const result: any = await this.client.queryWorkspace(workspaceId, query, {
        startTime,
        endTime,
      });

      // Handle different SDK response shapes
      const tables = result.tables || [];
      if (tables.length > 0) {
        return tables.map((table: any) => ({
          name: table.name,
          columns: (table.columnDescriptors || table.columns || []).map((c: any) => c.name || c),
          rows: (table.rows || []).slice(0, 100),
          totalRows: (table.rows || []).length,
        }));
      }

      return { message: "No results returned", status: result.status || "Unknown" };
    } catch (error) {
      logger.error("KQL query failed", { workspaceId, error });
      throw error;
    }
  }

  // Pre-built queries for common troubleshooting
  async getGatewayAccessLogs(workspaceId: string, gatewayName: string, hours: number = 1) {
    const query = `
AzureDiagnostics
| where ResourceType == "APPLICATIONGATEWAYS"
| where Resource =~ "${gatewayName}"
| where Category == "ApplicationGatewayAccessLog"
| where TimeGenerated > ago(${hours}h)
| project TimeGenerated, httpStatus_d, serverRouted_s, clientIP_s, requestUri_s, timeTaken_d, host_s, serverResponseLatency_s, httpMethod_s, userAgent_s
| order by TimeGenerated desc
| take 200`;
    return await this.runKqlQuery(workspaceId, query, hours);
  }

  async getGatewayFirewallLogs(workspaceId: string, gatewayName: string, hours: number = 1) {
    const query = `
AzureDiagnostics
| where ResourceType == "APPLICATIONGATEWAYS"
| where Resource =~ "${gatewayName}"
| where Category == "ApplicationGatewayFirewallLog"
| where TimeGenerated > ago(${hours}h)
| project TimeGenerated, action_s, ruleId_s, message_s, clientIp_s, requestUri_s, ruleSetType_s, ruleSetVersion_s, ruleGroup_s, details_message_s
| order by TimeGenerated desc
| take 200`;
    return await this.runKqlQuery(workspaceId, query, hours);
  }

  async get502ErrorBreakdown(workspaceId: string, gatewayName: string, hours: number = 24) {
    const query = `
AzureDiagnostics
| where ResourceType == "APPLICATIONGATEWAYS"
| where Resource =~ "${gatewayName}"
| where httpStatus_d == 502
| where TimeGenerated > ago(${hours}h)
| summarize Count=count() by bin(TimeGenerated, 5m), serverRouted_s, requestUri_s
| order by TimeGenerated desc`;
    return await this.runKqlQuery(workspaceId, query, hours);
  }

  async getErrorSummary(workspaceId: string, gatewayName: string, hours: number = 24) {
    const query = `
AzureDiagnostics
| where ResourceType == "APPLICATIONGATEWAYS"
| where Resource =~ "${gatewayName}"
| where TimeGenerated > ago(${hours}h)
| where Category == "ApplicationGatewayAccessLog"
| summarize Count=count() by httpStatus_d
| order by Count desc`;
    return await this.runKqlQuery(workspaceId, query, hours);
  }

  async getSlowRequests(workspaceId: string, gatewayName: string, thresholdMs: number = 5000, hours: number = 1) {
    const query = `
AzureDiagnostics
| where ResourceType == "APPLICATIONGATEWAYS"
| where Resource =~ "${gatewayName}"
| where TimeGenerated > ago(${hours}h)
| where timeTaken_d > ${thresholdMs}
| project TimeGenerated, httpStatus_d, serverRouted_s, clientIP_s, requestUri_s, timeTaken_d, host_s
| order by timeTaken_d desc
| take 100`;
    return await this.runKqlQuery(workspaceId, query, hours);
  }

  async getTopClientIps(workspaceId: string, gatewayName: string, hours: number = 1) {
    const query = `
AzureDiagnostics
| where ResourceType == "APPLICATIONGATEWAYS"
| where Resource =~ "${gatewayName}"
| where TimeGenerated > ago(${hours}h)
| summarize RequestCount=count(), FailedCount=countif(httpStatus_d >= 400) by clientIP_s
| order by RequestCount desc
| take 20`;
    return await this.runKqlQuery(workspaceId, query, hours);
  }

  async getBackendLatencyAnalysis(workspaceId: string, gatewayName: string, hours: number = 1) {
    const query = `
AzureDiagnostics
| where ResourceType == "APPLICATIONGATEWAYS"
| where Resource =~ "${gatewayName}"
| where TimeGenerated > ago(${hours}h)
| where isnotempty(serverRouted_s)
| summarize AvgLatency=avg(todouble(serverResponseLatency_s)), P95Latency=percentile(todouble(serverResponseLatency_s), 95), MaxLatency=max(todouble(serverResponseLatency_s)), RequestCount=count() by serverRouted_s
| order by AvgLatency desc`;
    return await this.runKqlQuery(workspaceId, query, hours);
  }

  async getWafBlockedRequests(workspaceId: string, gatewayName: string, hours: number = 24) {
    const query = `
AzureDiagnostics
| where ResourceType == "APPLICATIONGATEWAYS"
| where Resource =~ "${gatewayName}"
| where Category == "ApplicationGatewayFirewallLog"
| where action_s == "Blocked"
| where TimeGenerated > ago(${hours}h)
| summarize BlockCount=count() by ruleId_s, ruleGroup_s, bin(TimeGenerated, 1h)
| order by BlockCount desc`;
    return await this.runKqlQuery(workspaceId, query, hours);
  }
}
