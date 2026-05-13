export interface GatewayListItem {
  id: string;
  name: string;
  resourceGroup: string;
  subscriptionId: string;
  location: string;
  sku: string;
  tier: string;
  capacity: number;
  operationalState: string;
  backendPoolCount: number;
  listenerCount: number;
  ruleCount: number;
  wafEnabled: boolean;
  provisioningState: string;
  tags: Record<string, string>;
}

export interface Subscription {
  id: string;
  name: string;
  state: string;
}

export interface BackendPool {
  id: string;
  name: string;
  addresses: { fqdn?: string; ipAddress?: string }[];
}

export interface Listener {
  id: string;
  name: string;
  protocol: string;
  port: number;
  hostName?: string;
  sslCertificateName?: string;
}

export interface RoutingRule {
  id: string;
  name: string;
  ruleType: string;
  priority?: number;
  listenerName: string;
  backendPoolName?: string;
  httpSettingName?: string;
}

export interface CertificateInfo {
  id: string;
  name: string;
  gatewayName: string;
  resourceGroup: string;
  expiryDate?: string;
  subject?: string;
  daysUntilExpiry?: number;
  keyVaultSecretId?: string;
}

export interface WafPolicy {
  id: string;
  name: string;
  resourceGroup: string;
  policyMode: string;
  ruleSetType: string;
  ruleSetVersion: string;
  customRulesCount: number;
  associatedGateways: string[];
}

export interface DiagnosticResult {
  category: string;
  status: "pass" | "fail" | "warn";
  message: string;
  details?: string;
  recommendation?: string;
}

export interface GatewayMetrics {
  throughput: number[];
  totalRequests: number[];
  failedRequests: number[];
  healthyHostCount: number[];
  unhealthyHostCount: number[];
  currentConnections: number[];
  timestamps: string[];
}

// ==================== CONFIG TEMPLATES ====================

export interface ConfigTemplate {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  createdBy: string;
  sourceGateway: {
    name: string;
    resourceGroup: string;
    subscriptionId: string;
  };
  config: {
    sku: { name: string; tier: string };
    backendAddressPools: any[];
    backendHttpSettingsCollection: any[];
    httpListeners: any[];
    requestRoutingRules: any[];
    probes: any[];
    frontendPorts: any[];
    wafConfiguration?: any;
    tags: Record<string, string>;
  };
}

// ==================== DRIFT TRACKING ====================

export interface BaselineSnapshot {
  id: string;
  gatewayId: string;
  gatewayName: string;
  resourceGroup: string;
  subscriptionId: string;
  createdAt: string;
  createdBy: string;
  config: any;
}

export interface DriftChange {
  component: string;
  name: string;
  changeType: "added" | "removed" | "modified";
  baselineValue?: any;
  currentValue?: any;
  details?: string;
}

export interface DriftReport {
  gatewayName: string;
  resourceGroup: string;
  subscriptionId: string;
  baselineId: string;
  baselineDate: string;
  checkedAt: string;
  hasDrift: boolean;
  totalChanges: number;
  additions: number;
  removals: number;
  modifications: number;
  changes: DriftChange[];
}

// ==================== ALERTING ====================

export type AlertSeverity = "critical" | "high" | "medium" | "low";
export type AlertConditionType =
  | "drift_detected"
  | "cert_expiring"
  | "unhealthy_backends"
  | "gateway_stopped"
  | "waf_detection_mode";

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  conditionType: AlertConditionType;
  conditionParams: Record<string, any>;
  severity: AlertSeverity;
  subscriptionId: string;
  gatewayFilter?: string;
  createdAt: string;
  createdBy: string;
  emailEnabled?: boolean;
  emailTo?: string;
}

export interface AlertHistoryEntry {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  conditionType: AlertConditionType;
  gatewayName: string;
  resourceGroup: string;
  subscriptionId: string;
  message: string;
  details?: any;
  triggeredAt: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

// ==================== ACTIVITY LOG ====================

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resourceType: string;
  resourceName: string;
  subscriptionId?: string;
  details?: string;
}

// ==================== TRAFFIC MANAGER ====================

