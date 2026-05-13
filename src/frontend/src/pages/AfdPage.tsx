import { useState, useEffect } from "react";
import { Stack, Text, Spinner, MessageBar, MessageBarType, SearchBox, CommandBar, ICommandBarItemProps, Panel, PanelType, Pivot, PivotItem, DefaultButton, PrimaryButton, Dialog, DialogType, DialogFooter } from "@fluentui/react";
import { SubscriptionPicker } from "../components/SubscriptionPicker";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { getAfdProfiles, getAfdEndpoints, getAfdOriginGroups, getAfdCustomDomains, purgeAfdEndpoint, deleteAfdProfile } from "../services/api";
import { AfdProfile, AfdEndpoint, AfdOriginGroup, AfdCustomDomain } from "../types";

export function AfdPage() {
  const { subscriptions, selectedSubscription, setSelectedSubscription, loading: subsLoading } = useSubscriptions();
  const [profiles, setProfiles] = useState<AfdProfile[]>([]);
  const [filtered, setFiltered] = useState<AfdProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AfdProfile | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [endpoints, setEndpoints] = useState<AfdEndpoint[]>([]);
  const [originGroups, setOriginGroups] = useState<AfdOriginGroup[]>([]);
  const [customDomains, setCustomDomains] = useState<AfdCustomDomain[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

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
      const data = await getAfdProfiles(selectedSubscription);
      setProfiles(data);
    } catch { setError("Failed to load AFD profiles"); }
    finally { setLoading(false); }
  }

  async function openDetail(profile: AfdProfile) {
    setSelected(profile);
    setPanelOpen(true);
    setDetailLoading(true);
    try {
      const [eps, ogs, doms] = await Promise.all([
        getAfdEndpoints(profile.subscriptionId, profile.resourceGroup, profile.name),
        getAfdOriginGroups(profile.subscriptionId, profile.resourceGroup, profile.name),
        getAfdCustomDomains(profile.subscriptionId, profile.resourceGroup, profile.name),
      ]);
      setEndpoints(eps); setOriginGroups(ogs); setCustomDomains(doms);
    } catch { setError("Failed to load profile details"); }
    finally { setDetailLoading(false); }
  }

  async function handlePurge(endpointName: string) {
    if (!selected) return;
    try {
      setActionLoading(true);
      await purgeAfdEndpoint(selected.subscriptionId, selected.resourceGroup, selected.name, endpointName);
    } catch { setError("Failed to purge endpoint"); }
    finally { setActionLoading(false); }
  }

  async function handleDelete() {
    if (!selected) return;
    try {
      setActionLoading(true);
      await deleteAfdProfile(selected.subscriptionId, selected.resourceGroup, selected.name);
      setDeleteDialog(false); setPanelOpen(false); setSelected(null);
      await loadProfiles();
    } catch { setError("Failed to delete profile"); }
    finally { setActionLoading(false); }
  }

  const commands: ICommandBarItemProps[] = [
    { key: "refresh", text: "Refresh", iconProps: { iconName: "Refresh" }, onClick: () => { loadProfiles(); } },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <Text variant="xxLarge" styles={{ root: { fontWeight: 600 } }}>Azure Front Door</Text>
      </div>
      <Stack tokens={{ childrenGap: 16 }}>
        <SubscriptionPicker subscriptions={subscriptions} selectedSubscription={selectedSubscription} onChange={setSelectedSubscription} loading={subsLoading} />
        <CommandBar items={commands} />
        <SearchBox placeholder="Search profiles..." value={search} onChange={(_, v) => setSearch(v || "")} styles={{ root: { maxWidth: 400 } }} />
        {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError(null)}>{error}</MessageBar>}
        {loading ? <Spinner label="Loading AFD profiles..." /> : filtered.length === 0 ? (
          <div className="empty-state"><h3>No Front Door profiles found</h3><p>No Azure Front Door Standard/Premium profiles in this subscription.</p></div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #edebe9", textAlign: "left" }}>
                  <th style={{ padding: "12px 16px" }}>Name</th>
                  <th style={{ padding: "12px 16px" }}>Resource Group</th>
                  <th style={{ padding: "12px 16px" }}>SKU</th>
                  <th style={{ padding: "12px 16px" }}>State</th>
                  <th style={{ padding: "12px 16px" }}>Endpoints</th>
                  <th style={{ padding: "12px 16px" }}>Domains</th>
                  <th style={{ padding: "12px 16px" }}>Origin Groups</th>
                  <th style={{ padding: "12px 16px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #edebe9" }}>
                    <td style={{ padding: "10px 16px", color: "#0078d4", fontWeight: 500, cursor: "pointer" }} onClick={() => openDetail(p)}>{p.name}</td>
                    <td style={{ padding: "10px 16px" }}>{p.resourceGroup}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ background: p.sku.includes("Premium") ? "#5c2d91" : "#0078d4", color: "white", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                        {p.sku.includes("Premium") ? "Premium" : "Standard"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <span className={`status-badge ${p.resourceState === "Active" ? "status-running" : "status-stopped"}`}>{p.resourceState}</span>
                    </td>
                    <td style={{ padding: "10px 16px" }}>{p.endpointCount}</td>
                    <td style={{ padding: "10px 16px" }}>{p.customDomainCount}</td>
                    <td style={{ padding: "10px 16px" }}>{p.originGroupCount}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <Stack horizontal tokens={{ childrenGap: 4 }}>
                        <DefaultButton text="Details" onClick={() => openDetail(p)} styles={{ root: { minWidth: 0, padding: "0 8px", height: 28 } }} />
                        <DefaultButton text="Delete" onClick={() => { setSelected(p); setDeleteDialog(true); }} styles={{ root: { minWidth: 0, padding: "0 8px", height: 28, color: "#d13438" } }} />
                      </Stack>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Stack>

      {/* Detail Panel */}
      <Panel isOpen={panelOpen} onDismiss={() => setPanelOpen(false)} type={PanelType.medium} headerText={selected?.name || "AFD Profile"} isLightDismiss>
        {detailLoading ? <Spinner label="Loading details..." /> : selected && (
          <Pivot>
            <PivotItem headerText="Overview">
              <Stack tokens={{ childrenGap: 12, padding: "16px 0" }}>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>SKU</Text><br /><Text>{selected.sku}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Resource Group</Text><br /><Text>{selected.resourceGroup}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>State</Text><br /><Text>{selected.resourceState}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Origin Timeout</Text><br /><Text>{selected.originResponseTimeoutSeconds}s</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Provisioning</Text><br /><Text>{selected.provisioningState}</Text></div>
              </Stack>
            </PivotItem>
            <PivotItem headerText={`Endpoints (${endpoints.length})`}>
              <Stack tokens={{ childrenGap: 8, padding: "16px 0" }}>
                {endpoints.map(ep => (
                  <div key={ep.id} className="card" style={{ padding: 12 }}>
                    <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                      <Text styles={{ root: { fontWeight: 600, flex: 1 } }}>{ep.name}</Text>
                      <span className={`status-badge ${ep.enabledState === "Enabled" ? "status-running" : "status-stopped"}`}>{ep.enabledState}</span>
                    </Stack>
                    <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{ep.hostName}</Text>
                    <DefaultButton text="Purge Cache" onClick={() => handlePurge(ep.name)} disabled={actionLoading} styles={{ root: { marginTop: 8, height: 28 } }} />
                  </div>
                ))}
                {endpoints.length === 0 && <Text styles={{ root: { color: "#605e5c" } }}>No endpoints configured</Text>}
              </Stack>
            </PivotItem>
            <PivotItem headerText={`Origins (${originGroups.length})`}>
              <Stack tokens={{ childrenGap: 8, padding: "16px 0" }}>
                {originGroups.map(og => (
                  <div key={og.id} className="card" style={{ padding: 12 }}>
                    <Text styles={{ root: { fontWeight: 600 } }}>{og.name}</Text>
                    {og.healthProbeSettings && <Text variant="small" styles={{ root: { color: "#605e5c" } }}>Probe: {og.healthProbeSettings.probeProtocol} {og.healthProbeSettings.probePath} every {og.healthProbeSettings.probeIntervalInSeconds}s</Text>}
                    {og.origins.length > 0 && (
                      <table style={{ width: "100%", marginTop: 8, fontSize: 12 }}>
                        <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #edebe9" }}><th style={{ padding: 4 }}>Origin</th><th style={{ padding: 4 }}>Host</th><th style={{ padding: 4 }}>Priority</th><th style={{ padding: 4 }}>Weight</th><th style={{ padding: 4 }}>State</th></tr></thead>
                        <tbody>
                          {og.origins.map(o => (
                            <tr key={o.id}><td style={{ padding: 4 }}>{o.name}</td><td style={{ padding: 4 }}>{o.hostName}</td><td style={{ padding: 4 }}>{o.priority}</td><td style={{ padding: 4 }}>{o.weight}</td><td style={{ padding: 4 }}><span className={`status-badge ${o.enabledState === "Enabled" ? "status-running" : "status-stopped"}`}>{o.enabledState}</span></td></tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
                {originGroups.length === 0 && <Text styles={{ root: { color: "#605e5c" } }}>No origin groups</Text>}
              </Stack>
            </PivotItem>
            <PivotItem headerText={`Domains (${customDomains.length})`}>
              <Stack tokens={{ childrenGap: 8, padding: "16px 0" }}>
                {customDomains.map(d => (
                  <div key={d.id} className="card" style={{ padding: 12 }}>
                    <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                      <Text styles={{ root: { fontWeight: 600, flex: 1 } }}>{d.hostName}</Text>
                      <span className={`status-badge ${d.domainValidationState === "Approved" ? "status-running" : "status-warning"}`}>{d.domainValidationState}</span>
                    </Stack>
                    <Text variant="small" styles={{ root: { color: "#605e5c" } }}>TLS: {d.tlsSettings} | Provisioning: {d.provisioningState}</Text>
                  </div>
                ))}
                {customDomains.length === 0 && <Text styles={{ root: { color: "#605e5c" } }}>No custom domains</Text>}
              </Stack>
            </PivotItem>
          </Pivot>
        )}
      </Panel>

      {/* Delete dialog */}
      <Dialog hidden={!deleteDialog} onDismiss={() => setDeleteDialog(false)} dialogContentProps={{ type: DialogType.normal, title: "Delete Front Door Profile", subText: `Delete "${selected?.name}"? This cannot be undone.` }}>
        <DialogFooter>
          <PrimaryButton text="Delete" onClick={handleDelete} disabled={actionLoading} styles={{ root: { background: "#d13438" } }} />
          <DefaultButton text="Cancel" onClick={() => setDeleteDialog(false)} />
        </DialogFooter>
      </Dialog>
    </div>
  );
}
