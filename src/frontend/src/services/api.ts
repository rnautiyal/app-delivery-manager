import axios, { AxiosInstance } from "axios";
import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig, loginRequest, apiConfig } from "../config/authConfig";
import {
  ApiResponse,
  Subscription,
  GatewayListItem,
  CertificateInfo,
  WafPolicy,
  GatewayMetrics,
  DiagnosticResult,
  ConfigTemplate,
  BaselineSnapshot,
  DriftReport,
  AlertRule,
  AlertHistoryEntry,
  ActivityLogEntry,
  TrafficManagerProfile,
  AfdProfile,
  AfdEndpoint,
  AfdOriginGroup,
  AfdCustomDomain,
  ManagedGroup,
  FailoverGroup,
  FailoverStatus,
  FailoverHistoryEntry,
} from "../types";

let msalInstance: PublicClientApplication | null = null;

export function setMsalInstance(instance: PublicClientApplication) {
  msalInstance = instance;
}

export async function getAccessToken(): Promise<string> {
  // Demo mode — use demo token
  const demoToken = localStorage.getItem("demo_token");
  if (demoToken) return demoToken;

  if (!msalInstance) throw new Error("MSAL not initialized");

  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) throw new Error("No authenticated accounts");

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0],
    });
    return response.accessToken;
  } catch {
    const response = await msalInstance.acquireTokenPopup(loginRequest);
    return response.accessToken;
  }
}

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: apiConfig.baseUrl,
    headers: { "Content-Type": "application/json" },
  });

  client.interceptors.request.use(async (config) => {
    try {
      const token = await getAccessToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch {
      // Will be handled by response interceptor
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        window.location.href = "/";
      }
      return Promise.reject(error);
    }
  );

  return client;
}

const api = createApiClient();

// Subscriptions
export async function getSubscriptions(): Promise<Subscription[]> {
  const { data } = await api.get<ApiResponse<Subscription[]>>("/subscriptions");
  return data.data || [];
}

// Gateways
export async function getGateways(subscriptionId: string): Promise<GatewayListItem[]> {
  const { data } = await api.get<ApiResponse<GatewayListItem[]>>(`/gateways/${subscriptionId}`);
  return data.data || [];
}

export async function getGatewayDetail(subscriptionId: string, resourceGroup: string, name: string) {
  const { data } = await api.get(`/gateways/${subscriptionId}/${resourceGroup}/${name}`);
  return data.data;
}

export async function createGateway(subscriptionId: string, resourceGroup: string, name: string, params: any) {
  const { data } = await api.post(`/gateways/${subscriptionId}/${resourceGroup}/${name}`, params);
  return data.data;
}

export async function deleteGateway(subscriptionId: string, resourceGroup: string, name: string) {
  const { data } = await api.delete(`/gateways/${subscriptionId}/${resourceGroup}/${name}`);
  return data;
}

export async function startGateway(subscriptionId: string, resourceGroup: string, name: string) {
  const { data } = await api.post(`/gateways/${subscriptionId}/${resourceGroup}/${name}/start`);
  return data;
}

export async function stopGateway(subscriptionId: string, resourceGroup: string, name: string) {
  const { data } = await api.post(`/gateways/${subscriptionId}/${resourceGroup}/${name}/stop`);
  return data;
}

export async function getBackendHealth(subscriptionId: string, resourceGroup: string, name: string) {
  const { data } = await api.get(`/gateways/${subscriptionId}/${resourceGroup}/${name}/health`);
  return data.data;
}

export async function checkDdosProtection(subscriptionId: string, resourceGroup: string, name: string): Promise<{
  enabled: boolean;
  planId?: string;
  planName?: string;
  vnetName?: string;
  mode?: string;
  vnetEncryption?: boolean;
  vnetEncryptionEnforcement?: string;
}> {
  const { data } = await api.get(`/gateways/${subscriptionId}/${resourceGroup}/${name}/ddos`);
  return data.data;
}