export interface TrafficManagerEndpoint {
  id: string;
  name: string;
  type: string;
  targetResourceId?: string;
  target?: string;
  endpointStatus: string;
  endpointMonitorStatus: string;
  weight?: number;
  priority?: number;
  endpointLocation?: string;
}

export interface TrafficManagerProfile {
  id: string;
  name: string;
  resourceGroup: string;
  subscriptionId: string;
  location: string;
  profileStatus: string;
  trafficRoutingMethod: string;
  dnsConfig: {
    relativeName: string;
    fqdn: string;
    ttl: number;
  };
  monitorConfig: {
    protocol: string;
    port: number;
    path: string;
    profileMonitorStatus: string;
    intervalInSeconds: number;
    timeoutInSeconds: number;
    toleratedNumberOfFailures: number;
  };
  endpoints: TrafficManagerEndpoint[];
  maxReturn?: number;
  tags: Record<string, string>;
}

// Azure Front Door types
export interface AfdProfile {
  id: string;
  name: string;
  resourceGroup: string;
  subscriptionId: string;
  location: string;
  sku: string;
  provisioningState: string;
  resourceState: string;
  frontDoorId: string;
  originResponseTimeoutSeconds: number;
  tags: Record<string, string>;
  endpointCount: number;
  customDomainCount: number;
  originGroupCount: number;
}

export interface AfdEndpoint {
  id: string;
  name: string;
  hostName: string;
  enabledState: string;
  provisioningState: string;
  deploymentStatus: string;
}

export interface AfdOriginGroup {
  id: string;
  name: string;
  provisioningState: string;
  healthProbeSettings: {
    probePath: string;
    probeProtocol: string;
    probeIntervalInSeconds: number;
    probeRequestType: string;
  } | null;
  loadBalancingSettings: {
    sampleSize: number;
    successfulSamplesRequired: number;
    additionalLatencyInMilliseconds: number;
  } | null;
  origins: AfdOrigin[];
}

export interface AfdOrigin {
  id: string;
  name: string;
  hostName: string;
  httpPort: number;
  httpsPort: number;
  originHostHeader: string;
  priority: number;
  weight: number;
  enabledState: string;
  provisioningState: string;
}

export interface AfdCustomDomain {
  id: string;
  name: string;
  hostName: string;
  validationState: string;
  domainValidationState: string;
  provisioningState: string;
  deploymentStatus: string;
  tlsSettings: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ==================== PRIVATE DNS FAILOVER ====================

export interface FailoverEndpoint {
  ip: string;
  appGateway: string;
  resourceGroup: string;
  region: string;
  label: string;
  priority: number;
}

export interface FailoverGroup {
  id: string;
  name: string;
  dnsZone: string;
  dnsResourceGroup: string;
  recordName: string;
  subscriptionId: string;
  endpoints: FailoverEndpoint[];
  failoverMode: "active-active" | "active-standby";
  probeIntervalSeconds: number;
  failureThreshold: number;
  autoFailover: boolean;
  ttlSeconds: number;
  createdAt: string;
  createdBy: string;
}

export interface FailoverHistoryEntry {
  id: string;
  failoverGroupId: string;
  timestamp: string;
  action: string;
  ip: string;
  appGateway: string;
  region: string;
  reason: string;
  triggeredBy: string;
}

export interface FailoverEndpointHealth {
  ip: string;
  appGateway: string;
  region: string;
  label: string;
  operationalState: string;
  healthy: boolean;
  inDns: boolean;
}

export interface FailoverStatus {
  group: FailoverGroup;
  activeIps: string[];
  endpointHealth: FailoverEndpointHealth[];
  mode: "active-active" | "degraded" | "single";
  lastFailover?: FailoverHistoryEntry;
}

export interface ManagedGroup {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  subscriptionId: string;
  masterGatewayId: string;
  resources: {
    gateways: string[];
    wafPolicies: string[];
    trafficManagers: string[];
    frontDoors: string[];
  };
  syncConfig: {
    syncBackendPools: boolean;
    syncHttpSettings: boolean;
    syncListeners: boolean;
    syncRules: boolean;
    syncProbes: boolean;
    syncWafConfig: boolean;
    syncSslCerts: boolean;
  };
  lastSyncAt: string;
  lastSyncStatus: string;
  tags: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}
