import React, { useState, useEffect } from "react";
import {
  Text,
  Stack,
  PrimaryButton,
  DefaultButton,
  Spinner,
  MessageBar,
  MessageBarType,
  Dialog,
  DialogType,
  DialogFooter,
  Dropdown,
  IDropdownOption,
  TextField,
  Panel,
  PanelType,
} from "@fluentui/react";
import { GatewayListItem } from "../../types";
import { createBackup, getBackup, getBackups, restoreBackup, deleteBackup, compareBackupWithLive } from "../../services/api";

interface Props {
  gateways: GatewayListItem[];
  selectedSubscription: string;
  onRefresh: () => void;
}

interface BackupItem {
  id: string;
  gatewayName: string;
  resourceGroup: string;
  location: string;
  createdAt: string;
  createdBy: string;
  description: string;
  sku: string;
}

export const BackupSection: React.FC<Props> = ({ gateways, selectedSubscription, onRefresh }) => {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create backup
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [backupGw, setBackupGw] = useState("");
  const [backupDesc, setBackupDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Restore dialog
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [restoreId, setRestoreId] = useState("");
  const [restoreName, setRestoreName] = useState("");
  const [restoring, setRestoring] = useState(false);

  // Compare dialog
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [compareResult, setCompareResult] = useState<any>(null);
  const [comparing, setComparing] = useState(false);
  const [compareBackupName, setCompareBackupName] = useState("");

  // View config panel
  const [viewPanel, setViewPanel] = useState<{ open: boolean; name: string; loading: boolean; data: any }>({
    open: false, name: "", loading: false, data: null,
  });

  const handleViewBackup = async (b: BackupItem) => {
    setViewPanel({ open: true, name: b.gatewayName, loading: true, data: null });
    try {
      const full = await getBackup(b.id);
      setViewPanel({ open: true, name: b.gatewayName, loading: false, data: full });
    } catch {
      setViewPanel((prev) => ({ ...prev, loading: false, data: { error: true } }));
    }
  };

  const loadBackups = async () => {
    setLoading(true);
    try {
      const data = await getBackups(selectedSubscription);
      setBackups(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSubscription) loadBackups();
  }, [selectedSubscription]);

  const handleCreate = async () => {
    const gw = gateways.find((g) => g.name === backupGw);
    if (!gw) return;
    setCreating(true);
    setError("");
    try {
      await createBackup({
        subscriptionId: selectedSubscription,
        resourceGroup: gw.resourceGroup,
        gatewayName: gw.name,
        description: backupDesc || undefined,
      });
      setSuccess(`Backup created for "${gw.name}"`);
      setShowCreateDialog(false);
      setBackupGw("");
      setBackupDesc("");
      loadBackups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create backup");
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    setError("");
    try {
      const res = await restoreBackup(restoreId);
      const steps = res?.steps?.join(" → ") || "";
      setSuccess(`Restore of "${restoreName}" started! ${steps}`);
      setShowRestoreDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore");
    } finally {
      setRestoring(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBackup(id);
      loadBackups();
    } catch {}
  };

  const handleCompareWithLive = async (backup: BackupItem) => {
    setComparing(true);
    setCompareBackupName(backup.gatewayName);
    setShowCompareDialog(true);
    try {
      const result = await compareBackupWithLive(backup.id);
      setCompareResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to compare");
      setShowCompareDialog(false);
    } finally {
      setComparing(false);
    }
  };

  const gwOptions: IDropdownOption[] = gateways.map((g) => ({
    key: g.name, text: `${g.name} (${g.resourceGroup})`,
  }));

  return (
    <div>
      {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError("")} styles={{ root: { marginBottom: 8 } }}>{error}</MessageBar>}
      {success && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSuccess("")} styles={{ root: { marginBottom: 8 } }}>{success}</MessageBar>}

      <Stack horizontal horizontalAlign="end" styles={{ root: { marginBottom: 12 } }}>
        <PrimaryButton
          text="Create Backup"
          iconProps={{ iconName: "CloudUpload" }}
          onClick={() => setShowCreateDialog(true)}
          styles={{ root: { borderRadius: 6 } }}
        />
      </Stack>

      {loading ? (
        <Spinner label="Loading backups..." />
      ) : backups.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: 30 }}>
            <h3>No backups yet</h3>
            <p>Create a backup to save your gateway's full configuration for disaster recovery</p>
            <PrimaryButton text="Create Backup" iconProps={{ iconName: "CloudUpload" }} onClick={() => setShowCreateDialog(true)} styles={{ root: { borderRadius: 6, marginTop: 8 } }} />
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #edebe9", textAlign: "left" }}>
                <th style={{ padding: "10px 16px" }}>Gateway</th>
                <th style={{ padding: "10px 16px" }}>Description</th>
                <th style={{ padding: "10px 16px" }}>SKU</th>
                <th style={{ padding: "10px 16px" }}>Region</th>
                <th style={{ padding: "10px 16px" }}>Backup Date</th>
                <th style={{ padding: "10px 16px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id} style={{ borderBottom: "1px solid #edebe9" }}>
                  <td style={{ padding: "10px 16px", fontWeight: 600 }}>{b.gatewayName}</td>
                  <td style={{ padding: "10px 16px", color: "#605e5c", fontSize: 13 }}>{b.description}</td>
                  <td style={{ padding: "10px 16px" }}><span className="template-component-count">{b.sku}</span></td>
                  <td style={{ padding: "10px 16px", fontSize: 13 }}>{b.location}</td>
                  <td style={{ padding: "10px 16px", fontSize: 13 }}>
                    {new Date(b.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <Stack horizontal tokens={{ childrenGap: 6 }}>
                      <DefaultButton
                        text="View"
                        iconProps={{ iconName: "View" }}
                        styles={{ root: { borderRadius: 6, minWidth: 0, padding: "0 10px", height: 28, fontSize: 12 } }}
                        onClick={() => handleViewBackup(b)}
                      />
                      <PrimaryButton
                        text="Restore"
                        styles={{ root: { borderRadius: 6, minWidth: 0, padding: "0 10px", height: 28, fontSize: 12 } }}
                        onClick={() => { setRestoreId(b.id); setRestoreName(b.gatewayName); setShowRestoreDialog(true); }}
                      />
                      <DefaultButton
                        text="Compare"
                        styles={{ root: { borderRadius: 6, minWidth: 0, padding: "0 10px", height: 28, fontSize: 12 } }}
                        onClick={() => handleCompareWithLive(b)}
                      />
                      <DefaultButton
                        text="Delete"
                        styles={{ root: { borderRadius: 6, minWidth: 0, padding: "0 10px", height: 28, fontSize: 12, color: "#d13438", borderColor: "#d13438" } }}
                        onClick={() => handleDelete(b.id)}
                      />
                    </Stack>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* View Backup Panel */}
      <Panel
        isOpen={viewPanel.open}
        onDismiss={() => setViewPanel({ open: false, name: "", loading: false, data: null })}
        headerText={`Backup: ${viewPanel.name}`}
        type={PanelType.large}
      >
        {viewPanel.loading ? (
          <Spinner label="Loading backup configuration..." styles={{ root: { marginTop: 20 } }} />
        ) : viewPanel.data?.error ? (
          <MessageBar messageBarType={MessageBarType.error} styles={{ root: { marginTop: 20 } }}>Failed to load backup</MessageBar>
        ) : viewPanel.data ? (
          <Stack tokens={{ childrenGap: 16 }} styles={{ root: { padding: "16px 0" } }}>
            {/* Meta info */}
            <div style={{ background: "#f3f2f1", borderRadius: 8, padding: 16 }}>
              <Stack horizontal tokens={{ childrenGap: 32 }} wrap>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Gateway</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{viewPanel.data.gatewayName}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Resource Group</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{viewPanel.data.resourceGroup}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Location</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{viewPanel.data.location}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>SKU</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{viewPanel.data.sku}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Created</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{new Date(viewPanel.data.createdAt).toLocaleString()}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Description</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{viewPanel.data.description}</Text></div>
              </Stack>
            </div>

            {/* Infrastructure references */}
            {viewPanel.data.infra && (
              <div style={{ background: "#e8f4fd", borderRadius: 8, padding: 16, border: "1px solid #0078d4" }}>
                <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block", color: "#0078d4" } }}>Infrastructure References</Text>
                <Stack horizontal tokens={{ childrenGap: 24 }} wrap>
                  <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>VNet:</Text> <Text styles={{ root: { fontWeight: 600 } }}>{viewPanel.data.infra.vnetName || "—"}</Text></div>
                  <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Subnet:</Text> <Text styles={{ root: { fontWeight: 600 } }}>{viewPanel.data.infra.subnetName || "—"}</Text></div>
                  <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Public IP:</Text> <Text styles={{ root: { fontWeight: 600 } }}>{viewPanel.data.infra.publicIpName || "—"}</Text></div>
                </Stack>
              </div>
            )}

            {/* Component counts */}
            {viewPanel.data.config && (
              <Stack horizontal tokens={{ childrenGap: 12 }} wrap>
                {[
                  { label: "Backend Pools", count: viewPanel.data.config.backendAddressPools?.length || 0, color: "#0078d4" },
                  { label: "HTTP Settings", count: viewPanel.data.config.backendHttpSettingsCollection?.length || 0, color: "#8764b8" },
                  { label: "Listeners", count: viewPanel.data.config.httpListeners?.length || 0, color: "#107c10" },
                  { label: "Rules", count: viewPanel.data.config.requestRoutingRules?.length || 0, color: "#ca5010" },
                  { label: "Probes", count: viewPanel.data.config.probes?.length || 0, color: "#005b70" },
                  { label: "Frontend Ports", count: viewPanel.data.config.frontendPorts?.length || 0, color: "#4f6bed" },
                  { label: "SSL Certs", count: viewPanel.data.config.sslCertificates?.length || 0, color: "#d83b01" },
                ].map((s) => (
                  <div key={s.label} style={{ background: "white", border: "1px solid #edebe9", borderRadius: 8, padding: "10px 20px", textAlign: "center", minWidth: 100 }}>
                    <Text styles={{ root: { fontSize: 24, fontWeight: 700, color: s.color, display: "block" } }}>{s.count}</Text>
                    <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{s.label}</Text>
                  </div>
                ))}
              </Stack>
            )}

            {/* Backend Pools */}
            {viewPanel.data.config?.backendAddressPools?.length > 0 && (
              <div style={{ background: "#faf9f8", borderRadius: 8, padding: 16, border: "1px solid #edebe9" }}>
                <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block" } }}>Backend Pools</Text>
                <Stack tokens={{ childrenGap: 6 }}>
                  {viewPanel.data.config.backendAddressPools.map((pool: any, i: number) => (
                    <div key={i} style={{ background: "white", borderRadius: 6, padding: "8px 12px", border: "1px solid #edebe9" }}>
                      <Text styles={{ root: { fontWeight: 600 } }}>{pool.name}</Text>
                      {pool.properties?.backendAddresses?.length > 0 && (
                        <Text variant="small" styles={{ root: { color: "#605e5c", marginLeft: 12 } }}>
                          {pool.properties.backendAddresses.map((a: any) => a.fqdn || a.ipAddress).join(", ")}
                        </Text>
                      )}
                    </div>
                  ))}
                </Stack>
              </div>
            )}

            {/* Listeners */}
            {viewPanel.data.config?.httpListeners?.length > 0 && (
              <div style={{ background: "#faf9f8", borderRadius: 8, padding: 16, border: "1px solid #edebe9" }}>
                <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block" } }}>HTTP Listeners</Text>
                <Stack tokens={{ childrenGap: 6 }}>
                  {viewPanel.data.config.httpListeners.map((l: any, i: number) => (
                    <Stack key={i} horizontal tokens={{ childrenGap: 16 }} style={{ background: "white", borderRadius: 6, padding: "8px 12px", border: "1px solid #edebe9" }}>
                      <Text styles={{ root: { fontWeight: 600, minWidth: 160 } }}>{l.name}</Text>
                      <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{l.properties?.protocol || "—"}</Text>
                      {l.properties?.hostName && <Text variant="small" styles={{ root: { fontFamily: "monospace", color: "#0078d4" } }}>{l.properties.hostName}</Text>}
                    </Stack>
                  ))}
                </Stack>
              </div>
            )}

            {/* Routing Rules */}
            {viewPanel.data.config?.requestRoutingRules?.length > 0 && (
              <div style={{ background: "#faf9f8", borderRadius: 8, padding: 16, border: "1px solid #edebe9" }}>
                <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block" } }}>Routing Rules</Text>
                <Stack tokens={{ childrenGap: 6 }}>
                  {viewPanel.data.config.requestRoutingRules.map((r: any, i: number) => (
                    <Stack key={i} horizontal tokens={{ childrenGap: 16 }} style={{ background: "white", borderRadius: 6, padding: "8px 12px", border: "1px solid #edebe9" }}>
                      <Text styles={{ root: { fontWeight: 600, minWidth: 160 } }}>{r.name}</Text>
                      <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{r.properties?.ruleType || "Basic"}</Text>
                      {r.properties?.priority && <Text variant="small" styles={{ root: { color: "#a19f9d" } }}>priority: {r.properties.priority}</Text>}
                    </Stack>
                  ))}
                </Stack>
              </div>
            )}

            {/* Full JSON */}
            <div>
              <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block" } }}>Full Configuration (JSON)</Text>
              <pre style={{
                background: "#1e1e1e", color: "#d4d4d4", padding: 16, borderRadius: 8,
                fontSize: 12, fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                maxHeight: 500, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {JSON.stringify(viewPanel.data.config, null, 2)}
              </pre>
            </div>
          </Stack>
        ) : null}
      </Panel>

      {/* Create Dialog */}
      <Dialog hidden={!showCreateDialog} onDismiss={() => setShowCreateDialog(false)}
        dialogContentProps={{ type: DialogType.normal, title: "Create Gateway Backup", subText: "Save the complete configuration of a gateway for disaster recovery." }}>
        <Stack tokens={{ childrenGap: 12 }}>
          <Dropdown label="Gateway" options={gwOptions} selectedKey={backupGw} onChange={(_, o) => setBackupGw(o?.key as string || "")} required />
          <TextField label="Description (optional)" value={backupDesc} onChange={(_, v) => setBackupDesc(v || "")} placeholder="e.g., Before major config change" />
        </Stack>
        <DialogFooter>
          <PrimaryButton text={creating ? "Creating..." : "Create Backup"} disabled={!backupGw || creating} onClick={handleCreate} />
          <DefaultButton text="Cancel" onClick={() => setShowCreateDialog(false)} />
        </DialogFooter>
      </Dialog>

      {/* Restore Dialog */}
      <Dialog hidden={!showRestoreDialog} onDismiss={() => setShowRestoreDialog(false)}
        dialogContentProps={{ type: DialogType.normal, title: "Restore Gateway", subText: `This will restore "${restoreName}" to the backed up configuration. An auto-backup of the current state will be created first. If the gateway was deleted, it will recreate the resource group, VNet, subnet, public IP, and gateway from scratch (5-10 min). Continue?` }}>
        <DialogFooter>
          <PrimaryButton text={restoring ? "Restoring..." : "Restore"} disabled={restoring} onClick={handleRestore} />
          <DefaultButton text="Cancel" onClick={() => setShowRestoreDialog(false)} />
        </DialogFooter>
      </Dialog>

      {/* Compare with Live Dialog */}
      <Dialog hidden={!showCompareDialog} onDismiss={() => { setShowCompareDialog(false); setCompareResult(null); }}
        dialogContentProps={{ type: DialogType.normal, title: `Compare: ${compareBackupName}`, subText: "Backup vs. Live Gateway Configuration" }}
        minWidth={560}>
        {comparing ? <Spinner label="Comparing..." /> : compareResult ? (
          <Stack tokens={{ childrenGap: 12 }}>
            <MessageBar messageBarType={compareResult.differences.length === 0 ? MessageBarType.success : MessageBarType.warning}>
              {compareResult.summary}
            </MessageBar>
            {compareResult.differences.length > 0 && (
              <div style={{ maxHeight: 300, overflow: "auto" }}>
                {compareResult.differences.map((d: any, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #edebe9" }}>
                    <span style={{
                      color: d.change === "added" || d.change === "in_live_only" ? "#107c10" : d.change === "removed" || d.change === "in_backup_only" ? "#d13438" : "#c19c00",
                      fontWeight: 700, marginRight: 8, width: 16, textAlign: "center",
                    }}>
                      {d.change === "added" || d.change === "in_live_only" ? "+" : d.change === "removed" || d.change === "in_backup_only" ? "−" : "~"}
                    </span>
                    <span style={{ background: "#f3f2f1", borderRadius: 4, padding: "1px 6px", fontSize: 11, fontWeight: 600, marginRight: 8, textTransform: "uppercase" }}>
                      {d.component}
                    </span>
                    <span style={{ fontSize: 13 }}>{d.name}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#605e5c" }}>{d.change}</span>
                  </div>
                ))}
              </div>
            )}
          </Stack>
        ) : null}
        <DialogFooter>
          <DefaultButton text="Close" onClick={() => { setShowCompareDialog(false); setCompareResult(null); }} />
        </DialogFooter>
      </Dialog>
    </div>
  );
};
