import { useState, useEffect } from "react";
import { Stack, Text, Spinner, MessageBar, MessageBarType, SearchBox, CommandBar, ICommandBarItemProps, Panel, PanelType, DefaultButton, PrimaryButton, Dialog, DialogType, DialogFooter, TextField, Dropdown, IDropdownOption } from "@fluentui/react";
import { SubscriptionPicker } from "../components/SubscriptionPicker";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { getTrafficManagerProfiles, enableTrafficManagerProfile, disableTrafficManagerProfile, deleteTrafficManagerProfile, enableTrafficManagerEndpoint, disableTrafficManagerEndpoint, addTrafficManagerFailoverEndpoint, checkAndFailover } from "../services/api";
import { TrafficManagerProfile } from "../types";
import { FailoverSection } from "../components/dashboard/FailoverSection";
import { PublicTrafficManagerCards } from "../components/dashboard/PublicTrafficManagerCards";

export function TrafficManagerPage() {
  const { subscriptions, selectedSubscription, setSelectedSubscription, loading: subsLoading } = useSubscriptions();
  const [profiles, setProfiles] = useState<TrafficManagerProfile[]>([]);
  const [filtered, setFiltered] = useState<TrafficManagerProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"public" | "private">("public");
  const [selected, setSelected] = useState<TrafficManagerProfile | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [failoverDialog, setFailoverDialog] = useState(false);
  const [failoverName, setFailoverName] = useState("");
  const [failoverTarget, setFailoverTarget] = useState("");
  const [failoverType, setFailoverType] = useState("ExternalEndpoints");
  const [failoverPriority, setFailoverPriority] = useState("999");
  const [failoverLocation, setFailoverLocation] = useState("eastus");
  const [failoverResult, setFailoverResult] = useState<any>(null);

  useEffect(() => { if (selectedSubscription) loadProfiles(); }, [selectedSubscription]);

  useEffect(() => {
    if (search) {
      setFiltered(profiles.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.resourceGroup.toLowerCase().includes(search.toLowerCase())));
    } else {
      setFiltered(profiles);
    }
  }, [profiles, search]);

  async function loadProfiles() {
    try {
      setLoading(true); setError(null);
      const data = await getTrafficManagerProfiles(selectedSubscription);
      setProfiles(data);
    } catch { setError("Failed to load Traffic Manager profiles"); }
    finally { setLoading(false); }
  }

  async function handleEnable(p: TrafficManagerProfile) {
    try {
      setActionLoading(true);
      await enableTrafficManagerProfile(p.subscriptionId, p.resourceGroup, p.name);
      await loadProfiles();
    } catch { setError("Failed to enable profile"); }
    finally { setActionLoading(false); }
  }

  async function handleDisable(p: TrafficManagerProfile) {
    try {
      setActionLoading(true);
      await disableTrafficManagerProfile(p.subscriptionId, p.resourceGroup, p.name);
      await loadProfiles();
    } catch { setError("Failed to disable profile"); }
    finally { setActionLoading(false); }
  }

  async function handleDelete() {
    if (!selected) return;
    try {
      setActionLoading(true);
      await deleteTrafficManagerProfile(selected.subscriptionId, selected.resourceGroup, selected.name);
      setDeleteDialog(false); setPanelOpen(false); setSelected(null);
      await loadProfiles();
    } catch { setError("Failed to delete profile"); }
    finally { setActionLoading(false); }
  }

  async function handleEndpointToggle(profile: TrafficManagerProfile, ep: any, enable: boolean) {
    try {
      setActionLoading(true);
      if (enable) {
        await enableTrafficManagerEndpoint(profile.subscriptionId, profile.resourceGroup, profile.name, ep.type, ep.name);
      } else {
        await disableTrafficManagerEndpoint(profile.subscriptionId, profile.resourceGroup, profile.name, ep.type, ep.name);
      }
      await loadProfiles();
      // Refresh selected profile in panel
      const updated = await getTrafficManagerProfiles(selectedSubscription);
      const refreshed = updated.find(p => p.id === profile.id);
      if (refreshed) setSelected(refreshed);
    } catch { setError("Failed to toggle endpoint"); }
    finally { setActionLoading(false); }
  }

  async function handleAddFailoverEndpoint() {
    if (!selected || !failoverName || !failoverTarget) return;
    if (failoverType !== "ExternalEndpoints" && !failoverTarget.startsWith("/")) {
      setError("Azure/Nested endpoints require a full ARM resource ID starting with /subscriptions/... — use External Endpoint for hostnames.");
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
        selected.subscriptionId, selected.resourceGroup, selected.name,
        epPayload
      );
      setSuccess(`Failover endpoint "${failoverName}" added (disabled until needed)`);
      setFailoverDialog(false);
      setFailoverName(""); setFailoverTarget("");
      await loadProfiles();
      const updated = await getTrafficManagerProfiles(selectedSubscription);
      const refreshed = updated.find(p => p.id === selected.id);
      if (refreshed) setSelected(refreshed);
    } catch (err: any) { setError(err?.response?.data?.error || "Failed to add failover endpoint"); }
    finally { setActionLoading(false); }
  }

  async function handleCheckFailover(profile: TrafficManagerProfile) {
    try {
      setActionLoading(true);
      const result = await checkAndFailover(profile.subscriptionId, profile.resourceGroup, profile.name);
      setFailoverResult(result);
      if (result.action === "failover_executed") {
        setSuccess(`Failover executed: enabled ${result.enabledEndpoints.join(", ")}`);
        await loadProfiles();
        const updated = await getTrafficManagerProfiles(selectedSubscription);
        const refreshed = updated.find(p => p.id === profile.id);
        if (refreshed) setSelected(refreshed);
      } else if (result.action === "none") {
        setSuccess("All endpoints healthy — no failover needed.");
      }
    } catch { setError("Failover check failed"); }
    finally { setActionLoading(false); }
  }

  const routingColors: Record<string, string> = {
    Performance: "#0078d4", Priority: "#d83b01", Weighted: "#008272",
    Geographic: "#5c2d91", MultiValue: "#498205", Subnet: "#8764b8",
  };

  const commands: ICommandBarItemProps[] = [
    { key: "refresh", text: "Refresh", iconProps: { iconName: "Refresh" }, onClick: () => { loadProfiles(); } },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <Text variant="xxLarge" styles={{ root: { fontWeight: 600 } }}>Traffic Manager</Text>
      </div>
      <Stack tokens={{ childrenGap: 16 }}>
        <SubscriptionPicker subscriptions={subscriptions} selectedSubscription={selectedSubscription} onChange={setSelectedSubscription} loading={subsLoading} />

        {/* Public / Private Tabs */}
        <Stack horizontal tokens={{ childrenGap: 0 }}>
          <DefaultButton
            text="🚦 Public Traffic Manager"
            onClick={() => setActiveTab("public")}
            styles={{
              root: {
                borderRadius: "6px 0 0 6px",
                background: activeTab === "public" ? "#0078d4" : "#f3f2f1",
                color: activeTab === "public" ? "white" : "#323130",
                borderColor: "#0078d4",
                fontWeight: activeTab === "public" ? 700 : 400,
              },
            }}
          />
          <DefaultButton
            text="🔒 Private Traffic Manager"
            onClick={() => setActiveTab("private")}
            styles={{
              root: {
                borderRadius: "0 6px 6px 0",
                background: activeTab === "private" ? "#0078d4" : "#f3f2f1",
                color: activeTab === "private" ? "white" : "#323130",
                borderColor: "#0078d4",
                fontWeight: activeTab === "private" ? 700 : 400,
              },
            }}
          />
        </Stack>

        {activeTab === "private" ? (
          <FailoverSection subscriptionId={selectedSubscription || ""} />
        ) : (
        <>
        <CommandBar items={commands} />
        <SearchBox placeholder="Search profiles..." value={search} onChange={(_, v) => setSearch(v || "")} styles={{ root: { maxWidth: 400 } }} />
        {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError(null)}>{error}</MessageBar>}
        {success && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSuccess(null)}>{success}</MessageBar>}
        {loading ? <Spinner label="Loading profiles..." /> : filtered.length === 0 ? (
          <div className="empty-state"><h3>No Traffic Manager profiles found</h3><p>No profiles in this subscription.</p></div>
        ) : (
          <>
          <PublicTrafficManagerCards profiles={filtered} subscriptionId={selectedSubscription} onRefresh={loadProfiles} />

          <Text styles={{ root: { fontWeight: 600, fontSize: 14, marginTop: 16, display: "block" } }}>Profile Details</Text>
          <div className="card" style={{ padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #edebe9", textAlign: "left" }}>
                  <th style={{ padding: "12px 16px" }}>Name</th>
                  <th style={{ padding: "12px 16px" }}>Resource Group</th>
                  <th style={{ padding: "12px 16px" }}>DNS Name</th>
                  <th style={{ padding: "12px 16px" }}>Routing</th>
                  <th style={{ padding: "12px 16px" }}>Status</th>
                  <th style={{ padding: "12px 16px" }}>Monitor</th>
                  <th style={{ padding: "12px 16px" }}>Endpoints</th>
                  <th style={{ padding: "12px 16px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #edebe9" }}>
                    <td style={{ padding: "10px 16px", color: "#0078d4", fontWeight: 500, cursor: "pointer" }} onClick={() => { setSelected(p); setPanelOpen(true); }}>{p.name}</td>
                    <td style={{ padding: "10px 16px" }}>{p.resourceGroup}</td>
                    <td style={{ padding: "10px 16px", fontSize: 12 }}>{p.dnsConfig.fqdn}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ background: routingColors[p.trafficRoutingMethod] || "#605e5c", color: "white", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{p.trafficRoutingMethod}</span>
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <span className={`status-badge ${p.profileStatus === "Enabled" ? "status-running" : "status-stopped"}`}>{p.profileStatus}</span>
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <span className={`status-badge ${p.monitorConfig.profileMonitorStatus === "Online" ? "status-running" : p.monitorConfig.profileMonitorStatus === "Degraded" ? "status-warning" : "status-stopped"}`}>{p.monitorConfig.profileMonitorStatus}</span>
                    </td>
                    <td style={{ padding: "10px 16px" }}>{p.endpoints.length}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <Stack horizontal tokens={{ childrenGap: 4 }}>
                        {p.profileStatus === "Enabled" ? (
                          <DefaultButton text="Disable" onClick={() => handleDisable(p)} disabled={actionLoading} styles={{ root: { minWidth: 0, padding: "0 8px", height: 28 } }} />
                        ) : (
                          <PrimaryButton text="Enable" onClick={() => handleEnable(p)} disabled={actionLoading} styles={{ root: { minWidth: 0, padding: "0 8px", height: 28 } }} />
                        )}
                        <DefaultButton text="Details" onClick={() => { setSelected(p); setPanelOpen(true); }} styles={{ root: { minWidth: 0, padding: "0 8px", height: 28 } }} />
                        <DefaultButton text="Delete" onClick={() => { setSelected(p); setDeleteDialog(true); }} styles={{ root: { minWidth: 0, padding: "0 8px", height: 28, color: "#d13438" } }} />
                      </Stack>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}

      {/* Detail Panel */}
      <Panel isOpen={panelOpen} onDismiss={() => setPanelOpen(false)} type={PanelType.medium} headerText={selected?.name || "Profile"} isLightDismiss>
        {selected && (
          <Stack tokens={{ childrenGap: 16, padding: "16px 0" }}>
            <div className="card" style={{ padding: 16 }}>
              <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, marginBottom: 12, display: "block" } }}>Configuration</Text>
              <Stack tokens={{ childrenGap: 8 }}>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>DNS Name</Text><br /><Text>{selected.dnsConfig.fqdn}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>TTL</Text><br /><Text>{selected.dnsConfig.ttl}s</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Routing Method</Text><br /><Text>{selected.trafficRoutingMethod}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Monitor Protocol</Text><br /><Text>{selected.monitorConfig.protocol}:{selected.monitorConfig.port}{selected.monitorConfig.path}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Probe Interval</Text><br /><Text>{selected.monitorConfig.intervalInSeconds}s (timeout: {selected.monitorConfig.timeoutInSeconds}s, failures tolerated: {selected.monitorConfig.toleratedNumberOfFailures})</Text></div>
              </Stack>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <Stack horizontal horizontalAlign="space-between" verticalAlign="center" styles={{ root: { marginBottom: 12 } }}>
                <Text variant="mediumPlus" styles={{ root: { fontWeight: 600 } }}>Endpoints ({selected.endpoints.length})</Text>
                <Stack horizontal tokens={{ childrenGap: 8 }}>
                  <PrimaryButton text="Check & Failover" iconProps={{ iconName: "Heart" }} onClick={() => handleCheckFailover(selected)} disabled={actionLoading} styles={{ root: { height: 28, fontSize: 12 } }} />
                  <DefaultButton text="Add Failover Endpoint" iconProps={{ iconName: "Add" }} onClick={() => setFailoverDialog(true)} disabled={actionLoading} styles={{ root: { height: 28, fontSize: 12 } }} />
                </Stack>
              </Stack>
              {failoverResult && (
                <MessageBar
                  messageBarType={failoverResult.action === "none" ? MessageBarType.success : failoverResult.action === "failover_executed" ? MessageBarType.warning : MessageBarType.severeWarning}
                  onDismiss={() => setFailoverResult(null)}
                  styles={{ root: { marginBottom: 12 } }}
                >
                  <Stack tokens={{ childrenGap: 4 }}>
                    {failoverResult.details.map((d: string, i: number) => <Text key={i} variant="small">{d}</Text>)}
                  </Stack>
                </MessageBar>
              )}
              {selected.endpoints.length === 0 ? (
                <Text styles={{ root: { color: "#605e5c" } }}>No endpoints configured</Text>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #edebe9" }}><th style={{ padding: 6 }}>Name</th><th style={{ padding: 6 }}>Target</th><th style={{ padding: 6 }}>Status</th><th style={{ padding: 6 }}>Monitor</th><th style={{ padding: 6 }}>Weight</th><th style={{ padding: 6 }}>Action</th></tr></thead>
                  <tbody>
                    {selected.endpoints.map(ep => (
                      <tr key={ep.id} style={{ borderBottom: "1px solid #f3f2f1" }}>
                        <td style={{ padding: 6, fontWeight: 500 }}>{ep.name}</td>
                        <td style={{ padding: 6, fontSize: 12 }}>{ep.target || ep.targetResourceId?.split("/").pop() || "-"}</td>
                        <td style={{ padding: 6 }}><span className={`status-badge ${ep.endpointStatus === "Enabled" ? "status-running" : "status-stopped"}`}>{ep.endpointStatus}</span></td>
                        <td style={{ padding: 6 }}><span className={`status-badge ${ep.endpointMonitorStatus === "Online" ? "status-running" : ep.endpointMonitorStatus === "Degraded" ? "status-warning" : "status-stopped"}`}>{ep.endpointMonitorStatus}</span></td>
                        <td style={{ padding: 6 }}>{ep.weight || "-"}</td>
                        <td style={{ padding: 6 }}>
                          {ep.endpointStatus === "Enabled" ? (
                            <DefaultButton text="Disable" onClick={() => handleEndpointToggle(selected, ep, false)} disabled={actionLoading} styles={{ root: { minWidth: 0, padding: "0 6px", height: 24, fontSize: 11 } }} />
                          ) : (
                            <PrimaryButton text="Enable" onClick={() => handleEndpointToggle(selected, ep, true)} disabled={actionLoading} styles={{ root: { minWidth: 0, padding: "0 6px", height: 24, fontSize: 11 } }} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Stack>
        )}
      </Panel>
        </>
        )}
      </Stack>

        <Dialog hidden={!deleteDialog} onDismiss={() => setDeleteDialog(false)} dialogContentProps={{ type: DialogType.normal, title: "Delete Traffic Manager Profile", subText: `Delete "${selected?.name}"? This cannot be undone.` }}>
        <DialogFooter>
          <PrimaryButton text="Delete" onClick={handleDelete} disabled={actionLoading} styles={{ root: { background: "#d13438" } }} />
          <DefaultButton text="Cancel" onClick={() => setDeleteDialog(false)} />
        </DialogFooter>
      </Dialog>

      {/* Add Failover Endpoint Dialog */}
      <Dialog hidden={!failoverDialog} onDismiss={() => setFailoverDialog(false)} dialogContentProps={{ type: DialogType.normal, title: "Add Failover Endpoint", subText: "This endpoint will be created in Disabled state and automatically enabled when existing endpoints become faulty." }} minWidth={480}>
        <Stack tokens={{ childrenGap: 12 }}>
          <TextField label="Endpoint Name" value={failoverName} onChange={(_, v) => setFailoverName(v || "")} required placeholder="e.g., failover-endpoint-1" />
          <TextField
            label={failoverType === "ExternalEndpoints" ? "Target (FQDN)" : "Target Resource ID"}
            value={failoverTarget}
            onChange={(_, v) => setFailoverTarget(v || "")}
            required
            placeholder={failoverType === "ExternalEndpoints"
              ? "e.g., mybackup.contoso.com"
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
            ] as IDropdownOption[]}
            onChange={(_, opt) => setFailoverType(opt?.key as string)}
          />
          <TextField label="Priority" value={failoverPriority} onChange={(_, v) => setFailoverPriority(v || "999")} type="number" />
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
            ] as IDropdownOption[]}
            onChange={(_, opt) => setFailoverLocation(opt?.key as string)}
            placeholder="Select region"
          />
        </Stack>
        <DialogFooter>
          <PrimaryButton text="Add Endpoint" onClick={handleAddFailoverEndpoint} disabled={actionLoading || !failoverName || !failoverTarget} />
          <DefaultButton text="Cancel" onClick={() => setFailoverDialog(false)} />
        </DialogFooter>
      </Dialog>
    </div>
  );
}
