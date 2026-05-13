import React, { useState, useEffect } from "react";
import { Text, Stack, Spinner, PrimaryButton, DefaultButton, Dialog, DialogType, DialogFooter, TextField, Dropdown, MessageBar, MessageBarType, Toggle, Panel, PanelType } from "@fluentui/react";
import { TrafficManagerProfile } from "../../types";
import { getTrafficManagerProfiles, getTrafficManagerProfile, addTrafficManagerFailoverEndpoint, checkAndFailover, getTmMonitorStatus, addTmMonitorProfile, removeTmMonitorProfile } from "../../services/api";

interface Props {
  selectedSubscription: string;
}

const statusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case "online": return "#107c10";
    case "enabled": return "#107c10";
    case "degraded": return "#ffaa00";
    case "disabled": case "inactive": case "stopped": return "#d13438";
    default: return "#a19f9d";
  }
};

const routingBadge = (method: string) => {
  const colors: Record<string, string> = {
    Performance: "#0078d4",
    Priority: "#8764b8",
    Weighted: "#107c10",
    Geographic: "#ca5010",
    MultiValue: "#005b70",
    Subnet: "#4f6bed",
  };
  return colors[method] || "#605e5c";
};

export const TrafficManagerSection: React.FC<Props> = ({ selectedSubscription }) => {
  const [profiles, setProfiles] = useState<TrafficManagerProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [failoverDialog, setFailoverDialog] = useState(false);
  const [failoverProfile, setFailoverProfile] = useState<TrafficManagerProfile | null>(null);
  const [failoverName, setFailoverName] = useState("");
  const [failoverTarget, setFailoverTarget] = useState("");
  const [failoverType, setFailoverType] = useState("ExternalEndpoints");
  const [failoverPriority, setFailoverPriority] = useState("999");
  const [failoverLocation, setFailoverLocation] = useState("eastus");
  const [actionLoading, setActionLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [failoverResult, setFailoverResult] = useState<any>(null);
  const [monitoredProfiles, setMonitoredProfiles] = useState<Set<string>>(new Set());
  const [configPanel, setConfigPanel] = useState<{ open: boolean; profileName: string; loading: boolean; data: any }>({
    open: false, profileName: "", loading: false, data: null,
  });

  async function handleViewConfig(profile: TrafficManagerProfile) {
    setConfigPanel({ open: true, profileName: profile.name, loading: true, data: null });
    try {
      const full = await getTrafficManagerProfile(profile.subscriptionId, profile.resourceGroup, profile.name);
      setConfigPanel({ open: true, profileName: profile.name, loading: false, data: full });
    } catch {
      setConfigPanel((prev) => ({ ...prev, loading: false, data: { error: "Failed to load configuration" } }));
    }
  }

  function loadProfiles() {
    if (!selectedSubscription) return;
    setLoading(true);
    getTrafficManagerProfiles(selectedSubscription)
      .then(setProfiles)
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadProfiles();
    // Load monitor status to know which profiles have auto-failover enabled
    getTmMonitorStatus()
      .then((status) => {
        const keys = new Set<string>(
          (status.profiles || []).map((p: any) => `${p.subscriptionId}/${p.resourceGroup}/${p.profileName}`)
        );
        setMonitoredProfiles(keys);
      })
      .catch(() => {});
  }, [selectedSubscription]);

  if (loading) return <Spinner label="Loading Traffic Manager profiles..." />;

  async function handleAddFailoverEndpoint() {
    if (!failoverProfile || !failoverName || !failoverTarget) return;
    if (failoverType !== "ExternalEndpoints" && !failoverTarget.startsWith("/")) {
      setErrorMsg("Azure/Nested endpoints require a full ARM resource ID starting with /subscriptions/... — use External Endpoint for hostnames.");
      return;
    }
    try {
      setActionLoading(true);
      const epPayload: any = { name: failoverName, type: failoverType, priority: parseInt(failoverPriority), endpointLocation: failoverLocation };
      if (failoverType === "ExternalEndpoints") {
        epPayload.target = failoverTarget;
      } else {
        epPayload.targetResourceId = failoverTarget;
      }
      await addTrafficManagerFailoverEndpoint(
        failoverProfile.subscriptionId, failoverProfile.resourceGroup, failoverProfile.name,
        epPayload
      );
      setSuccessMsg(`Failover endpoint "${failoverName}" added (disabled until needed)`);
      setFailoverDialog(false);
      setFailoverName("");
      setFailoverTarget("");
      loadProfiles();
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || "Failed to add failover endpoint");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCheckAndFailover(profile: TrafficManagerProfile) {
    try {
      setActionLoading(true);
      const result = await checkAndFailover(profile.subscriptionId, profile.resourceGroup, profile.name);
      setFailoverResult(result);
      if (result.action === "failover_executed") {
        setSuccessMsg(`Failover executed: enabled ${result.enabledEndpoints.join(", ")}`);
        loadProfiles();
      } else if (result.action === "none") {
        setSuccessMsg("All endpoints healthy — no failover needed.");
      }
    } catch {
      setErrorMsg("Failover check failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleAutoFailover(profile: TrafficManagerProfile, enabled: boolean) {
    const key = `${profile.subscriptionId}/${profile.resourceGroup}/${profile.name}`;
    try {
      if (enabled) {
        await addTmMonitorProfile(profile.subscriptionId, profile.resourceGroup, profile.name);
        setMonitoredProfiles(prev => new Set(prev).add(key));
        setSuccessMsg(`Auto-failover enabled for "${profile.name}" — checking every 60s`);
      } else {
        await removeTmMonitorProfile(profile.subscriptionId, profile.resourceGroup, profile.name);
        setMonitoredProfiles(prev => { const s = new Set(prev); s.delete(key); return s; });
        setSuccessMsg(`Auto-failover disabled for "${profile.name}"`);
      }
    } catch {
      setErrorMsg(`Failed to ${enabled ? "enable" : "disable"} auto-failover`);
    }
  }

  if (profiles.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#a19f9d" }}>
        <Text variant="medium">No Traffic Manager profiles found in this subscription</Text>
      </div>
    );
  }

  return (
    <>
    {successMsg && (
      <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSuccessMsg(null)} styles={{ root: { marginBottom: 8 } }}>
        {successMsg}
      </MessageBar>
    )}
    {errorMsg && (
      <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setErrorMsg(null)} styles={{ root: { marginBottom: 8 } }}>
        {errorMsg}
      </MessageBar>
    )}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: 16 }}>
      {profiles.map((profile) => (
        <div
          key={profile.id}
          onClick={() => setExpanded(expanded === profile.name ? null : profile.name)}
          style={{
            background: "white",
            borderRadius: 12,
            padding: 20,
            border: "1px solid #edebe9",
            cursor: "pointer",
            transition: "box-shadow 0.2s",
            boxShadow: expanded === profile.name ? "0 4px 16px rgba(0,0,0,0.12)" : "0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          {/* Header */}
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "linear-gradient(135deg, #0078d4, #50e6ff)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontWeight: 700, fontSize: 18,
            }}>
              🌍
            </div>
            <Stack grow>
              <Text variant="mediumPlus" styles={{ root: { fontWeight: 600 } }}>{profile.name}</Text>
              <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{profile.resourceGroup}</Text>
            </Stack>
            <span style={{
              background: statusColor(profile.monitorConfig.profileMonitorStatus),
              color: "white",
              padding: "2px 10px",
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 600,
            }}>
              {profile.monitorConfig.profileMonitorStatus}
            </span>
          </Stack>

          {/* Summary row */}
          <Stack horizontal tokens={{ childrenGap: 16 }} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "#605e5c" }}>
              <span style={{
                background: routingBadge(profile.trafficRoutingMethod),
                color: "white",
                padding: "2px 8px",
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 600,
              }}>
                {profile.trafficRoutingMethod}
              </span>
            </div>
            <Text variant="small" styles={{ root: { color: "#605e5c" } }}>
              {profile.endpoints.length} endpoint{profile.endpoints.length !== 1 ? "s" : ""}
            </Text>
            <Text variant="small" styles={{ root: { color: "#0078d4", fontFamily: "monospace" } }}>
              {profile.dnsConfig.fqdn}
            </Text>
          </Stack>

          {/* Expanded details */}
          {expanded === profile.name && (
            <div style={{ marginTop: 16, borderTop: "1px solid #edebe9", paddingTop: 16 }}>
              {/* DNS Config */}
              <Text variant="small" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block" } }}>
                DNS Configuration
              </Text>
              <Stack horizontal tokens={{ childrenGap: 24 }} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12 }}><span style={{ color: "#a19f9d" }}>TTL:</span> {profile.dnsConfig.ttl}s</div>
              </Stack>

              {/* Monitor Config */}
              <Text variant="small" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block" } }}>
                Health Monitoring
              </Text>
              <Stack horizontal tokens={{ childrenGap: 16 }} style={{ marginBottom: 16, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12 }}><span style={{ color: "#a19f9d" }}>Protocol:</span> {profile.monitorConfig.protocol}</div>
                <div style={{ fontSize: 12 }}><span style={{ color: "#a19f9d" }}>Port:</span> {profile.monitorConfig.port}</div>
                <div style={{ fontSize: 12 }}><span style={{ color: "#a19f9d" }}>Path:</span> {profile.monitorConfig.path || "/"}</div>
                <div style={{ fontSize: 12 }}><span style={{ color: "#a19f9d" }}>Interval:</span> {profile.monitorConfig.intervalInSeconds}s</div>
                <div style={{ fontSize: 12 }}><span style={{ color: "#a19f9d" }}>Timeout:</span> {profile.monitorConfig.timeoutInSeconds}s</div>
              </Stack>

              {/* Endpoints */}
              <Stack horizontal horizontalAlign="space-between" verticalAlign="center" style={{ marginBottom: 8 }}>
                <Text variant="small" styles={{ root: { fontWeight: 600 } }}>
                  Endpoints ({profile.endpoints.length})
                </Text>
                <Stack horizontal tokens={{ childrenGap: 6 }}>
                  <PrimaryButton
                    text="Check & Failover"
                    iconProps={{ iconName: "Heart" }}
                    onClick={(e) => { e.stopPropagation(); handleCheckAndFailover(profile); }}
                    disabled={actionLoading}
                    styles={{ root: { height: 26, fontSize: 11, minWidth: 0, padding: "0 8px" } }}
                  />
                  <DefaultButton
                    text="Add Failover Endpoint"
                    iconProps={{ iconName: "Add" }}
                    onClick={(e) => { e.stopPropagation(); setFailoverProfile(profile); setFailoverDialog(true); }}
                    disabled={actionLoading}
                    styles={{ root: { height: 26, fontSize: 11, minWidth: 0, padding: "0 8px" } }}
                  />
                  <DefaultButton
                    text="View Config"
                    iconProps={{ iconName: "Code" }}
                    onClick={(e) => { e.stopPropagation(); handleViewConfig(profile); }}
                    styles={{ root: { height: 26, fontSize: 11, minWidth: 0, padding: "0 8px" } }}
                  />
                </Stack>
              </Stack>

              {/* Auto-failover toggle */}
              <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }} style={{ marginBottom: 12, background: "#f3f2f1", borderRadius: 8, padding: "6px 12px" }}>
                <Toggle
                  checked={monitoredProfiles.has(`${profile.subscriptionId}/${profile.resourceGroup}/${profile.name}`)}
                  onChange={(_, checked) => { handleToggleAutoFailover(profile, !!checked); }}
                  onText="Auto-failover ON"
                  offText="Auto-failover OFF"
                  styles={{ root: { margin: 0 }, label: { fontSize: 12, fontWeight: 600 } }}
                />
                <Text variant="small" styles={{ root: { color: "#605e5c" } }}>
                  {monitoredProfiles.has(`${profile.subscriptionId}/${profile.resourceGroup}/${profile.name}`)
                    ? "Checking every 60s — failover endpoints auto-enabled when primary fails"
                    : "Enable to automatically failover when an endpoint goes down"}
                </Text>
              </Stack>
              {profile.endpoints.length === 0 ? (
                <Text variant="small" styles={{ root: { color: "#a19f9d", fontStyle: "italic" } }}>
                  No endpoints configured
                </Text>
              ) : (
                <Stack tokens={{ childrenGap: 6 }}>
                  {profile.endpoints.map((ep) => (
                    <Stack
                      key={ep.id}
                      horizontal
                      verticalAlign="center"
                      tokens={{ childrenGap: 10 }}
                      style={{
                        background: "#faf9f8",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontSize: 12,
                      }}
                    >
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: ep.endpointMonitorStatus === "Online" ? "#107c10" : "#d13438",
                        display: "inline-block",
                      }} />
                      <Text variant="small" styles={{ root: { fontWeight: 600, minWidth: 120 } }}>{ep.name}</Text>
                      <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{ep.type}</Text>
                      <Text variant="small" styles={{ root: { fontFamily: "monospace", color: "#0078d4" } }}>
                        {ep.target || ep.targetResourceId?.split("/").pop() || "—"}
                      </Text>
                      {ep.weight != null && (
                        <Text variant="small" styles={{ root: { color: "#a19f9d" } }}>w:{ep.weight}</Text>
                      )}
                      {ep.priority != null && (
                        <Text variant="small" styles={{ root: { color: "#a19f9d" } }}>p:{ep.priority}</Text>
                      )}
                      <span style={{
                        marginLeft: "auto",
                        color: ep.endpointStatus === "Enabled" ? "#107c10" : "#d13438",
                        fontSize: 11,
                        fontWeight: 600,
                      }}>
                        {ep.endpointMonitorStatus}
                      </span>
                    </Stack>
                  ))}
                </Stack>
              )}
            </div>
          )}
        </div>
      ))}
    </div>

    {/* Add Failover Endpoint Dialog */}
    <Dialog
      hidden={!failoverDialog}
      onDismiss={() => setFailoverDialog(false)}
      dialogContentProps={{
        type: DialogType.normal,
        title: "Add Failover Endpoint",
        subText: "This endpoint will be created in Disabled state and automatically enabled when existing endpoints become faulty.",
      }}
      minWidth={480}
    >
      <Stack tokens={{ childrenGap: 12 }}>
        <TextField label="Endpoint Name" value={failoverName} onChange={(_, v) => setFailoverName(v || "")} required placeholder="e.g., appgw-failover-1" />
        <TextField
          label={failoverType === "ExternalEndpoints" ? "Target (FQDN)" : "Target Resource ID"}
          value={failoverTarget}
          onChange={(_, v) => setFailoverTarget(v || "")}
          required
          placeholder={failoverType === "ExternalEndpoints"
            ? "e.g., mybackup-appgw.eastus.cloudapp.azure.com"
            : "e.g., /subscriptions/.../publicIPAddresses/myip"}
          description={failoverType !== "ExternalEndpoints" ? "Full ARM resource ID of the Azure resource" : undefined}
        />
        <Dropdown
          label="Endpoint Type"
          selectedKey={failoverType}
          options={[
            { key: "ExternalEndpoints", text: "External Endpoint" },
            { key: "AzureEndpoints", text: "Azure Endpoint" },
            { key: "NestedEndpoints", text: "Nested Endpoint" },
          ]}
          onChange={(_, opt) => setFailoverType(opt?.key as string)}
        />
        <Dropdown
          label="Location"
          selectedKey={failoverLocation}
          options={[
            { key: "eastus", text: "East US" },
            { key: "westus2", text: "West US 2" },
            { key: "centralus", text: "Central US" },
            { key: "northeurope", text: "North Europe" },
            { key: "westeurope", text: "West Europe" },
            { key: "southeastasia", text: "Southeast Asia" },
            { key: "canadacentral", text: "Canada Central" },
            { key: "canadaeast", text: "Canada East" },
            { key: "uksouth", text: "UK South" },
            { key: "australiaeast", text: "Australia East" },
          ]}
          onChange={(_, opt) => setFailoverLocation(opt?.key as string)}
          placeholder="Select region"
          required={failoverType !== "AzureEndpoints"}
        />
        <TextField label="Priority" value={failoverPriority} onChange={(_, v) => setFailoverPriority(v || "999")} type="number" />
      </Stack>
      <DialogFooter>
        <PrimaryButton text="Add Endpoint" onClick={handleAddFailoverEndpoint} disabled={actionLoading || !failoverName || !failoverTarget} />
        <DefaultButton text="Cancel" onClick={() => setFailoverDialog(false)} />
      </DialogFooter>
    </Dialog>

    {/* Configuration Template Panel */}
    <Panel
      isOpen={configPanel.open}
      onDismiss={() => setConfigPanel({ open: false, profileName: "", loading: false, data: null })}
      headerText={`Configuration — ${configPanel.profileName}`}
      type={PanelType.large}
    >
      {configPanel.loading ? (
        <Spinner label="Loading configuration..." styles={{ root: { marginTop: 20 } }} />
      ) : configPanel.data ? (
        <Stack tokens={{ childrenGap: 16 }} styles={{ root: { padding: "16px 0" } }}>
          {/* Summary cards */}
          <Stack horizontal tokens={{ childrenGap: 12 }} wrap>
            <div style={{ background: "#f3f2f1", borderRadius: 8, padding: "10px 16px", minWidth: 120 }}>
              <Text variant="small" styles={{ root: { color: "#605e5c", display: "block" } }}>Routing Method</Text>
              <Text styles={{ root: { fontWeight: 700, color: "#0078d4" } }}>{configPanel.data.trafficRoutingMethod}</Text>
            </div>
            <div style={{ background: "#f3f2f1", borderRadius: 8, padding: "10px 16px", minWidth: 120 }}>
              <Text variant="small" styles={{ root: { color: "#605e5c", display: "block" } }}>Status</Text>
              <Text styles={{ root: { fontWeight: 700, color: configPanel.data.profileStatus === "Enabled" ? "#107c10" : "#d13438" } }}>
                {configPanel.data.profileStatus || configPanel.data.monitorConfig?.profileMonitorStatus || "—"}
              </Text>
            </div>
            <div style={{ background: "#f3f2f1", borderRadius: 8, padding: "10px 16px", minWidth: 120 }}>
              <Text variant="small" styles={{ root: { color: "#605e5c", display: "block" } }}>Endpoints</Text>
              <Text styles={{ root: { fontWeight: 700 } }}>{configPanel.data.endpoints?.length ?? 0}</Text>
            </div>
            <div style={{ background: "#f3f2f1", borderRadius: 8, padding: "10px 16px", minWidth: 180 }}>
              <Text variant="small" styles={{ root: { color: "#605e5c", display: "block" } }}>FQDN</Text>
              <Text styles={{ root: { fontWeight: 600, fontFamily: "monospace", fontSize: 12, color: "#0078d4" } }}>
                {configPanel.data.dnsConfig?.fqdn || "—"}
              </Text>
            </div>
            <div style={{ background: "#f3f2f1", borderRadius: 8, padding: "10px 16px", minWidth: 100 }}>
              <Text variant="small" styles={{ root: { color: "#605e5c", display: "block" } }}>TTL</Text>
              <Text styles={{ root: { fontWeight: 700 } }}>{configPanel.data.dnsConfig?.ttl ?? "—"}s</Text>
            </div>
          </Stack>

          {/* Monitor Configuration */}
          {configPanel.data.monitorConfig && (
            <div style={{ background: "#faf9f8", borderRadius: 8, padding: 16, border: "1px solid #edebe9" }}>
              <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block" } }}>
                Health Monitor Configuration
              </Text>
              <Stack horizontal tokens={{ childrenGap: 24 }} wrap>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Protocol:</Text> <Text styles={{ root: { fontWeight: 600 } }}>{configPanel.data.monitorConfig.protocol}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Port:</Text> <Text styles={{ root: { fontWeight: 600 } }}>{configPanel.data.monitorConfig.port}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Path:</Text> <Text styles={{ root: { fontWeight: 600 } }}>{configPanel.data.monitorConfig.path || "/"}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Interval:</Text> <Text styles={{ root: { fontWeight: 600 } }}>{configPanel.data.monitorConfig.intervalInSeconds}s</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Timeout:</Text> <Text styles={{ root: { fontWeight: 600 } }}>{configPanel.data.monitorConfig.timeoutInSeconds}s</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Tolerated Failures:</Text> <Text styles={{ root: { fontWeight: 600 } }}>{configPanel.data.monitorConfig.toleratedNumberOfFailures ?? "—"}</Text></div>
              </Stack>
            </div>
          )}

          {/* Endpoints Table */}
          {configPanel.data.endpoints && configPanel.data.endpoints.length > 0 && (
            <div style={{ background: "#faf9f8", borderRadius: 8, padding: 16, border: "1px solid #edebe9" }}>
              <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, marginBottom: 12, display: "block" } }}>
                Endpoints ({configPanel.data.endpoints.length})
              </Text>
              <Stack tokens={{ childrenGap: 6 }}>
                {configPanel.data.endpoints.map((ep: any, idx: number) => (
                  <Stack
                    key={ep.id || idx}
                    horizontal
                    verticalAlign="center"
                    tokens={{ childrenGap: 12 }}
                    style={{ background: "white", borderRadius: 6, padding: "8px 12px", border: "1px solid #edebe9" }}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: ep.endpointMonitorStatus === "Online" ? "#107c10" : ep.endpointMonitorStatus === "Degraded" ? "#ffaa00" : "#d13438",
                    }} />
                    <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>{ep.name}</Text>
                    <Text variant="small" styles={{ root: { color: "#605e5c", minWidth: 120 } }}>{ep.type?.split("/").pop()}</Text>
                    <Text variant="small" styles={{ root: { fontFamily: "monospace", color: "#0078d4" } }}>
                      {ep.target || ep.targetResourceId?.split("/").pop() || "—"}
                    </Text>
                    {ep.weight != null && <Text variant="small" styles={{ root: { color: "#a19f9d" } }}>weight: {ep.weight}</Text>}
                    {ep.priority != null && <Text variant="small" styles={{ root: { color: "#a19f9d" } }}>priority: {ep.priority}</Text>}
                    {ep.endpointLocation && <Text variant="small" styles={{ root: { color: "#a19f9d" } }}>{ep.endpointLocation}</Text>}
                    <Text variant="small" styles={{ root: {
                      marginLeft: "auto", fontWeight: 600,
                      color: ep.endpointStatus === "Enabled" ? "#107c10" : "#d13438",
                    } }}>
                      {ep.endpointStatus}
                    </Text>
                  </Stack>
                ))}
              </Stack>
            </div>
          )}

          {/* Full JSON Configuration */}
          <div>
            <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block" } }}>
              Full Configuration (JSON)
            </Text>
            <pre style={{
              background: "#1e1e1e",
              color: "#d4d4d4",
              padding: 16,
              borderRadius: 8,
              fontSize: 12,
              fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
              maxHeight: 500,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}>
              {JSON.stringify(configPanel.data, null, 2)}
            </pre>
          </div>
        </Stack>
      ) : (
        <MessageBar messageBarType={MessageBarType.error} styles={{ root: { marginTop: 20 } }}>
          Failed to load configuration
        </MessageBar>
      )}
    </Panel>
    </>
  );
};