export async function enableDdosProtection(subscriptionId: string, resourceGroup: string, name: string): Promise<any> {
  const { data } = await api.post(`/gateways/${subscriptionId}/${resourceGroup}/${name}/ddos/enable`);
  return data.data;
}

export async function enableVnetEncryption(subscriptionId: string, resourceGroup: string, name: string): Promise<any> {
  const { data } = await api.post(`/gateways/${subscriptionId}/${resourceGroup}/${name}/vnet-encryption/enable`);
  return data.data;
}

export async function disableVnetEncryption(subscriptionId: string, resourceGroup: string, name: string): Promise<any> {
  const { data } = await api.post(`/gateways/${subscriptionId}/${resourceGroup}/${name}/vnet-encryption/disable`);
  return data.data;
}

export async function disableDdosProtection(subscriptionId: string, resourceGroup: string, name: string): Promise<any> {
  const { data } = await api.post(`/gateways/${subscriptionId}/${resourceGroup}/${name}/ddos/disable`);
  return data.data;
}

// Certificates
export async function getCertificates(subscriptionId: string): Promise<CertificateInfo[]> {
  const { data } = await api.get<ApiResponse<CertificateInfo[]>>(`/certificates/${subscriptionId}`);
  return data.data || [];
}

export async function getExpiringCertificates(subscriptionId: string, days: number = 30): Promise<CertificateInfo[]> {
  const { data } = await api.get<ApiResponse<CertificateInfo[]>>(
    `/certificates/${subscriptionId}/expiring?days=${days}`
  );
  return data.data || [];
}

// WAF
export async function getWafPolicies(subscriptionId: string): Promise<WafPolicy[]> {
  const { data } = await api.get<ApiResponse<WafPolicy[]>>(`/waf/${subscriptionId}`);
  return data.data || [];
}

export async function getWafPolicy(subscriptionId: string, resourceGroup: string, name: string): Promise<any> {
  const { data } = await api.get(`/waf/${subscriptionId}/${resourceGroup}/${name}`);
  return data.data;
}

export async function getWafPolicyDetail(subscriptionId: string, resourceGroup: string, name: string): Promise<any> {
  const { data } = await api.get(`/waf/${subscriptionId}/${resourceGroup}/${name}`);
  return data.data;
}

// Monitoring
export async function getGatewayMetrics(resourceId: string, timeRange?: string): Promise<GatewayMetrics> {
  const params = timeRange ? `?timeRange=${timeRange}` : "";
  const { data } = await api.get<ApiResponse<GatewayMetrics>>(`/monitoring/metrics/${resourceId}${params}`);
  return data.data!;
}

// Diagnostics
export async function runDiagnostics(
  subscriptionId: string,
  resourceGroup: string,
  name: string
): Promise<{ summary: any; results: DiagnosticResult[] }> {
  const { data } = await api.get(`/diagnostics/${subscriptionId}/${resourceGroup}/${name}`);
  return data.data;
}

// ==================== CONFIG TEMPLATES ====================

export async function getTemplates(): Promise<ConfigTemplate[]> {
  const { data } = await api.get<ApiResponse<ConfigTemplate[]>>("/templates");
  return data.data || [];
}

export async function getTemplate(id: string): Promise<ConfigTemplate> {
  const { data } = await api.get<ApiResponse<ConfigTemplate>>(`/templates/${id}`);
  return data.data!;
}

export async function saveTemplate(params: {
  subscriptionId: string;
  resourceGroup: string;
  gatewayName: string;
  name: string;
  description: string;
}): Promise<ConfigTemplate> {
  const { data } = await api.post<ApiResponse<ConfigTemplate>>("/templates", params);
  return data.data!;
}

export async function deleteTemplate(id: string): Promise<void> {
  await api.delete(`/templates/${id}`);
}

