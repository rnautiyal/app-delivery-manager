import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Stack,
  Text,
  Spinner,
  MessageBar,
  MessageBarType,
  Pivot,
  PivotItem,
  DetailsList,
  DetailsListLayoutMode,
  SelectionMode,
  IColumn,
  PrimaryButton,
  DefaultButton,
  Dropdown,
  IDropdownOption,
  Toggle,
  Checkbox,
} from "@fluentui/react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { getGatewayDetail, getGatewayMetrics } from "../services/api";
import { GatewayMetrics } from "../types";

const METRIC_OPTIONS = [
  { key: "throughput", text: "Throughput (bytes/sec)", color: "#0078d4" },
  { key: "totalRequests", text: "Total Requests", color: "#00a4ef" },
  { key: "failedRequests", text: "Failed Requests", color: "#d13438" },
  { key: "healthyHostCount", text: "Healthy Hosts", color: "#107c10" },
  { key: "unhealthyHostCount", text: "Unhealthy Hosts", color: "#d83b01" },
  { key: "currentConnections", text: "Current Connections", color: "#8764b8" },
];

const TIME_OPTIONS: IDropdownOption[] = [
  { key: "PT1H", text: "Last 1 hour" },
  { key: "PT6H", text: "Last 6 hours" },
  { key: "PT24H", text: "Last 24 hours" },
];

