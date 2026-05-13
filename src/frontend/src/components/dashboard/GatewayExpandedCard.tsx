import React, { useState, useEffect } from "react";
import {
  Pivot,
  PivotItem,
  DetailsList,
  DetailsListLayoutMode,
  SelectionMode,
  IColumn,
  Text,
  Spinner,
  Stack,
  MessageBar,
  MessageBarType,
  Toggle,
} from "@fluentui/react";
import { getGatewayDetail, getBackendHealth, checkDdosProtection, enableDdosProtection, disableDdosProtection, enableVnetEncryption, disableVnetEncryption } from "../../services/api";

interface Props {
  subscriptionId: string;
  resourceGroup: string;
  gatewayName: string;
}

export const GatewayExpandedCard: React.FC<Props> = ({ subscriptionId, resourceGroup, gatewayName }) => {
  const [detail, setDetail] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [ddos, setDdos] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(false);
  const [ddosToggling, setDdosToggling] = useState(false);
  const [encryptionToggling, setEncryptionToggling] = useState(false);

  useEffect(() => {
    setLoading(true);
    getGatewayDetail(subscriptionId, resourceGroup, gatewayName)
      .then(setDetail)
      .finally(() => setLoading(false));
    // Auto-load DDoS check
    checkDdosProtection(subscriptionId, resourceGroup, gatewayName).then(setDdos).catch(() => setDdos(null));
  }, [subscriptionId, resourceGroup, gatewayName]);

  const handleDdosToggle = async (enable: boolean) => {
    if (!confirm(enable
      ? `Enable DDoS Protection Standard on the VNet for "${gatewayName}"?\n\nNote: DDoS Standard costs ~$2,944/month per VNet.`
      : `Disable DDoS Protection Standard on the VNet for "${gatewayName}"?\n\nWarning: This removes advanced DDoS protection.`
    )) return;
    setDdosToggling(true);
    try {
      if (enable) {
        await enableDdosProtection(subscriptionId, resourceGroup, gatewayName);
      } else {
        await disableDdosProtection(subscriptionId, resourceGroup, gatewayName);
      }
      setDdos((prev: any) => prev ? { ...prev, enabled: enable } : prev);
    } catch {
      alert(`Failed to ${enable ? "enable" : "disable"} DDoS protection`);
    } finally {
      setDdosToggling(false);
    }
  };

  const handleEncryptionToggle = async (enable: boolean) => {
    if (!confirm(enable
      ? `Enable VNet encryption on the VNet for "${gatewayName}"?\n\nThis encrypts traffic between VMs within the VNet. Requires supported VM sizes (accelerated networking).`
      : `Disable VNet encryption on the VNet for "${gatewayName}"?\n\nWarning: This removes VNet-level encryption for inter-VM traffic.`
    )) return;
    setEncryptionToggling(true);
    try {
      if (enable) {
        await enableVnetEncryption(subscriptionId, resourceGroup, gatewayName);
      } else {
        await disableVnetEncryption(subscriptionId, resourceGroup, gatewayName);
      }
      setDdos((prev: any) => prev ? { ...prev, vnetEncryption: enable } : prev);
    } catch {
      alert(`Failed to ${enable ? "enable" : "disable"} VNet encryption`);
    } finally {
      setEncryptionToggling(false);
    }
  };

  const loadHealth = () => {
    setHealthLoading(true);
    getBackendHealth(subscriptionId, resourceGroup, gatewayName)
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setHealthLoading(false));
  };

  if (loading) return <Spinner label="Loading gateway details..." />;
  if (!detail) return <MessageBar messageBarType={MessageBarType.error}>Failed to load details</MessageBar>;

  const listenerCols: IColumn[] = [
    { key: "name", name: "Name", fieldName: "name", minWidth: 120, maxWidth: 180 },
    { key: "protocol", name: "Protocol", fieldName: "protocol", minWidth: 80, maxWidth: 100 },
    { key: "port", name: "Port", fieldName: "port", minWidth: 60, maxWidth: 80 },
    { key: "hostName", name: "Host Name", fieldName: "hostName", minWidth: 140 },
    { key: "ssl", name: "SSL Cert", fieldName: "sslCertificateName", minWidth: 120 },
    {
      key: "waf", name: "WAF Policy", minWidth: 120,
      onRender: (item: any) => item.firewallPolicyId ? (
        <span className="status-badge status-pass" title={item.firewallPolicyId}>
          {item.firewallPolicyId.split("/").pop()}
        </span>
      ) : (
        <Text variant="small" styles={{ root: { color: "#a19f9d" } }}>Inherits gateway</Text>
      ),
    },
  ];

  const ruleCols: IColumn[] = [
    { key: "name", name: "Name", fieldName: "name", minWidth: 120, maxWidth: 180 },
    { key: "ruleType", name: "Type", fieldName: "ruleType", minWidth: 80, maxWidth: 120 },
    { key: "priority", name: "Priority", fieldName: "priority", minWidth: 60, maxWidth: 80 },
    { key: "listenerName", name: "Listener", fieldName: "listenerName", minWidth: 120 },
    { key: "backendPoolName", name: "Backend Pool", fieldName: "backendPoolName", minWidth: 120 },
  ];

  const poolCols: IColumn[] = [
    { key: "name", name: "Name", fieldName: "name", minWidth: 120, maxWidth: 180 },
    {
      key: "addresses",
      name: "Addresses",
      minWidth: 200,
      onRender: (item: any) =>
        (item.addresses || []).map((a: any, i: number) => (
          <span key={i} style={{ marginRight: 8 }}>{a.fqdn || a.ipAddress}</span>
        )),
    },
  ];

  const probeCols: IColumn[] = [
    { key: "name", name: "Name", fieldName: "name", minWidth: 120, maxWidth: 160 },
    { key: "protocol", name: "Protocol", fieldName: "protocol", minWidth: 70, maxWidth: 90 },
    { key: "host", name: "Host", fieldName: "host", minWidth: 100, maxWidth: 140 },
    { key: "path", name: "Path", fieldName: "path", minWidth: 100, maxWidth: 160 },
    { key: "interval", name: "Interval(s)", fieldName: "interval", minWidth: 70, maxWidth: 90 },
    { key: "timeout", name: "Timeout(s)", fieldName: "timeout", minWidth: 70, maxWidth: 90 },
  ];

  return (
    <div style={{ marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
      <Pivot>
        <PivotItem headerText="Overview">
          <Stack horizontal wrap tokens={{ childrenGap: 12 }} styles={{ root: { marginTop: 12 } }}>
            {[
              { label: "Location", value: detail.location },
              { label: "SKU", value: `${detail.sku?.name} / ${detail.sku?.tier}` },
              { label: "Capacity", value: detail.sku?.capacity },
              { label: "Backend Pools", value: detail.backendPools?.length || 0 },
              { label: "Listeners", value: detail.listeners?.length || 0 },
              { label: "Routing Rules", value: detail.routingRules?.length || 0 },
              { label: "Health Probes", value: detail.healthProbes?.length || 0 },
            ].map((item) => (
              <div key={item.label} className="stat-card" style={{ minWidth: 140, padding: 12 }}>
                <div className="stat-value" style={{ fontSize: 20 }}>{item.value}</div>
                <div className="stat-label" style={{ fontSize: 11 }}>{item.label}</div>
              </div>
            ))}
          </Stack>
        </PivotItem>

        <PivotItem headerText="Listeners">
          <DetailsList
            items={detail.listeners || []}
            columns={listenerCols}
            layoutMode={DetailsListLayoutMode.justified}
            selectionMode={SelectionMode.none}
            styles={{ root: { marginTop: 8 } }}
          />
        </PivotItem>

        <PivotItem headerText="Routing Rules">
          <DetailsList
            items={detail.routingRules || []}
            columns={ruleCols}
            layoutMode={DetailsListLayoutMode.justified}
            selectionMode={SelectionMode.none}
            styles={{ root: { marginTop: 8 } }}
          />
        </PivotItem>

        <PivotItem headerText="Backend Pools + Health">
          <DetailsList
            items={detail.backendPools || []}
            columns={poolCols}
            layoutMode={DetailsListLayoutMode.justified}
            selectionMode={SelectionMode.none}
            styles={{ root: { marginTop: 8 } }}
          />
          <Stack styles={{ root: { marginTop: 12 } }}>
            {!health && !healthLoading && (
              <Text
                styles={{ root: { color: "#0078d4", cursor: "pointer", fontWeight: 600 } }}
                onClick={loadHealth}
              >
                Load Backend Health Status
              </Text>
            )}
            {healthLoading && <Spinner label="Checking backend health..." />}
            {health && (
              <div className="card" style={{ marginTop: 8 }}>
                <Text variant="medium" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block" } }}>
                  Backend Health
                </Text>
                {(health.backendAddressPools || []).map((pool: any, pi: number) => (
                  <div key={pi} style={{ marginBottom: 8 }}>
                    {(pool.backendHttpSettingsCollection || []).map((settings: any, si: number) => (
                      <div key={si}>
                        {(settings.servers || []).map((server: any, i: number) => (
                          <Stack key={i} horizontal verticalAlign="center" tokens={{ childrenGap: 8 }} styles={{ root: { marginBottom: 4 } }}>
                            <span className={`health-dot ${server.health === "Healthy" ? "healthy" : server.health === "Unhealthy" ? "unhealthy" : "unknown"}`} />
                            <Text variant="small">{server.address}</Text>
                            <span className={`status-badge ${server.health === "Healthy" ? "status-pass" : "status-fail"}`}>
                              {server.health}
                            </span>
                          </Stack>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Stack>
        </PivotItem>

        <PivotItem headerText="Health Probes">
          <DetailsList
            items={detail.healthProbes || []}
            columns={probeCols}
            layoutMode={DetailsListLayoutMode.justified}
            selectionMode={SelectionMode.none}
            styles={{ root: { marginTop: 8 } }}
          />
        </PivotItem>

        <PivotItem headerText="Security">
          <Stack tokens={{ childrenGap: 12 }} styles={{ root: { marginTop: 12 } }}>
            {/* DDoS Protection */}
            <div className="card" style={{ margin: 0, borderLeft: `4px solid ${ddos?.enabled ? "#107c10" : "#c19c00"}` }}>
              <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
                <Text variant="medium" styles={{ root: { fontWeight: 700 } }}>
                  DDoS Protection
                </Text>
                {ddos && (
                  <Toggle
                    checked={ddos.enabled}
                    onChange={(_, checked) => handleDdosToggle(!!checked)}
                    onText="Standard"
                    offText="Basic"
                    disabled={ddosToggling}
                    styles={{ root: { margin: 0 } }}
                  />
                )}
              </Stack>
              {!ddos ? (
                <Spinner size={1} label="Checking..." />
              ) : (
                <Stack tokens={{ childrenGap: 6 }}>
                  <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
                    <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Status:</Text>
                    <span className={`status-badge ${ddos.enabled ? "status-pass" : "status-warning"}`}>
                      {ddos.enabled ? "Standard (Protected)" : "Basic (Free, Limited)"}
                    </span>
                  </Stack>
                  {ddos.vnetName && (
                    <Stack horizontal tokens={{ childrenGap: 8 }}>
                      <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>VNet:</Text>
                      <Text>{ddos.vnetName}</Text>
                    </Stack>
                  )}
                  {ddos.planName && (
                    <Stack horizontal tokens={{ childrenGap: 8 }}>
                      <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>DDoS Plan:</Text>
                      <Text>{ddos.planName}</Text>
                    </Stack>
                  )}
                  {!ddos.enabled && (
                    <Text variant="small" styles={{ root: { color: "#c19c00", marginTop: 4 } }}>
                      ⚠️ Basic DDoS protection is free but limited. For production workloads, enable DDoS Protection Standard for advanced mitigation, attack metrics, and SLA-backed protection.
                    </Text>
                  )}
                </Stack>
              )}
            </div>

            {/* VNet Encryption */}
            <div className="card" style={{ margin: 0, borderLeft: `4px solid ${ddos?.vnetEncryption ? "#107c10" : "#c19c00"}` }}>
              <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
                <Text variant="medium" styles={{ root: { fontWeight: 700 } }}>
                  VNet Encryption
                </Text>
                {ddos && (
                  <Toggle
                    checked={ddos.vnetEncryption}
                    onChange={(_, checked) => handleEncryptionToggle(!!checked)}
                    onText="Enabled"
                    offText="Disabled"
                    disabled={encryptionToggling}
                    styles={{ root: { margin: 0 } }}
                  />
                )}
              </Stack>
              {!ddos ? (
                <Spinner size={1} label="Checking..." />
              ) : (
                <Stack tokens={{ childrenGap: 6 }} styles={{ root: { marginTop: 8 } }}>
                  <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
                    <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Status:</Text>
                    <span className={`status-badge ${ddos.vnetEncryption ? "status-pass" : "status-warning"}`}>
                      {ddos.vnetEncryption ? "Encrypted" : "Not Encrypted"}
                    </span>
                  </Stack>
                  {ddos.vnetEncryptionEnforcement && ddos.vnetEncryption && (
                    <Stack horizontal tokens={{ childrenGap: 8 }}>
                      <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Enforcement:</Text>
                      <Text>{ddos.vnetEncryptionEnforcement}</Text>
                    </Stack>
                  )}
                  {ddos.vnetName && (
                    <Stack horizontal tokens={{ childrenGap: 8 }}>
                      <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>VNet:</Text>
                      <Text>{ddos.vnetName}</Text>
                    </Stack>
                  )}
                  {!ddos.vnetEncryption && (
                    <Text variant="small" styles={{ root: { color: "#c19c00", marginTop: 4 } }}>
                      ⚠️ VNet encryption is not enabled. Traffic between resources in this VNet is not encrypted at the network layer. Enable it for defense-in-depth.
                    </Text>
                  )}
                </Stack>
              )}
            </div>
            {detail.webApplicationFirewallConfiguration ? (
              <div className="card" style={{ margin: 0 }}>
                <Text variant="medium" styles={{ root: { fontWeight: 700, display: "block", marginBottom: 12 } }}>
                  Inline WAF Configuration
                </Text>
                <Stack tokens={{ childrenGap: 6 }}>
                  <Stack horizontal tokens={{ childrenGap: 8 }}>
                    <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Status:</Text>
                    <span className={`status-badge ${detail.webApplicationFirewallConfiguration.enabled ? "status-pass" : "status-fail"}`}>
                      {detail.webApplicationFirewallConfiguration.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}>
                    <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Firewall Mode:</Text>
                    <span className={`status-badge ${detail.webApplicationFirewallConfiguration.firewallMode === "Prevention" ? "status-pass" : "status-warning"}`}>
                      {detail.webApplicationFirewallConfiguration.firewallMode}
                    </span>
                  </Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}>
                    <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Rule Set:</Text>
                    <Text>{detail.webApplicationFirewallConfiguration.ruleSetType} {detail.webApplicationFirewallConfiguration.ruleSetVersion}</Text>
                  </Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}>
                    <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Request Body Check:</Text>
                    <Text>{detail.webApplicationFirewallConfiguration.requestBodyCheck ? "Yes" : "No"}</Text>
                  </Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}>
                    <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Max Request Size:</Text>
                    <Text>{detail.webApplicationFirewallConfiguration.maxRequestBodySizeInKb || "N/A"} KB</Text>
                  </Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}>
                    <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>File Upload Limit:</Text>
                    <Text>{detail.webApplicationFirewallConfiguration.fileUploadLimitInMb || "N/A"} MB</Text>
                  </Stack>
                </Stack>
              </div>
            ) : detail.firewallPolicy ? (
              <div className="card" style={{ margin: 0 }}>
                <Text variant="medium" styles={{ root: { fontWeight: 700, display: "block", marginBottom: 8 } }}>
                  Linked WAF Policy
                </Text>
                <Text styles={{ root: { color: "#0078d4" } }}>{detail.firewallPolicy.id?.split("/").pop()}</Text>
                <Text variant="small" styles={{ root: { color: "#605e5c", display: "block", marginTop: 4 } }}>
                  Policy ID: {detail.firewallPolicy.id}
                </Text>
              </div>
            ) : (
              <div className="card" style={{ margin: 0 }}>
                <MessageBar messageBarType={MessageBarType.warning}>
                  No WAF configuration found. This gateway is not protected by a Web Application Firewall.
                  {detail.sku?.name?.includes("WAF") ? " Use AppDelivery Genie to enable WAF." : " Upgrade to WAF_v2 SKU to enable WAF protection."}
                </MessageBar>
              </div>
            )}

            {/* SSL/TLS Info */}
            {(detail.sslCertificates || []).length > 0 && (
              <div className="card" style={{ margin: 0 }}>
                <Text variant="medium" styles={{ root: { fontWeight: 700, display: "block", marginBottom: 8 } }}>
                  SSL Certificates ({detail.sslCertificates.length})
                </Text>
                {detail.sslCertificates.map((cert: any, i: number) => (
                  <Stack key={i} horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}
                    styles={{ root: { padding: "4px 0", borderBottom: "1px solid #f3f2f1" } }}>
                    <Text styles={{ root: { fontWeight: 600 } }}>{cert.name}</Text>
                    {cert.keyVaultSecretId ? (
                      <span className="status-badge status-pass">Key Vault</span>
                    ) : (
                      <span className="status-badge status-warning">Uploaded</span>
                    )}
                  </Stack>
                ))}
              </div>
            )}
          </Stack>
        </PivotItem>
      </Pivot>
    </div>
  );
};