export async function applyTemplate(
  id: string,
  params: { subscriptionId: string; resourceGroup: string; gatewayName: string }
): Promise<any> {
  const { data } = await api.post(`/templates/${id}/apply`, params);
  return data.data;
}

export async function exportTemplate(id: string): Promise<any> {
  const { data } = await api.get<ApiResponse<any>>(`/templates/${id}/export`);
  return data.data;
}

export async function exportTemplateAsArm(id: string): Promise<any> {
  const { data } = await api.get<ApiResponse<any>>(`/templates/${id}/export/arm`);
  return data.data;
}

export async function exportTemplateAsBicep(id: string): Promise<any> {
  const { data } = await api.get<ApiResponse<any>>(`/templates/${id}/export/bicep`);
  return data.data;
}

export async function exportTemplateAsTerraform(id: string): Promise<any> {
  const { data } = await api.get<ApiResponse<any>>(`/templates/${id}/export/terraform`);
  return data.data;
}

export async function deployTemplate(id: string, params: { subscriptionId: string; resourceGroup: string; gatewayName: string; location: string }): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>(`/templates/${id}/deploy`, params);
  return data.data;
}

export async function importTemplate(template: any): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>("/templates/import", { template });
  return data.data;
}

export async function getTemplateVersions(id: string): Promise<any> {
  const { data } = await api.get<ApiResponse<any>>(`/templates/${id}/versions`);
  return data.data;
}

export async function restoreTemplateVersion(id: string, versionIndex: number): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>(`/templates/${id}/versions/${versionIndex}/restore`);
  return data.data;
}

// ==================== DRIFT TRACKING ====================

export async function getBaselines(subscriptionId?: string, gatewayName?: string): Promise<BaselineSnapshot[]> {
  const params = new URLSearchParams();
  if (subscriptionId) params.set("subscriptionId", subscriptionId);
  if (gatewayName) params.set("gatewayName", gatewayName);
  const { data } = await api.get<ApiResponse<BaselineSnapshot[]>>(`/drift/baselines?${params}`);
  return data.data || [];
}

export async function saveBaseline(params: {
  subscriptionId: string;
  resourceGroup: string;
  gatewayName: string;
}): Promise<BaselineSnapshot> {
  const { data } = await api.post<ApiResponse<BaselineSnapshot>>("/drift/baselines", params);
  return data.data!;
}

export async function deleteBaseline(id: string): Promise<void> {
  await api.delete(`/drift/baselines/${id}`);
}

export async function checkDrift(baselineId: string): Promise<DriftReport> {
  const { data } = await api.get<ApiResponse<DriftReport>>(`/drift/check/${baselineId}`);
  return data.data!;
}

// ==================== ALERTING ====================

export async function getAlertRules(subscriptionId?: string): Promise<AlertRule[]> {
  const params = subscriptionId ? `?subscriptionId=${subscriptionId}` : "";
  const { data } = await api.get<ApiResponse<AlertRule[]>>(`/alerts/rules${params}`);
  return data.data || [];
}

export async function createAlertRule(rule: Partial<AlertRule>): Promise<AlertRule> {
  const { data } = await api.post<ApiResponse<AlertRule>>("/alerts/rules", rule);
  return data.data!;
}

export async function updateAlertRule(id: string, rule: Partial<AlertRule>): Promise<AlertRule> {
  const { data } = await api.put<ApiResponse<AlertRule>>(`/alerts/rules/${id}`, rule);
  return data.data!;
}

export async function toggleAlertRule(id: string, enabled: boolean): Promise<AlertRule> {
  const { data } = await api.patch<ApiResponse<AlertRule>>(`/alerts/rules/${id}/toggle`, { enabled });
  return data.data!;
}

export async function deleteAlertRule(id: string): Promise<void> {
  await api.delete(`/alerts/rules/${id}`);
}

export async function evaluateAlerts(subscriptionId: string): Promise<AlertHistoryEntry[]> {
  const { data } = await api.post<ApiResponse<AlertHistoryEntry[]>>("/alerts/evaluate", { subscriptionId });
  return data.data || [];
}

