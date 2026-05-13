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

export interface BackendPool {
  id: string;
  name: string;
  addresses: BackendAddress[];
}

export interface BackendAddress {
  fqdn?: string;
  ipAddress?: string;
}

export interface HttpSetting {
  id: string;
  name: string;
  port: number;
  protocol: string;
  cookieBasedAffinity: string;
  requestTimeout: number;
  probeName?: string;
}

export interface Listener {
  id: string;
  name: string;
  protocol: string;
  port: number;
  hostName?: string;
  sslCertificateName?: string;
  firewallPolicyId?: string;
}

export interface RoutingRule {
  id: string;
  name: string;
  ruleType: string;
  priority?: number;
  listenerName: string;
  backendPoolName?: string;
  httpSettingName?: string;
  redirectConfigName?: string;
  urlPathMapName?: string;
}

export interface HealthProbe {
  id: string;
  name: string;
  protocol: string;
  host?: string;
  path: string;
  interval: number;
  timeout: number;
  unhealthyThreshold: number;
  matchStatusCodes: string[];
}

export interface CertificateInfo {
  id: string;
  name: string;
  gatewayId: string;
  gatewayName: string;
  resourceGroup: string;
  subscriptionId: string;
  expiryDate?: Date;
  subject?: string;
  thumbprint?: string;
  keyVaultSecretId?: string;
  daysUntilExpiry?: number;
}

export interface WafPolicy {
  id: string;
  name: string;
  resourceGroup: string;
  subscriptionId: string;
  policyMode: string;
  ruleSetType: string;
  ruleSetVersion: string;
  customRulesCount: number;
  managedRulesCount: number;
  associatedGateways: string[];
}

export interface BackendHealthStatus {
  backendPoolName: string;
  servers: BackendServerHealth[];
}

export interface BackendServerHealth {
  address: string;
  health: "Healthy" | "Unhealthy" | "Partial" | "Unknown";
  healthProbeLog?: string;
}

export interface GatewayMetrics {
  throughput: number[];
  totalRequests: number[];
  failedRequests: number[];
  healthyHostCount: number[];
  unhealthyHostCount: number[];
  responseStatus: Record<string, number[]>;
  currentConnections: number[];
  timestamps: string[];
}

export interface DiagnosticResult {
  category: string;
  status: "pass" | "fail" | "warn";
  message: string;
  details?: string;
  recommendation?: string;
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

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
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
  action: "ip_removed" | "ip_added" | "manual_failover" | "auto_failover" | "recovery";
  ip: string;
  appGateway: string;
  region: string;
  reason: string;
  triggeredBy: string;
}

export interface FailoverStatus {
  group: FailoverGroup;
  activeIps: string[];
  endpointHealth: {
    ip: string;
    appGateway: string;
    region: string;
    label: string;
    operationalState: string;
    healthy: boolean;
    inDns: boolean;
  }[];
  mode: "active-active" | "degraded" | "single";
  lastFailover?: FailoverHistoryEntry;
}
