import React, { useState } from "react";
import { Stack, Text, PrimaryButton, DefaultButton, Dialog, DialogType, DialogFooter, TextField, IconButton, Dropdown, IDropdownOption, Checkbox } from "@fluentui/react";
import { ManagedGroup, GatewayListItem, WafPolicy, TrafficManagerProfile, AfdProfile } from "../../types";
import { createManagedGroup, deleteManagedGroup, addResourceToGroup, removeResourceFromGroup, setMasterGateway, syncManagedGroup, previewSync } from "../../services/api";
import { AppGatewayIcon, FrontDoorIcon, TrafficManagerIcon, WafIcon } from "../AzureIcons";

interface Props {
  groups: ManagedGroup[];
  gateways: GatewayListItem[];
  wafPolicies: WafPolicy[];
  trafficManagers: TrafficManagerProfile[];
  afdProfiles: AfdProfile[];
  subscriptionId: string;
  onRefresh: () => void;
}

const COLOR_OPTIONS: IDropdownOption[] = [
  { key: "#0078d4", text: "Blue" },
  { key: "#107c10", text: "Green" },
  { key: "#5c2d91", text: "Purple" },
  { key: "#d83b01", text: "Orange" },
  { key: "#008272", text: "Teal" },
  { key: "#e3008c", text: "Pink" },
  { key: "#393939", text: "Dark" },
];

const ICON_OPTIONS: IDropdownOption[] = [
  { key: "💰", text: "💰 Finance" },
  { key: "📢", text: "📢 Marketing" },
  { key: "🚀", text: "🚀 Production" },
  { key: "🔬", text: "🔬 Development" },
  { key: "🏢", text: "🏢 Enterprise" },
  { key: "🌐", text: "🌐 Global" },
  { key: "🔒", text: "🔒 Security" },
  { key: "📦", text: "📦 General" },
];