export async function getAlertHistory(subscriptionId?: string, limit?: number): Promise<AlertHistoryEntry[]> {
  const params = new URLSearchParams();
  if (subscriptionId) params.set("subscriptionId", subscriptionId);
  if (limit) params.set("limit", String(limit));
  const { data } = await api.get<ApiResponse<AlertHistoryEntry[]>>(`/alerts/history?${params}`);
  return data.data || [];
}

export async function acknowledgeAlert(id: string): Promise<void> {
  await api.patch(`/alerts/history/${id}/acknowledge`);
}

export async function clearAlertHistory(subscriptionId?: string): Promise<void> {
  const params = subscriptionId ? `?subscriptionId=${subscriptionId}` : "";
  await api.delete(`/alerts/history${params}`);
}

// ==================== BACKUP & RESTORE ====================

export async function createBackup(params: {
  subscriptionId: string; resourceGroup: string; gatewayName: string; description?: string;
}): Promise<any> {
  const { data } = await api.post("/backups", params);
  return data.data;
}

export async function getBackups(subscriptionId?: string, gatewayName?: string): Promise<any[]> {
  const params = new URLSearchParams();
  if (subscriptionId) params.set("subscriptionId", subscriptionId);
  if (gatewayName) params.set("gatewayName", gatewayName);
  const { data } = await api.get(`/backups?${params}`);
  return data.data || [];
}

export async function getBackup(id: string): Promise<any> {
  const { data } = await api.get<ApiResponse<any>>(`/backups/${id}`);
  return data.data;
}

export async function restoreBackup(id: string): Promise<any> {
  const { data } = await api.post(`/backups/${id}/restore`);
  return data.data;
}

export async function deleteBackup(id: string): Promise<void> {
  await api.delete(`/backups/${id}`);
}

export async function compareBackups(id1: string, id2: string): Promise<any> {
  const { data } = await api.get<ApiResponse<any>>(`/backups/compare/${id1}/${id2}`);
  return data.data;
}

export async function compareBackupWithLive(id: string): Promise<any> {
  const { data } = await api.get<ApiResponse<any>>(`/backups/${id}/compare-live`);
  return data.data;
}

// ==================== AWS ALB ====================

export async function getAwsStatus(): Promise<{ configured: boolean; regions: string[] }> {
  const { data } = await api.get(`/aws/status`);
  return data.data;
}

export async function getAwsAlbs(region?: string): Promise<any[]> {
  const params = region ? `?region=${region}` : "";
  const { data } = await api.get(`/aws/albs${params}`);
  return data.data || [];
}

export async function getAwsAlbDetails(region: string, arn: string): Promise<any> {
  const { data } = await api.get(`/aws/albs/${region}/details?arn=${encodeURIComponent(arn)}`);
  return data.data;
}

// ==================== AUTOSCALE ====================

export async function getAutoscaleSchedules(subscriptionId?: string): Promise<any[]> {
  const params = subscriptionId ? `?subscriptionId=${subscriptionId}` : "";
  const { data } = await api.get(`/autoscale${params}`);
  return data.data || [];
}

export async function createAutoscaleSchedule(schedule: any): Promise<any> {
  const { data } = await api.post(`/autoscale`, schedule);
  return data.data;
}

export async function toggleAutoscaleSchedule(id: string, enabled: boolean): Promise<any> {
  const { data } = await api.patch(`/autoscale/${id}/toggle`, { enabled });
  return data.data;
}

export async function deleteAutoscaleSchedule(id: string): Promise<void> {
  await api.delete(`/autoscale/${id}`);
}

// ==================== MAINTENANCE ====================

export async function getAvailableUpgrades(subscriptionId: string): Promise<any[]> {
  const { data } = await api.get(`/maintenance/upgrades/${subscriptionId}`);
  return data.data || [];
}

