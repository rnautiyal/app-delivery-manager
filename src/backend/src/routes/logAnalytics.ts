import { Router, Response } from "express";
import { KustoService } from "../services/kustoService";
import { OperationalInsightsManagementClient } from "@azure/arm-operationalinsights";
import { getAzureCredential } from "../config/azure";
import { AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const kustoService = new KustoService();

// List Log Analytics workspaces in a subscription
router.get("/workspaces/:subscriptionId", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const client = new OperationalInsightsManagementClient(getAzureCredential(), req.params.subscriptionId);
    const workspaces: any[] = [];
    for await (const ws of client.workspaces.list()) {
      workspaces.push({
        id: ws.customerId, // This is the workspace GUID used for queries
        resourceId: ws.id,
        name: ws.name,
        resourceGroup: ws.id?.split("/resourceGroups/")[1]?.split("/")[0] || "",
        location: ws.location,
        sku: ws.sku?.name,
      });
    }
    res.json({ success: true, data: workspaces });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to list workspaces",
    });
  }
}) as any);

// Run a custom KQL query
router.post("/query", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workspaceId, query, hoursBack } = req.body;
    if (!workspaceId || !query) {
      res.status(400).json({ success: false, error: "workspaceId and query are required" });
      return;
    }
    const result = await kustoService.runKqlQuery(workspaceId, query, hoursBack || 24);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to run query",
    });
  }
}) as any);

// Get cross-resource traffic overview
router.get("/traffic-overview", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    const hours = req.query.hours as string;
    if (!workspaceId) {
      res.status(400).json({ success: false, error: "workspaceId is required" });
      return;
    }
    const h = parseInt(hours) || 24;
    const query = `
AzureDiagnostics
| where TimeGenerated > ago(${h}h)
| where ResourceType in ("APPLICATIONGATEWAYS", "TRAFFICMANAGERPROFILES", "FRONTDOORS", "VIRTUALMACHINES")
| summarize RequestCount=count(), ErrorCount=countif(httpStatus_d >= 400 or Level == "Error") by ResourceType, Resource, bin(TimeGenerated, 1h)
| order by TimeGenerated desc`;
    const result = await kustoService.runKqlQuery(workspaceId, query, h);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get traffic overview",
    });
  }
}) as any);

// Get end-to-end latency (TM → AFD → AppGW → VM)
router.get("/e2e-latency", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    const hours = req.query.hours as string;
    if (!workspaceId) {
      res.status(400).json({ success: false, error: "workspaceId is required" });
      return;
    }
    const h = parseInt(hours) || 1;
    const query = `
AzureDiagnostics
| where TimeGenerated > ago(${h}h)
| where ResourceType in ("APPLICATIONGATEWAYS", "FRONTDOORS")
| where isnotempty(timeTaken_d) or isnotempty(todouble(serverResponseLatency_s))
| project TimeGenerated, ResourceType, Resource, 
    Latency = coalesce(timeTaken_d, todouble(serverResponseLatency_s)),
    httpStatus_d, serverRouted_s, requestUri_s
| summarize AvgLatency=avg(Latency), P95Latency=percentile(Latency, 95), P99Latency=percentile(Latency, 99), RequestCount=count() 
    by ResourceType, Resource, bin(TimeGenerated, 5m)
| order by TimeGenerated desc`;
    const result = await kustoService.runKqlQuery(workspaceId, query, h);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get E2E latency",
    });
  }
}) as any);

// Get error breakdown across all resources
router.get("/errors", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    const hours = req.query.hours as string;
    if (!workspaceId) {
      res.status(400).json({ success: false, error: "workspaceId is required" });
      return;
    }
    const h = parseInt(hours) || 24;
    const query = `
AzureDiagnostics
| where TimeGenerated > ago(${h}h)
| where ResourceType in ("APPLICATIONGATEWAYS", "FRONTDOORS", "TRAFFICMANAGERPROFILES")
| where httpStatus_d >= 400 or Level == "Error" or action_s == "Blocked"
| summarize ErrorCount=count() by ResourceType, Resource, ErrorType=coalesce(tostring(toint(httpStatus_d)), action_s, Level), bin(TimeGenerated, 1h)
| order by ErrorCount desc`;
    const result = await kustoService.runKqlQuery(workspaceId, query, h);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get errors",
    });
  }
}) as any);