export const ManagedGroupsSection: React.FC<Props> = ({ groups, gateways, wafPolicies, trafficManagers, afdProfiles, subscriptionId, onRefresh }) => {
  const [showCreate, setShowCreate] = useState(false);
  const [showAssign, setShowAssign] = useState<{ groupId: string; type: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColor, setNewColor] = useState("#0078d4");
  const [newIcon, setNewIcon] = useState("📦");
  const [loading, setLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [selectedResources, setSelectedResources] = useState<Set<string>>(new Set());
  const [syncPreview, setSyncPreview] = useState<{ groupId: string; diffs: any[] } | null>(null);

  async function handleCreate() {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      await createManagedGroup({ name: newName, description: newDesc, color: newColor, icon: newIcon, subscriptionId });
      setShowCreate(false); setNewName(""); setNewDesc("");
      onRefresh();
    } catch { } finally { setLoading(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setLoading(true);
    try { await deleteManagedGroup(deleteId); setDeleteId(null); onRefresh(); }
    catch { } finally { setLoading(false); }
  }

  async function handleAssign(groupId: string, resourceType: string, resourceId: string) {
    setLoading(true);
    try { await addResourceToGroup(groupId, resourceType, resourceId); onRefresh(); }
    catch { } finally { setLoading(false); }
  }

  async function handleAssignMultiple() {
    if (!showAssign || selectedResources.size === 0) return;
    setLoading(true);
    const groupId = showAssign.groupId;
    const type = showAssign.type;
    const resources = Array.from(selectedResources);
    try {
      for (const resourceId of resources) {
        await addResourceToGroup(groupId, type, resourceId);
      }
    } catch (e) {
      console.error("Failed to assign resources", e);
    } finally {
      setShowAssign(null);
      setSelectedResources(new Set());
      setLoading(false);
      onRefresh();
    }
  }

  function toggleResourceSelection(id: string) {
    setSelectedResources(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllResources(ids: string[]) {
    setSelectedResources(new Set(ids));
  }

  async function handleRemove(groupId: string, resourceType: string, resourceId: string) {
    setLoading(true);
    try { await removeResourceFromGroup(groupId, resourceType, resourceId); onRefresh(); }
    catch { } finally { setLoading(false); }
  }

  async function handleSetMaster(groupId: string, gatewayId: string) {
    setLoading(true);
    try { await setMasterGateway(groupId, gatewayId); onRefresh(); }
    catch { } finally { setLoading(false); }
  }

  async function handleSync(groupId: string) {
    setLoading(true);
    try {
      const result = await syncManagedGroup(groupId);
      const msg = result.slaveResults?.map((r: any) => `${r.gatewayName}: ${r.status}`).join("\n") || "Sync complete";
      alert(`Sync Results:\n${msg}`);
      onRefresh();
    } catch (e: any) {
      alert(`Sync failed: ${e.response?.data?.error || e.message}`);
    } finally { setLoading(false); }
  }

  async function handlePreviewSync(groupId: string) {
    setLoading(true);
    try {
      const diffs = await previewSync(groupId);
      setSyncPreview({ groupId, diffs });
    } catch (e: any) {
      alert(`Preview failed: ${e.response?.data?.error || e.message}`);
    } finally { setLoading(false); }
  }

  function getGatewayName(id: string) { return gateways.find(g => g.id === id)?.name || id.split("/").pop() || id; }
  function getWafName(id: string) { return wafPolicies.find(w => w.id === id)?.name || id.split("/").pop() || id; }
  function getTmName(id: string) { return trafficManagers.find(t => t.id === id)?.name || id.split("/").pop() || id; }
  function getAfdName(id: string) { return afdProfiles.find(a => a.id === id)?.name || id.split("/").pop() || id; }

  function getAvailableResources(type: string, group: ManagedGroup) {
    const assignedAcrossGroups = (rType: string) => groups.flatMap(g => g.resources[rType as keyof typeof g.resources]);
    switch (type) {
      case "gateways": return gateways.filter(g => !assignedAcrossGroups("gateways").includes(g.id)).map(g => ({ key: g.id, text: `${g.name} (${g.resourceGroup})` }));
      case "wafPolicies": return wafPolicies.filter(w => !assignedAcrossGroups("wafPolicies").includes(w.id)).map(w => ({ key: w.id, text: `${w.name} (${w.resourceGroup})` }));
      case "trafficManagers": return trafficManagers.filter(t => !assignedAcrossGroups("trafficManagers").includes(t.id)).map(t => ({ key: t.id, text: `${t.name} (${t.resourceGroup})` }));
      case "frontDoors": return afdProfiles.filter(a => !assignedAcrossGroups("frontDoors").includes(a.id)).map(a => ({ key: a.id, text: `${a.name} (${a.resourceGroup})` }));
      default: return [];
    }
  }

  const resourceSections = [
    { key: "gateways", label: "Application Gateways", icon: <AppGatewayIcon size={16} />, getName: getGatewayName },
    { key: "wafPolicies", label: "WAF Policies", icon: <WafIcon size={16} />, getName: getWafName },
    { key: "trafficManagers", label: "Traffic Manager", icon: <TrafficManagerIcon size={16} />, getName: getTmName },
    { key: "frontDoors", label: "Front Door", icon: <FrontDoorIcon size={16} />, getName: getAfdName },
  ];

  // Resources not assigned to any group
  const unassignedGateways = gateways.filter(g => !groups.some(grp => grp.resources.gateways.includes(g.id)));
  const unassignedWaf = wafPolicies.filter(w => !groups.some(grp => grp.resources.wafPolicies.includes(w.id)));
  const unassignedTm = trafficManagers.filter(t => !groups.some(grp => grp.resources.trafficManagers.includes(t.id)));
  const unassignedAfd = afdProfiles.filter(a => !groups.some(grp => grp.resources.frontDoors.includes(a.id)));
  const hasUnassigned = unassignedGateways.length + unassignedWaf.length + unassignedTm.length + unassignedAfd.length > 0;

  return (
    <>
      <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }} styles={{ root: { marginBottom: 16 } }}>
        <PrimaryButton text="+ New Group" onClick={() => setShowCreate(true)} styles={{ root: { borderRadius: 6 } }} />
        <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{groups.length} groups • {gateways.length} gateways • {wafPolicies.length} WAF • {trafficManagers.length} TM • {afdProfiles.length} AFD</Text>
      </Stack>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
        {groups.map(group => {
          const isExpanded = expandedGroup === group.id;
          const totalResources = group.resources.gateways.length + group.resources.wafPolicies.length + group.resources.trafficManagers.length + group.resources.frontDoors.length;
          return (
            <div key={group.id} className="card" style={{ padding: 0, overflow: "hidden", borderTop: `3px solid ${group.color}` }}>
              {/* Group Header */}
              <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", background: isExpanded ? "#faf9f8" : "white" }}
                onClick={() => setExpandedGroup(isExpanded ? null : group.id)}>
                <span style={{ fontSize: 22 }}>{group.icon}</span>
                <div style={{ flex: 1 }}>
                  <Text styles={{ root: { fontWeight: 700, fontSize: 15 } }}>{group.name}</Text>
                  {group.description && <Text variant="small" styles={{ root: { color: "#605e5c", display: "block" } }}>{group.description}</Text>}
                </div>
                <span style={{ background: group.color, color: "white", borderRadius: 12, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                  {totalResources}
                </span>
                <span style={{ fontSize: 11, color: "#a19f9d", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
              </div>

              {/* Resource Summary Bar */}
              <div style={{ display: "flex", borderTop: "1px solid #edebe9", background: "#faf9f8" }}>
                {resourceSections.map(rs => {
                  const count = group.resources[rs.key as keyof typeof group.resources].length;
                  return (
                    <div key={rs.key} style={{ flex: 1, padding: "8px 0", textAlign: "center", borderRight: "1px solid #edebe9" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        {rs.icon}
                        <Text variant="small" styles={{ root: { fontWeight: 600 } }}>{count}</Text>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Expanded: Resource Details */}
              {isExpanded && (
                <div style={{ padding: "12px 16px", borderTop: "1px solid #edebe9" }}>
                  {/* Sync Controls */}
                  {group.masterGatewayId && group.resources.gateways.length > 1 && (
                    <div style={{ background: "#f0f6ff", borderRadius: 8, padding: "10px 14px", marginBottom: 14, border: "1px solid #0078d422" }}>
                      <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                        <Text variant="small" styles={{ root: { fontWeight: 600, flex: 1 } }}>
                          🔄 Master → {group.resources.gateways.length - 1} slave(s)
                          {group.lastSyncAt && <span style={{ color: "#605e5c", fontWeight: 400 }}> • Last sync: {new Date(group.lastSyncAt).toLocaleString()}</span>}
                          {group.lastSyncStatus && <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: group.lastSyncStatus === "success" ? "#dff6dd" : group.lastSyncStatus === "partial" ? "#fff4ce" : "#fde7e9", color: group.lastSyncStatus === "success" ? "#107c10" : group.lastSyncStatus === "partial" ? "#797600" : "#d13438" }}>{group.lastSyncStatus}</span>}
                        </Text>
                        <DefaultButton text="Preview" iconProps={{ iconName: "RedEye" }} onClick={() => handlePreviewSync(group.id)} disabled={loading}
                          styles={{ root: { height: 28, minWidth: 0, borderRadius: 4 } }} />
                        <PrimaryButton text="Sync Now" iconProps={{ iconName: "Sync" }} onClick={() => handleSync(group.id)} disabled={loading}
                          styles={{ root: { height: 28, minWidth: 0, borderRadius: 4 } }} />
                      </Stack>
                    </div>
                  )}

                  {/* Gateways with master/slave */}
                  <div style={{ marginBottom: 12 }}>
                    <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 6 }} styles={{ root: { marginBottom: 6 } }}>
                      <AppGatewayIcon size={16} />
                      <Text variant="small" styles={{ root: { fontWeight: 600, flex: 1 } }}>Application Gateways</Text>
                      <IconButton iconProps={{ iconName: "Add" }} title="Add Gateway"
                        onClick={(e) => { e.stopPropagation(); setShowAssign({ groupId: group.id, type: "gateways" }); }}
                        styles={{ root: { width: 24, height: 24 } }} />
                    </Stack>
                    {group.resources.gateways.length === 0 ? (
                      <Text variant="small" styles={{ root: { color: "#a19f9d", fontStyle: "italic", paddingLeft: 22 } }}>None assigned</Text>
                    ) : (
                      <Stack tokens={{ childrenGap: 4 }} styles={{ root: { paddingLeft: 22 } }}>
                        {group.resources.gateways.map(id => {
                          const isMaster = group.masterGatewayId === id;
                          return (
                            <Stack key={id} horizontal verticalAlign="center" tokens={{ childrenGap: 6 }}
                              styles={{ root: { padding: "4px 8px", borderRadius: 6, background: isMaster ? "#e8f4fd" : "transparent", border: isMaster ? "1px solid #0078d433" : "1px solid transparent" } }}>
                              <Text variant="small" styles={{ root: { flex: 1, fontWeight: isMaster ? 600 : 400 } }}>{getGatewayName(id)}</Text>
                              {isMaster ? (
                                <span style={{ background: "#0078d4", color: "white", borderRadius: 4, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>MASTER</span>
                              ) : (
                                <>
                                  <span style={{ background: "#edebe9", color: "#605e5c", borderRadius: 4, padding: "1px 8px", fontSize: 10, fontWeight: 600 }}>SLAVE</span>
                                  <DefaultButton text="Set Master" onClick={() => handleSetMaster(group.id, id)} disabled={loading}
                                    styles={{ root: { height: 22, minWidth: 0, padding: "0 6px", fontSize: 10 } }} />
                                </>
                              )}
                              <IconButton iconProps={{ iconName: "Cancel" }} title="Remove"
                                onClick={() => handleRemove(group.id, "gateways", id)}
                                styles={{ root: { width: 20, height: 20, color: "#a19f9d" }, icon: { fontSize: 10 } }} />
                            </Stack>
                          );
                        })}
                        {!group.masterGatewayId && group.resources.gateways.length > 0 && (
                          <Text variant="small" styles={{ root: { color: "#d83b01", fontStyle: "italic", marginTop: 4 } }}>
                            ⚠ No master set — click "Set Master" on a gateway to enable sync
                          </Text>
                        )}
                      </Stack>
                    )}
                  </div>

                  {/* Other resource sections (WAF, TM, AFD) */}
                  {resourceSections.filter(rs => rs.key !== "gateways").map(rs => {
                    const ids = group.resources[rs.key as keyof typeof group.resources];
                    return (
                      <div key={rs.key} style={{ marginBottom: 12 }}>
                        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 6 }} styles={{ root: { marginBottom: 6 } }}>
                          {rs.icon}
                          <Text variant="small" styles={{ root: { fontWeight: 600, flex: 1 } }}>{rs.label}</Text>
                          <IconButton iconProps={{ iconName: "Add" }} title={`Add ${rs.label}`}
                            onClick={(e) => { e.stopPropagation(); setShowAssign({ groupId: group.id, type: rs.key }); }}
                            styles={{ root: { width: 24, height: 24 } }} />
                        </Stack>
                        {ids.length === 0 ? (
                          <Text variant="small" styles={{ root: { color: "#a19f9d", fontStyle: "italic", paddingLeft: 22 } }}>None assigned</Text>
                        ) : (
                          <Stack tokens={{ childrenGap: 4 }} styles={{ root: { paddingLeft: 22 } }}>
                            {ids.map(id => (
                              <Stack key={id} horizontal verticalAlign="center" tokens={{ childrenGap: 6 }}>
                                <Text variant="small" styles={{ root: { flex: 1 } }}>{rs.getName(id)}</Text>
                                <IconButton iconProps={{ iconName: "Cancel" }} title="Remove"
                                  onClick={() => handleRemove(group.id, rs.key, id)}
                                  styles={{ root: { width: 20, height: 20, color: "#a19f9d" }, icon: { fontSize: 10 } }} />
                              </Stack>
                            ))}
                          </Stack>
                        )}
                      </div>
                    );
                  })}
                  <DefaultButton text="Delete Group" onClick={() => setDeleteId(group.id)}
                    styles={{ root: { marginTop: 8, color: "#d13438", borderColor: "#d13438", width: "100%" } }} />
                </div>
              )}
            </div>
          );
        })}

        {/* Unassigned Resources Card */}
        {hasUnassigned && (
          <div className="card" style={{ padding: 0, overflow: "hidden", borderTop: "3px solid #a19f9d", opacity: 0.8 }}>
            <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>📋</span>
              <div style={{ flex: 1 }}>
                <Text styles={{ root: { fontWeight: 700, fontSize: 15 } }}>Unassigned Resources</Text>
                <Text variant="small" styles={{ root: { color: "#605e5c", display: "block" } }}>Resources not in any group</Text>
              </div>
              <span style={{ background: "#a19f9d", color: "white", borderRadius: 12, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                {unassignedGateways.length + unassignedWaf.length + unassignedTm.length + unassignedAfd.length}
              </span>
            </div>
            <div style={{ display: "flex", borderTop: "1px solid #edebe9", background: "#faf9f8" }}>
              <div style={{ flex: 1, padding: "8px 0", textAlign: "center", borderRight: "1px solid #edebe9" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <AppGatewayIcon size={16} /><Text variant="small" styles={{ root: { fontWeight: 600 } }}>{unassignedGateways.length}</Text>
                </div>
              </div>
              <div style={{ flex: 1, padding: "8px 0", textAlign: "center", borderRight: "1px solid #edebe9" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <WafIcon size={16} /><Text variant="small" styles={{ root: { fontWeight: 600 } }}>{unassignedWaf.length}</Text>
                </div>
              </div>
              <div style={{ flex: 1, padding: "8px 0", textAlign: "center", borderRight: "1px solid #edebe9" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <TrafficManagerIcon size={16} /><Text variant="small" styles={{ root: { fontWeight: 600 } }}>{unassignedTm.length}</Text>
                </div>
              </div>
              <div style={{ flex: 1, padding: "8px 0", textAlign: "center" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <FrontDoorIcon size={16} /><Text variant="small" styles={{ root: { fontWeight: 600 } }}>{unassignedAfd.length}</Text>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Group Dialog */}
      <Dialog hidden={!showCreate} onDismiss={() => setShowCreate(false)}
        dialogContentProps={{ type: DialogType.largeHeader, title: "Create Managed Group", subText: "Organize your networking resources into logical groups" }}>
        <Stack tokens={{ childrenGap: 12 }}>
          <TextField label="Group Name" required value={newName} onChange={(_, v) => setNewName(v || "")} placeholder="e.g. Production, Finance, Marketing" />
          <TextField label="Description" value={newDesc} onChange={(_, v) => setNewDesc(v || "")} placeholder="Optional description" />
          <Dropdown label="Color" selectedKey={newColor} options={COLOR_OPTIONS} onChange={(_, opt) => setNewColor(opt?.key as string || "#0078d4")} />
          <Dropdown label="Icon" selectedKey={newIcon} options={ICON_OPTIONS} onChange={(_, opt) => setNewIcon(opt?.key as string || "📦")} />
        </Stack>
        <DialogFooter>
          <PrimaryButton text="Create" onClick={handleCreate} disabled={loading || !newName.trim()} />
          <DefaultButton text="Cancel" onClick={() => setShowCreate(false)} />
        </DialogFooter>
      </Dialog>

      {/* Assign Resource Dialog — Multi-select */}
      <Dialog hidden={!showAssign} onDismiss={() => { setShowAssign(null); setSelectedResources(new Set()); }}
        dialogContentProps={{ type: DialogType.largeHeader, title: `Add ${showAssign?.type === "gateways" ? "Gateways" : showAssign?.type === "wafPolicies" ? "WAF Policies" : showAssign?.type === "trafficManagers" ? "Traffic Managers" : "Front Doors"}`, subText: "Select one or more resources to add to this group" }}>
        {showAssign && (() => {
          const available = getAvailableResources(showAssign.type, groups.find(g => g.id === showAssign.groupId)!);
          return (
            <Stack tokens={{ childrenGap: 4 }}>
              {available.length > 1 && (
                <Stack horizontal tokens={{ childrenGap: 8 }} styles={{ root: { marginBottom: 8 } }}>
                  <DefaultButton text="Select All" onClick={() => selectAllResources(available.map(o => o.key))}
                    styles={{ root: { height: 28, minWidth: 0, fontSize: 12 } }} />
                  <DefaultButton text="Clear" onClick={() => setSelectedResources(new Set())}
                    styles={{ root: { height: 28, minWidth: 0, fontSize: 12 } }} />
                  <Text variant="small" styles={{ root: { color: "#605e5c", alignSelf: "center" } }}>
                    {selectedResources.size} of {available.length} selected
                  </Text>
                </Stack>
              )}
              <div style={{ maxHeight: 300, overflow: "auto" }}>
                {available.map(opt => (
                  <div key={opt.key}
                    style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 2, cursor: "pointer",
                      background: selectedResources.has(opt.key) ? "#e8f4fd" : "transparent",
                      border: selectedResources.has(opt.key) ? "1px solid #0078d433" : "1px solid transparent" }}
                    onClick={() => toggleResourceSelection(opt.key)}>
                    <Checkbox
                      checked={selectedResources.has(opt.key)}
                      label={opt.text}
                      onChange={() => toggleResourceSelection(opt.key)}
                      styles={{ root: { pointerEvents: "none" } }}
                    />
                  </div>
                ))}
              </div>
              {available.length === 0 && (
                <Text styles={{ root: { color: "#605e5c", fontStyle: "italic" } }}>No unassigned resources available</Text>
              )}
            </Stack>
          );
        })()}
        <DialogFooter>
          <PrimaryButton text={`Add ${selectedResources.size} Resource${selectedResources.size !== 1 ? "s" : ""}`}
            onClick={handleAssignMultiple} disabled={loading || selectedResources.size === 0} />
          <DefaultButton text="Cancel" onClick={() => { setShowAssign(null); setSelectedResources(new Set()); }} />
        </DialogFooter>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog hidden={!deleteId} onDismiss={() => setDeleteId(null)}
        dialogContentProps={{ type: DialogType.normal, title: "Delete Group", subText: "Resources will be unassigned but not deleted." }}>
        <DialogFooter>
          <PrimaryButton text="Delete" onClick={handleDelete} disabled={loading} styles={{ root: { background: "#d13438" } }} />
          <DefaultButton text="Cancel" onClick={() => setDeleteId(null)} />
        </DialogFooter>
      </Dialog>

      {/* Sync Preview Dialog */}
      <Dialog hidden={!syncPreview} onDismiss={() => setSyncPreview(null)}
        dialogContentProps={{ type: DialogType.largeHeader, title: "Sync Preview", subText: "Changes that will be applied from master to slave gateways" }}
        minWidth={560}>
        {syncPreview && (
          <Stack tokens={{ childrenGap: 16 }}>
            {syncPreview.diffs.map((diff: any, i: number) => (
              <div key={i} style={{ border: "1px solid #edebe9", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "8px 12px", background: "#faf9f8", borderBottom: "1px solid #edebe9", display: "flex", alignItems: "center", gap: 8 }}>
                  <Text styles={{ root: { fontWeight: 600 } }}>{diff.slaveGateway}</Text>
                  <span style={{
                    padding: "1px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                    background: diff.summary.includes("in sync") ? "#dff6dd" : "#fff4ce",
                    color: diff.summary.includes("in sync") ? "#107c10" : "#797600",
                  }}>{diff.summary}</span>
                </div>
                {diff.differences.filter((d: any) => d.change !== "in_sync").length > 0 && (
                  <div style={{ padding: "8px 12px", maxHeight: 200, overflow: "auto" }}>
                    {diff.differences.filter((d: any) => d.change !== "in_sync").map((d: any, j: number) => (
                      <div key={j} style={{ display: "flex", alignItems: "center", padding: "4px 0", gap: 8, fontSize: 12 }}>
                        <span style={{
                          color: d.change === "will_add" ? "#107c10" : d.change === "will_remove" ? "#d13438" : "#c19c00",
                          fontWeight: 700, width: 14, textAlign: "center",
                        }}>
                          {d.change === "will_add" ? "+" : d.change === "will_remove" ? "−" : "~"}
                        </span>
                        <span style={{ background: "#f3f2f1", borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 600 }}>{d.component}</span>
                        <span>{d.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </Stack>
        )}
        <DialogFooter>
          <PrimaryButton text="Sync Now" onClick={() => { const gid = syncPreview?.groupId; setSyncPreview(null); if (gid) handleSync(gid); }} disabled={loading} />
          <DefaultButton text="Close" onClick={() => setSyncPreview(null)} />
        </DialogFooter>
      </Dialog>
    </>
  );
};