export async function getScheduledMaintenance(subscriptionId?: string): Promise<any[]> {
  const params = subscriptionId ? `?subscriptionId=${subscriptionId}` : "";
  const { data } = await api.get(`/maintenance/scheduled${params}`);
  return data.data || [];
}

export async function scheduleMaintenance(params: {
  subscriptionId: string;
  resourceGroup: string;
  gatewayName: string;
  upgradeType: string;
  upgradeVersion: string;
  upgradeDescription: string;
  scheduledAt: string;
  notes?: string;
  scheduledTime?: string;
  estimatedDurationMinutes?: number;
  blackoutStart?: string;
  blackoutEnd?: string;
}): Promise<any> {
  const { data } = await api.post(`/maintenance/schedule`, params);
  return data.data;
}

export async function cancelMaintenance(id: string): Promise<void> {
  await api.delete(`/maintenance/${id}`);
}

// ==================== ACTIVITY LOG ====================

export async function getActivityLog(
  subscriptionId?: string,
  limit?: number,
  actionType?: string
): Promise<ActivityLogEntry[]> {
  const params = new URLSearchParams();
  if (subscriptionId) params.set("subscriptionId", subscriptionId);
  if (limit) params.set("limit", String(limit));
  if (actionType) params.set("actionType", actionType);
  const { data } = await api.get<ApiResponse<ActivityLogEntry[]>>(`/activity-log?${params}`);
  return data.data || [];
}

// ==================== CERTIFICATE GENERATION ====================

export async function generateCertificate(commonName: string, daysValid?: number): Promise<{
  pfxBase64: string;
  password: string;
  commonName: string;
  daysValid: number;
}> {
  const { data } = await api.post("/certificates/generate", { commonName, daysValid });
  return data.data;
}

export async function addHttpsListenerToGateway(
  subscriptionId: string,
  resourceGroup: string,
  gatewayName: string,
  certData: string,
  certPassword: string,
  certName: string,
  listenerName: string,
  port: number,
  hostName?: string
): Promise<any> {
  const { data } = await api.post(`/gateways/${subscriptionId}/${resourceGroup}/${gatewayName}`, {
    action: "addHttpsListener",
    certData,
    certPassword,
    certName,
    listenerName,
    port,
    hostName,
  });
  return data.data;
}

// ==================== TRAFFIC MANAGER ====================

export async function getTrafficManagerProfiles(subscriptionId: string): Promise<TrafficManagerProfile[]> {
  const { data } = await api.get<ApiResponse<TrafficManagerProfile[]>>(`/traffic-manager/${subscriptionId}`);
  return data.data || [];
}

export async function getTrafficManagerProfile(
  subscriptionId: string,
  resourceGroup: string,
  profileName: string
): Promise<TrafficManagerProfile> {
  const { data } = await api.get<ApiResponse<TrafficManagerProfile>>(
    `/traffic-manager/${subscriptionId}/${resourceGroup}/${profileName}`
  );
  return data.data!;
}

export async function enableTrafficManagerProfile(subscriptionId: string, resourceGroup: string, profileName: string): Promise<void> {
  await api.post(`/traffic-manager/${subscriptionId}/${resourceGroup}/${profileName}/enable`);
}

export async function disableTrafficManagerProfile(subscriptionId: string, resourceGroup: string, profileName: string): Promise<void> {
  await api.post(`/traffic-manager/${subscriptionId}/${resourceGroup}/${profileName}/disable`);
}

export async function updateTmRoutingMethod(subscriptionId: string, resourceGroup: string, profileName: string, routingMethod: string): Promise<void> {
  await api.post(`/traffic-manager/${subscriptionId}/${resourceGroup}/${profileName}/routing-method`, { routingMethod });
}

export async function deleteTrafficManagerProfile(subscriptionId: string, resourceGroup: string, profileName: string): Promise<void> {
  await api.delete(`/traffic-manager/${subscriptionId}/${resourceGroup}/${profileName}`);
}