// Pre-built query templates
router.get("/query-templates", (async (_req: AuthenticatedRequest, res: Response) => {
  const templates = [
    {
      id: "appgw-access",
      name: "Application Gateway Access Logs",
      category: "Application Gateway",
      query: `AzureDiagnostics\n| where ResourceType == "APPLICATIONGATEWAYS"\n| where Category == "ApplicationGatewayAccessLog"\n| where TimeGenerated > ago(1h)\n| project TimeGenerated, Resource, httpStatus_d, clientIP_s, requestUri_s, timeTaken_d, serverRouted_s\n| order by TimeGenerated desc\n| take 200`,
    },
    {
      id: "appgw-errors",
      name: "Application Gateway Error Summary",
      category: "Application Gateway",
      query: `AzureDiagnostics\n| where ResourceType == "APPLICATIONGATEWAYS"\n| where TimeGenerated > ago(24h)\n| where httpStatus_d >= 400\n| summarize Count=count() by Resource, httpStatus_d\n| order by Count desc`,
    },
    {
      id: "appgw-waf",
      name: "WAF Blocked Requests",
      category: "Application Gateway",
      query: `AzureDiagnostics\n| where ResourceType == "APPLICATIONGATEWAYS"\n| where Category == "ApplicationGatewayFirewallLog"\n| where action_s == "Blocked"\n| where TimeGenerated > ago(24h)\n| summarize BlockCount=count() by Resource, ruleId_s, ruleGroup_s\n| order by BlockCount desc`,
    },
    {
      id: "afd-access",
      name: "Front Door Access Logs",
      category: "Front Door",
      query: `AzureDiagnostics\n| where ResourceType == "FRONTDOORS"\n| where TimeGenerated > ago(1h)\n| project TimeGenerated, Resource, httpStatusCode_d, clientIp_s, requestUri_s, timeTaken_d\n| order by TimeGenerated desc\n| take 200`,
    },
    {
      id: "tm-health",
      name: "Traffic Manager Probe Health",
      category: "Traffic Manager",
      query: `AzureDiagnostics\n| where ResourceType == "TRAFFICMANAGERPROFILES"\n| where Category == "ProbeHealthStatusEvents"\n| where TimeGenerated > ago(24h)\n| project TimeGenerated, Resource, EndpointName_s, Status_s, Message_s\n| order by TimeGenerated desc\n| take 200`,
    },
    {
      id: "vm-perf",
      name: "VM Performance Counters",
      category: "Virtual Machines",
      query: `Perf\n| where TimeGenerated > ago(1h)\n| where ObjectName in ("Processor", "Memory", "LogicalDisk")\n| summarize AvgValue=avg(CounterValue), MaxValue=max(CounterValue) by Computer, ObjectName, CounterName, bin(TimeGenerated, 5m)\n| order by TimeGenerated desc`,
    },
    {
      id: "e2e-latency",
      name: "End-to-End Latency (All Resources)",
      category: "Cross-Resource",
      query: `AzureDiagnostics\n| where TimeGenerated > ago(1h)\n| where ResourceType in ("APPLICATIONGATEWAYS", "FRONTDOORS")\n| where isnotempty(timeTaken_d)\n| summarize AvgLatency=avg(timeTaken_d), P95=percentile(timeTaken_d, 95), RequestCount=count() by ResourceType, Resource, bin(TimeGenerated, 5m)\n| order by TimeGenerated desc`,
    },
    {
      id: "cross-errors",
      name: "Cross-Resource Error Summary",
      category: "Cross-Resource",
      query: `AzureDiagnostics\n| where TimeGenerated > ago(24h)\n| where ResourceType in ("APPLICATIONGATEWAYS", "FRONTDOORS", "TRAFFICMANAGERPROFILES")\n| where httpStatus_d >= 400 or Level == "Error"\n| summarize ErrorCount=count() by ResourceType, Resource, tostring(toint(httpStatus_d))\n| order by ErrorCount desc`,
    },
  ];
  res.json({ success: true, data: templates });
}) as any);

// ── Traffic Analytics Dashboard Queries ──