export function GatewayDetailPage() {
  const { subscriptionId, resourceGroup, name } = useParams<{
    subscriptionId: string;
    resourceGroup: string;
    name: string;
  }>();
  const navigate = useNavigate();
  const [gateway, setGateway] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Metrics state
  const [metrics, setMetrics] = useState<GatewayMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState("PT1H");
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(
    new Set(["throughput", "totalRequests", "failedRequests"])
  );

  useEffect(() => {
    async function load() {
      if (!subscriptionId || !resourceGroup || !name) return;
      try {
        setLoading(true);
        const data = await getGatewayDetail(subscriptionId, resourceGroup, name);
        setGateway(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load gateway details");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [subscriptionId, resourceGroup, name]);

  async function loadMetrics() {
    if (!subscriptionId || !resourceGroup || !name) return;
    try {
      setMetricsLoading(true);
      setMetricsError(null);
      const resourceId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/applicationGateways/${name}`;
      const data = await getGatewayMetrics(resourceId, timeRange);
      setMetrics(data);
    } catch (err) {
      setMetricsError(err instanceof Error ? err.message : "Failed to load metrics");
    } finally {
      setMetricsLoading(false);
    }
  }

  function toggleMetric(key: string) {
    setSelectedMetrics(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  if (loading) return <Spinner label="Loading gateway details..." styles={{ root: { padding: 40 } }} />;
  if (error) return <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>;
  if (!gateway) return null;

  const parsed = gateway._parsed;

  const chartData = metrics
    ? metrics.timestamps.map((ts: string, i: number) => ({
        time: new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        throughput: metrics.throughput[i] || 0,
        totalRequests: metrics.totalRequests[i] || 0,
        failedRequests: metrics.failedRequests[i] || 0,
        healthyHostCount: metrics.healthyHostCount[i] || 0,
        unhealthyHostCount: metrics.unhealthyHostCount[i] || 0,
        currentConnections: metrics.currentConnections[i] || 0,
      }))
    : [];

  const backendColumns: IColumn[] = [
    { key: "name", name: "Name", fieldName: "name", minWidth: 150 },
    { key: "addresses", name: "Addresses", minWidth: 300,
      onRender: (item: any) => item.addresses.map((a: any) => a.fqdn || a.ipAddress).join(", ") || "None" },
  ];

  const listenerColumns: IColumn[] = [
    { key: "name", name: "Name", fieldName: "name", minWidth: 150 },
    { key: "protocol", name: "Protocol", fieldName: "protocol", minWidth: 80 },
    { key: "port", name: "Port", fieldName: "port", minWidth: 60 },
    { key: "hostName", name: "Host Name", fieldName: "hostName", minWidth: 200 },
    { key: "ssl", name: "SSL Certificate", fieldName: "sslCertificateName", minWidth: 150 },
  ];

  const ruleColumns: IColumn[] = [
    { key: "name", name: "Name", fieldName: "name", minWidth: 150 },
    { key: "ruleType", name: "Type", fieldName: "ruleType", minWidth: 80 },
    { key: "priority", name: "Priority", fieldName: "priority", minWidth: 60 },
    { key: "listenerName", name: "Listener", fieldName: "listenerName", minWidth: 150 },
    { key: "backendPoolName", name: "Backend Pool", fieldName: "backendPoolName", minWidth: 150 },
    { key: "httpSettingName", name: "HTTP Setting", fieldName: "httpSettingName", minWidth: 150 },
  ];

  const probeColumns: IColumn[] = [
    { key: "name", name: "Name", fieldName: "name", minWidth: 150 },
    { key: "protocol", name: "Protocol", fieldName: "protocol", minWidth: 80 },
    { key: "host", name: "Host", fieldName: "host", minWidth: 150 },
    { key: "path", name: "Path", fieldName: "path", minWidth: 100 },
    { key: "interval", name: "Interval (s)", fieldName: "interval", minWidth: 80 },
    { key: "timeout", name: "Timeout (s)", fieldName: "timeout", minWidth: 80 },
  ];

  // Info cards
  const wafEnabled = gateway.webApplicationFirewallConfiguration?.enabled || gateway.firewallPolicy;
  const sslPolicy = gateway.sslPolicy;
  const autoscale = gateway.autoscaleConfiguration;

  return (
    <div className="page-container">
      {/* Header */}
      <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
        <DefaultButton iconProps={{ iconName: "Back" }} onClick={() => navigate("/gateways")} text="Back"
          styles={{ root: { borderRadius: 6 } }} />
        <span style={{ fontSize: 24 }}>{"\uD83C\uDF10"}</span>
        <Text variant="xxLarge" styles={{ root: { fontWeight: 600 } }}>{name}</Text>
        <span className={`status-badge status-${gateway.operationalState?.toLowerCase()}`}>
          {gateway.operationalState}
        </span>
      </Stack>

      {/* Info Cards */}
      <Stack horizontal wrap tokens={{ childrenGap: 12 }} styles={{ root: { marginTop: 16, marginBottom: 20 } }}>
        {[
          { label: "Resource Group", value: resourceGroup, icon: "\uD83D\uDCC1" },
          { label: "Location", value: gateway.location, icon: "\uD83D\uDCCD" },
          { label: "SKU", value: `${gateway.sku?.name} / ${gateway.sku?.tier}`, icon: "\u2699\uFE0F" },
          { label: "Capacity", value: autoscale ? `Auto (${autoscale.minCapacity}-${autoscale.maxCapacity})` : `${gateway.sku?.capacity} units`, icon: "\uD83D\uDCC8" },
          { label: "WAF", value: wafEnabled ? "Enabled" : "Disabled", icon: "\uD83D\uDEE1\uFE0F",
            color: wafEnabled ? "#107c10" : "#d13438" },
          { label: "SSL Policy", value: sslPolicy?.policyName || sslPolicy?.policyType || "Default", icon: "\uD83D\uDD12" },
          { label: "Backends", value: `${parsed.backendPools.length} pools`, icon: "\uD83D\uDDA5\uFE0F" },
          { label: "Listeners", value: `${parsed.listeners.length}`, icon: "\uD83D\uDCE1" },
        ].map((card) => (
          <div key={card.label} style={{
            background: "white", border: "1px solid #edebe9", borderRadius: 8,
            padding: "10px 16px", minWidth: 130,
          }}>
            <Text styles={{ root: { fontSize: 11, color: "#a19f9d" } }}>{card.icon} {card.label}</Text>
            <Text styles={{ root: { fontSize: 14, fontWeight: 600, color: (card as any).color || "#323130" } }}>
              {card.value}
            </Text>
          </div>
        ))}
      </Stack>

      {/* Action buttons */}
      <Stack horizontal tokens={{ childrenGap: 8 }} styles={{ root: { marginBottom: 20 } }}>
        <PrimaryButton text="Diagnose" iconProps={{ iconName: "Medical" }}
          onClick={() => navigate(`/diagnostics/${subscriptionId}/${resourceGroup}/${name}`)}
          styles={{ root: { borderRadius: 6 } }} />
        <DefaultButton text="Security Scan" iconProps={{ iconName: "Shield" }}
          onClick={() => navigate("/security-scan")}
          styles={{ root: { borderRadius: 6 } }} />
        <DefaultButton text="Ask AppDelivery Genie" iconProps={{ iconName: "Chat" }}
          onClick={() => navigate("/")}
          styles={{ root: { borderRadius: 6 } }} />
      </Stack>

      <Pivot styles={{ root: { marginBottom: 8 } }}>
        {/* Metrics Tab */}
        <PivotItem headerText={"\uD83D\uDCCA Metrics"}>
          <div style={{ padding: "16px 0" }}>
            <Stack horizontal verticalAlign="end" tokens={{ childrenGap: 12 }}>
              <Dropdown
                label="Time Range"
                selectedKey={timeRange}
                options={TIME_OPTIONS}
                onChange={(_, opt) => opt && setTimeRange(opt.key as string)}
                styles={{ root: { width: 180 } }}
              />
              <PrimaryButton text={metricsLoading ? "Loading..." : "Load Metrics"}
                onClick={loadMetrics} disabled={metricsLoading}
                styles={{ root: { borderRadius: 6 } }} />
            </Stack>

            {/* Metric selector */}
            <Stack horizontal wrap tokens={{ childrenGap: 16 }} styles={{ root: { marginTop: 16 } }}>
              {METRIC_OPTIONS.map(m => (
                <Checkbox
                  key={m.key}
                  label={m.text}
                  checked={selectedMetrics.has(m.key)}
                  onChange={() => toggleMetric(m.key)}
                  styles={{
                    checkbox: { borderColor: m.color },
                    checkmark: { color: m.color },
                    label: { fontWeight: selectedMetrics.has(m.key) ? 600 : 400 },
                  }}
                />
              ))}
            </Stack>

            {metricsError && (
              <MessageBar messageBarType={MessageBarType.error} styles={{ root: { marginTop: 12 } }}>
                {metricsError}
              </MessageBar>
            )}

            {metricsLoading && <Spinner label="Loading metrics..." styles={{ root: { marginTop: 20 } }} />}

            {metrics && chartData.length > 0 && (
              <Stack tokens={{ childrenGap: 20 }} styles={{ root: { marginTop: 20 } }}>
                {METRIC_OPTIONS.filter(m => selectedMetrics.has(m.key)).map(m => (
                  <div key={m.key} style={{
                    background: "white", border: "1px solid #edebe9", borderRadius: 8, padding: 16,
                  }}>
                    <Text styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block" } }}>
                      {m.text}
                    </Text>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Area type="monotone" dataKey={m.key} stroke={m.color} fill={m.color} fillOpacity={0.1} strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </Stack>
            )}

            {!metrics && !metricsLoading && (
              <Stack horizontalAlign="center" styles={{ root: { padding: 40 } }}>
                <Text styles={{ root: { color: "#605e5c" } }}>
                  Click "Load Metrics" to view gateway performance data
                </Text>
              </Stack>
            )}
          </div>
        </PivotItem>

        {/* Config tabs */}
        <PivotItem headerText={`Backend Pools (${parsed.backendPools.length})`}>
          <DetailsList items={parsed.backendPools} columns={backendColumns}
            layoutMode={DetailsListLayoutMode.justified} selectionMode={SelectionMode.none} />
        </PivotItem>
        <PivotItem headerText={`Listeners (${parsed.listeners.length})`}>
          <DetailsList items={parsed.listeners} columns={listenerColumns}
            layoutMode={DetailsListLayoutMode.justified} selectionMode={SelectionMode.none} />
        </PivotItem>
        <PivotItem headerText={`Routing Rules (${parsed.routingRules.length})`}>
          <DetailsList items={parsed.routingRules} columns={ruleColumns}
            layoutMode={DetailsListLayoutMode.justified} selectionMode={SelectionMode.none} />
        </PivotItem>
        <PivotItem headerText={`Health Probes (${parsed.healthProbes.length})`}>
          <DetailsList items={parsed.healthProbes} columns={probeColumns}
            layoutMode={DetailsListLayoutMode.justified} selectionMode={SelectionMode.none} />
        </PivotItem>
        <PivotItem headerText={`HTTP Settings (${parsed.httpSettings.length})`}>
          <DetailsList
            items={parsed.httpSettings}
            columns={[
              { key: "name", name: "Name", fieldName: "name", minWidth: 150 },
              { key: "port", name: "Port", fieldName: "port", minWidth: 60 },
              { key: "protocol", name: "Protocol", fieldName: "protocol", minWidth: 80 },
              { key: "cookieBasedAffinity", name: "Affinity", fieldName: "cookieBasedAffinity", minWidth: 100 },
              { key: "requestTimeout", name: "Timeout (s)", fieldName: "requestTimeout", minWidth: 80 },
            ]}
            layoutMode={DetailsListLayoutMode.justified} selectionMode={SelectionMode.none}
          />
        </PivotItem>

        {/* SSL/TLS Info */}
        <PivotItem headerText={"\uD83D\uDD12 SSL/TLS"}>
          <div style={{ padding: "16px 0" }}>
            <div style={{ background: "white", border: "1px solid #edebe9", borderRadius: 8, padding: 20 }}>
              <Text styles={{ root: { fontWeight: 600, fontSize: 16, marginBottom: 16, display: "block" } }}>
                SSL Policy Configuration
              </Text>
              <Stack tokens={{ childrenGap: 8 }}>
                <Text>Policy Type: <strong>{sslPolicy?.policyType || "Default (Azure managed)"}</strong></Text>
                <Text>Policy Name: <strong>{sslPolicy?.policyName || "Not set"}</strong></Text>
                <Text>Min TLS Version: <strong style={{
                  color: sslPolicy?.minProtocolVersion === "TLSv1_0" || sslPolicy?.minProtocolVersion === "TLSv1_1"
                    ? "#d13438" : "#107c10",
                }}>
                  {sslPolicy?.minProtocolVersion || "Default"}
                </strong></Text>
              </Stack>

              {sslPolicy?.cipherSuites && sslPolicy.cipherSuites.length > 0 && (
                <Stack styles={{ root: { marginTop: 16 } }}>
                  <Text styles={{ root: { fontWeight: 600, marginBottom: 8 } }}>Cipher Suites ({sslPolicy.cipherSuites.length})</Text>
                  {sslPolicy.cipherSuites.map((cipher: string, idx: number) => {
                    const isWeak = cipher.includes("_RSA_") && cipher.includes("_CBC_");
                    return (
                      <Stack key={idx} horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}
                        styles={{ root: { padding: "4px 0" } }}>
                        <span style={{ fontSize: 12 }}>{isWeak ? "\u274C" : "\u2705"}</span>
                        <Text styles={{ root: {
                          fontSize: 13, fontFamily: "monospace",
                          color: isWeak ? "#d13438" : "#323130",
                        } }}>
                          {cipher}
                        </Text>
                        {isWeak && (
                          <span style={{ fontSize: 10, color: "#d13438", fontWeight: 600 }}>WEAK</span>
                        )}
                      </Stack>
                    );
                  })}
                </Stack>
              )}
            </div>

            {/* SSL Certificates */}
            {gateway.sslCertificates && gateway.sslCertificates.length > 0 && (
              <div style={{ background: "white", border: "1px solid #edebe9", borderRadius: 8, padding: 20, marginTop: 12 }}>
                <Text styles={{ root: { fontWeight: 600, fontSize: 16, marginBottom: 12, display: "block" } }}>
                  SSL Certificates ({gateway.sslCertificates.length})
                </Text>
                {gateway.sslCertificates.map((cert: any, idx: number) => (
                  <Stack key={idx} horizontal verticalAlign="center" tokens={{ childrenGap: 8, padding: "6px 0" }}
                    styles={{ root: { borderBottom: "1px solid #f3f2f1" } }}>
                    <span style={{ fontSize: 16 }}>{"\uD83D\uDD10"}</span>
                    <Text styles={{ root: { fontWeight: 500 } }}>{cert.name}</Text>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
                      background: cert.keyVaultSecretId ? "#dff6dd" : "#fff4ce",
                      color: cert.keyVaultSecretId ? "#107c10" : "#8a6d00",
                    }}>
                      {cert.keyVaultSecretId ? "Key Vault" : "Manual Upload"}
                    </span>
                  </Stack>
                ))}
              </div>
            )}
          </div>
        </PivotItem>
      </Pivot>
    </div>
  );
}