export async function enableTrafficManagerEndpoint(subscriptionId: string, resourceGroup: string, profileName: string, endpointType: string, endpointName: string): Promise<void> {
  await api.post(`/traffic-manager/${subscriptionId}/${resourceGroup}/${profileName}/endpoints/${endpointType}/${endpointName}/enable`);
}

export async function disableTrafficManagerEndpoint(subscriptionId: string, resourceGroup: string, profileName: string, endpointType: string, endpointName: string): Promise<void> {
  await api.post(`/traffic-manager/${subscriptionId}/${resourceGroup}/${profileName}/endpoints/${endpointType}/${endpointName}/disable`);
}

// ==================== AZURE FRONT DOOR ====================

export async function getAfdProfiles(subscriptionId: string): Promise<AfdProfile[]> {
  const { data } = await api.get<ApiResponse<AfdProfile[]>>(`/afd/${subscriptionId}`);
  return data.data || [];
}

export async function getAfdProfile(subscriptionId: string, resourceGroup: string, profileName: string): Promise<AfdProfile> {
  const { data } = await api.get<ApiResponse<AfdProfile>>(`/afd/${subscriptionId}/${resourceGroup}/${profileName}`);
  return data.data!;
}

export async function getAfdEndpoints(subscriptionId: string, resourceGroup: string, profileName: string): Promise<AfdEndpoint[]> {
  const { data } = await api.get<ApiResponse<AfdEndpoint[]>>(`/afd/${subscriptionId}/${resourceGroup}/${profileName}/endpoints`);
  return data.data || [];
}

export async function getAfdOriginGroups(subscriptionId: string, resourceGroup: string, profileName: string): Promise<AfdOriginGroup[]> {
  const { data } = await api.get<ApiResponse<AfdOriginGroup[]>>(`/afd/${subscriptionId}/${resourceGroup}/${profileName}/origin-groups`);
  return data.data || [];
}

export async function getAfdCustomDomains(subscriptionId: string, resourceGroup: string, profileName: string): Promise<AfdCustomDomain[]> {
  const { data } = await api.get<ApiResponse<AfdCustomDomain[]>>(`/afd/${subscriptionId}/${resourceGroup}/${profileName}/custom-domains`);
  return data.data || [];
}

export async function purgeAfdEndpoint(subscriptionId: string, resourceGroup: string, profileName: string, endpointName: string, contentPaths?: string[]): Promise<void> {
  await api.post(`/afd/${subscriptionId}/${resourceGroup}/${profileName}/endpoints/${endpointName}/purge`, { contentPaths: contentPaths || ["/*"] });
}

export async function deleteAfdProfile(subscriptionId: string, resourceGroup: string, profileName: string): Promise<void> {
  await api.delete(`/afd/${subscriptionId}/${resourceGroup}/${profileName}`);
}

export async function createAfdFullProfile(subscriptionId: string, params: {
  resourceGroup: string; location: string; profileName: string; sku: string;
  endpointName: string; originGroupName: string; originName: string;
  originHostName: string; originHostHeader: string; routeName: string;
  probeProtocol?: string; probePath?: string; probeIntervalInSeconds?: number;
}): Promise<any> {
  const { data } = await api.post(`/afd/${subscriptionId}/create`, params);
  return data.data;
}

// ==================== MANAGED GROUPS ====================

export async function getManagedGroups(subscriptionId?: string): Promise<ManagedGroup[]> {
  const params = subscriptionId ? `?subscriptionId=${subscriptionId}` : "";
  const { data } = await api.get<ApiResponse<ManagedGroup[]>>(`/managed-groups${params}`);
  return data.data || [];
}

export async function createManagedGroup(params: { name: string; description?: string; color?: string; icon?: string; subscriptionId: string }): Promise<ManagedGroup> {
  const { data } = await api.post<ApiResponse<ManagedGroup>>("/managed-groups", params);
  return data.data!;
}