// Detailed traffic view: client IP, backend, latency, headers, status
router.get("/traffic-analytics", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    const hours = req.query.hours as string;
    const gateway = req.query.gateway as string;
    if (!workspaceId) {
      res.status(400).json({ success: false, error: "workspaceId is required" });
      return;
    }
    const h = parseInt(hours) || 1;
    const gwFilter = gateway ? `| where Resource =~ "${gateway}"` : "";

    // Run multiple queries in parallel for the dashboard
    const [accessLogs, topClients, backendLatency, statusBreakdown, trafficTimeline, afdLogs, tmProbeHealth] = await Promise.all([
      // AppGW access logs with ALL fields
      kustoService.runKqlQuery(workspaceId, `
AzureDiagnostics
| where ResourceType == "APPLICATIONGATEWAYS"
${gwFilter}
| where Category == "ApplicationGatewayAccessLog"
| where TimeGenerated > ago(${h}h)
| project TimeGenerated, Resource, clientIP_s, clientPort_d, httpMethod_s, requestUri_s, 
          requestQuery_s, httpStatus_d, serverStatus_s, httpVersion_s, host_s, originalHost_s,
          serverRouted_s, timeTaken_d, serverResponseLatency_s, 
          receivedBytes_d, sentBytes_d, userAgent_s, originalRequestUriWithArgs_s,
          sslEnabled_s, sslCipher_s, sslProtocol_s, sslClientVerify_s,
          listenerName_s, ruleName_s, backendPoolName_s, backendSettingName_s,
          transactionId_g
| order by TimeGenerated desc
| take 500`, h),

      // Top client IPs (across AppGW + AFD)
      kustoService.runKqlQuery(workspaceId, `
AzureDiagnostics
| where ResourceType in ("APPLICATIONGATEWAYS", "FRONTDOORS")
${gwFilter}
| where TimeGenerated > ago(${h}h)
| extend ClientIP = coalesce(clientIP_s, clientIp_s)
| where isnotempty(ClientIP)
| summarize Requests=count(), AvgLatency=avg(coalesce(timeTaken_d, 0.0)), Errors=countif(toint(coalesce(httpStatus_d, httpStatusCode_d)) >= 400), 
            BytesSent=sum(coalesce(sentBytes_d, 0.0)), BytesReceived=sum(coalesce(receivedBytes_d, 0.0))
  by ClientIP, ResourceType
| order by Requests desc
| take 50`, h),

      // Backend latency per server
      kustoService.runKqlQuery(workspaceId, `
AzureDiagnostics
| where ResourceType == "APPLICATIONGATEWAYS"
${gwFilter}
| where Category == "ApplicationGatewayAccessLog"
| where TimeGenerated > ago(${h}h)
| where isnotempty(serverRouted_s)
| summarize Requests=count(), 
            AvgLatency=avg(timeTaken_d), P95Latency=percentile(timeTaken_d, 95), 
            MaxLatency=max(timeTaken_d), AvgBackendLatency=avg(todouble(serverResponseLatency_s)),
            Errors=countif(httpStatus_d >= 400)
  by serverRouted_s, Resource
| order by Requests desc`, h),

      // HTTP status breakdown (AppGW + AFD)
      kustoService.runKqlQuery(workspaceId, `
AzureDiagnostics
| where ResourceType in ("APPLICATIONGATEWAYS", "FRONTDOORS")
${gwFilter}
| where TimeGenerated > ago(${h}h)
| extend StatusCode = coalesce(tostring(toint(httpStatus_d)), tostring(toint(httpStatusCode_d)))
| where isnotempty(StatusCode)
| summarize Count=count() by StatusCode, ResourceType, Resource
| order by Count desc`, h),

      // Traffic timeline (AppGW + AFD requests per 5 min)
      kustoService.runKqlQuery(workspaceId, `
AzureDiagnostics
| where ResourceType in ("APPLICATIONGATEWAYS", "FRONTDOORS")
${gwFilter}
| where TimeGenerated > ago(${h}h)
| extend Latency = coalesce(timeTaken_d, 0.0), IsError = iff(toint(coalesce(httpStatus_d, httpStatusCode_d)) >= 400, 1, 0)
| summarize Requests=count(), AvgLatency=avg(Latency), Errors=sum(IsError)
  by bin(TimeGenerated, 5m), ResourceType, Resource
| order by TimeGenerated asc`, h),

      // Front Door access logs
      kustoService.runKqlQuery(workspaceId, `
AzureDiagnostics
| where ResourceType == "FRONTDOORS"
| where TimeGenerated > ago(${h}h)
| extend RoutingRule = column_ifexists("routingRuleName_s", ""), BackendHost = column_ifexists("backendHostname_s", ""),
         CacheStatus = column_ifexists("cacheStatus_s", ""), POP = column_ifexists("pop_s", ""),
         SecurityProto = column_ifexists("securityProtocol_s", ""), SocketIP = column_ifexists("socketIp_s", "")
| project TimeGenerated, Resource, column_ifexists("clientIp_s", ""), column_ifexists("httpMethod_s", ""), column_ifexists("requestUri_s", ""),
          column_ifexists("httpStatusCode_d", 0), RoutingRule, BackendHost, column_ifexists("timeTaken_d", 0),
          column_ifexists("requestBytes_d", 0), column_ifexists("responseBytes_d", 0), column_ifexists("userAgent_s", ""), column_ifexists("host_s", ""),
          SecurityProto, CacheStatus, POP, column_ifexists("httpVersion_s", ""), SocketIP
| order by TimeGenerated desc
| take 500`, h),

      // Traffic Manager probe health
      kustoService.runKqlQuery(workspaceId, `
AzureDiagnostics
| where ResourceType == "TRAFFICMANAGERPROFILES"
| where TimeGenerated > ago(${h}h)
| project TimeGenerated, Resource, column_ifexists("EndpointName_s", ""), column_ifexists("Status_s", ""), column_ifexists("message_s", column_ifexists("Message", ""))
| order by TimeGenerated desc
| take 200`, h),
    ]);

    res.json({
      success: true,
      data: { accessLogs, topClients, backendLatency, statusBreakdown, trafficTimeline, afdLogs, tmProbeHealth },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get traffic analytics",
    });
  }
}) as any);

export default router;