export async function updateManagedGroup(id: string, params: Partial<ManagedGroup>): Promise<ManagedGroup> {
  const { data } = await api.put<ApiResponse<ManagedGroup>>(`/managed-groups/${id}`, params);
  return data.data!;
}

export async function deleteManagedGroup(id: string): Promise<void> {
  await api.delete(`/managed-groups/${id}`);
}

export async function addResourceToGroup(groupId: string, resourceType: string, resourceId: string): Promise<ManagedGroup> {
  const { data } = await api.post<ApiResponse<ManagedGroup>>(`/managed-groups/${groupId}/resources`, { resourceType, resourceId });
  return data.data!;
}

export async function removeResourceFromGroup(groupId: string, resourceType: string, resourceId: string): Promise<ManagedGroup> {
  const { data } = await api.delete<ApiResponse<ManagedGroup>>(`/managed-groups/${groupId}/resources`, { data: { resourceType, resourceId } });
  return data.data!;
}

export async function setMasterGateway(groupId: string, gatewayId: string): Promise<ManagedGroup> {
  const { data } = await api.post<ApiResponse<ManagedGroup>>(`/managed-groups/${groupId}/master`, { gatewayId });
  return data.data!;
}

export async function syncManagedGroup(groupId: string): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>(`/managed-groups/${groupId}/sync`);
  return data.data;
}

export async function updateSyncConfig(groupId: string, config: Record<string, boolean>): Promise<ManagedGroup> {
  const { data } = await api.put<ApiResponse<ManagedGroup>>(`/managed-groups/${groupId}/sync-config`, config);
  return data.data!;
}

export async function previewSync(groupId: string): Promise<any[]> {
  const { data } = await api.get<ApiResponse<any[]>>(`/managed-groups/${groupId}/sync-preview`);
  return data.data || [];
}

export async function getSyncHistory(groupId: string): Promise<any[]> {
  const { data } = await api.get<ApiResponse<any[]>>(`/managed-groups/${groupId}/sync-history`);
  return data.data || [];
}

// ==================== Log Analytics ====================

export async function getLogAnalyticsWorkspaces(subscriptionId: string): Promise<any[]> {
  const { data } = await api.get<ApiResponse<any[]>>(`/log-analytics/workspaces/${subscriptionId}`);
  return data.data || [];
}

export async function runLogAnalyticsQuery(workspaceId: string, query: string, hoursBack?: number): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>("/log-analytics/query", { workspaceId, query, hoursBack });
  return data.data;
}

export async function getLogAnalyticsTrafficOverview(workspaceId: string, hours?: number): Promise<any> {
  const { data } = await api.get<ApiResponse<any>>(`/log-analytics/traffic-overview?workspaceId=${workspaceId}&hours=${hours || 24}`);
  return data.data;
}

export async function getLogAnalyticsE2ELatency(workspaceId: string, hours?: number): Promise<any> {
  const { data } = await api.get<ApiResponse<any>>(`/log-analytics/e2e-latency?workspaceId=${workspaceId}&hours=${hours || 1}`);
  return data.data;
}

export async function getLogAnalyticsErrors(workspaceId: string, hours?: number): Promise<any> {
  const { data } = await api.get<ApiResponse<any>>(`/log-analytics/errors?workspaceId=${workspaceId}&hours=${hours || 24}`);
  return data.data;
}

export async function getLogAnalyticsQueryTemplates(): Promise<any[]> {
  const { data } = await api.get<ApiResponse<any[]>>("/log-analytics/query-templates");
  return data.data || [];
}

export async function getTrafficAnalytics(workspaceId: string, hours?: number, gateway?: string): Promise<any> {
  const params = new URLSearchParams({ workspaceId });
  if (hours) params.set("hours", String(hours));
  if (gateway) params.set("gateway", gateway);
  const { data } = await api.get<ApiResponse<any>>(`/log-analytics/traffic-analytics?${params}`);
  return data.data;
}

// ==================== Traffic Manager Failover ====================

export async function addTrafficManagerFailoverEndpoint(
  subscriptionId: string, resourceGroup: string, profileName: string,
  endpoint: { name: string; target?: string; targetResourceId?: string; type: string; priority?: number; weight?: number }
): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>(
    `/traffic-manager/${subscriptionId}/${resourceGroup}/${profileName}/endpoints/failover`,
    endpoint
  );
  return data.data;
}

export async function checkAndFailover(
  subscriptionId: string, resourceGroup: string, profileName: string
): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>(
    `/traffic-manager/${subscriptionId}/${resourceGroup}/${profileName}/check-failover`
  );
  return data.data;
}

// ── Auto-failover health monitor ──

export async function getTmMonitorStatus(): Promise<any> {
  const { data } = await api.get<ApiResponse<any>>("/traffic-manager/monitor/status");
  return data.data;
}

export async function startTmMonitor(intervalMs?: number): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>("/traffic-manager/monitor/start", { intervalMs });
  return data.data;
}

export async function stopTmMonitor(): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>("/traffic-manager/monitor/stop");
  return data.data;
}

export async function addTmMonitorProfile(subscriptionId: string, resourceGroup: string, profileName: string): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>("/traffic-manager/monitor/profiles", { subscriptionId, resourceGroup, profileName });
  return data.data;
}

export async function removeTmMonitorProfile(subscriptionId: string, resourceGroup: string, profileName: string): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>("/traffic-manager/monitor/profiles/remove", { subscriptionId, resourceGroup, profileName });
  return data.data;
}

export async function getTmFailoverHistory(): Promise<any[]> {
  const { data } = await api.get<ApiResponse<any[]>>("/traffic-manager/monitor/history");
  return data.data || [];
}

// ==================== PRIVATE DNS FAILOVER ====================

export async function getFailoverGroups(): Promise<FailoverGroup[]> {
  const { data } = await api.get<ApiResponse<FailoverGroup[]>>("/failover/groups");
  return data.data || [];
}

export async function getFailoverStatus(groupId: string): Promise<FailoverStatus> {
  const { data } = await api.get<ApiResponse<FailoverStatus>>(`/failover/groups/${groupId}/status`);
  return data.data!;
}

export async function createFailoverGroup(group: Partial<FailoverGroup>): Promise<FailoverGroup> {
  const { data } = await api.post<ApiResponse<FailoverGroup>>("/failover/groups", group);
  return data.data!;
}

export async function deleteFailoverGroup(groupId: string): Promise<void> {
  await api.delete(`/failover/groups/${groupId}`);
}

export async function updateFailoverGroup(groupId: string, updates: Partial<FailoverGroup>): Promise<FailoverGroup> {
  const { data } = await api.put<ApiResponse<FailoverGroup>>(`/failover/groups/${groupId}`, updates);
  return data.data!;
}

export async function removeFailoverEndpoint(groupId: string, ip: string, reason?: string): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>(`/failover/groups/${groupId}/remove-endpoint`, { ip, reason });
  return data.data;
}

export async function addFailoverEndpoint(groupId: string, ip: string, reason?: string): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>(`/failover/groups/${groupId}/add-endpoint`, { ip, reason });
  return data.data;
}

export async function triggerFailover(groupId: string, targetIp: string): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>(`/failover/groups/${groupId}/failover`, { targetIp });
  return data.data;
}

export async function getFailoverHistory(groupId?: string, limit?: number): Promise<FailoverHistoryEntry[]> {
  const params = new URLSearchParams();
  if (groupId) params.set("groupId", groupId);
  if (limit) params.set("limit", limit.toString());
  const { data } = await api.get<ApiResponse<FailoverHistoryEntry[]>>(`/failover/history?${params}`);
  return data.data || [];
}

export async function runFailoverProbe(): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>("/failover/probe");
  return data.data;
}
