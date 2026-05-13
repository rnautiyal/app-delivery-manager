import React, { useState, useEffect, useCallback } from "react";
import {
  Stack,
  Text,
  Spinner,
  PrimaryButton,
  DefaultButton,
  MessageBar,
  MessageBarType,
  Dropdown,
  IDropdownOption,
  Dialog,
  DialogType,
  DialogFooter,
  TextField,
} from "@fluentui/react";
import {
  getFailoverGroups,
  getFailoverStatus,
  removeFailoverEndpoint,
  addFailoverEndpoint,
  triggerFailover,
  getFailoverHistory,
  runFailoverProbe,
  updateFailoverGroup,
} from "../../services/api";
import { FailoverGroup, FailoverStatus, FailoverHistoryEntry } from "../../types";

interface Props {
  subscriptionId: string;
}

export const FailoverSection: React.FC<Props> = ({ subscriptionId }) => {
  const [groups, setGroups] = useState<FailoverGroup[]>([]);
  const [statuses, setStatuses] = useState<Record<string, FailoverStatus>>({});
  const [history, setHistory] = useState<FailoverHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const handleModeToggle = async (groupId: string, currentMode: string) => {
    const newMode = currentMode === "active-active" ? "active-standby" : "active-active";
    if (!confirm(`Switch to ${newMode === "active-active" ? "Active/Active (round-robin)" : "Active/Standby (primary/standby)"}?`)) return;
    try {
      await updateFailoverGroup(groupId, { failoverMode: newMode as any });
      setSuccess(`Switched to ${newMode}`);
      await loadData();
    } catch {
      setError("Failed to switch mode");
    }
  };

  const handleAutoToggle = async (groupId: string, current: boolean) => {
    try {
      await updateFailoverGroup(groupId, { autoFailover: !current });
      setSuccess(`Auto-failover ${!current ? "enabled" : "disabled"}`);
      await loadData();
    } catch {
      setError("Failed to toggle auto-failover");
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [grps, hist] = await Promise.all([
        getFailoverGroups(),
        getFailoverHistory(undefined, 10),
      ]);
      setGroups(grps);
      setHistory(hist);

      // Load status for each group
      const statusMap: Record<string, FailoverStatus> = {};
      for (const g of grps) {
        try {
          statusMap[g.id] = await getFailoverStatus(g.id);
        } catch {
          // skip
        }
      }
      setStatuses(statusMap);
    } catch {
      setError("Failed to load failover data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleProbe = async () => {
    setProbing(true);
    setError("");
    try {
      await runFailoverProbe();
      setSuccess("Probe check completed");
      await loadData();
    } catch {
      setError("Probe check failed");
    } finally {
      setProbing(false);
    }
  };

  const handleRemoveEndpoint = async (groupId: string, ip: string, label: string) => {
    if (!confirm(`Remove ${ip} (${label}) from DNS? This will stop traffic to this endpoint.`)) return;
    setActionLoading(ip);
    try {
      await removeFailoverEndpoint(groupId, ip, `Manual removal of ${label}`);
      setSuccess(`Removed ${ip} from DNS`);
      await loadData();
    } catch {
      setError(`Failed to remove ${ip}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddEndpoint = async (groupId: string, ip: string, label: string) => {
    setActionLoading(ip);
    try {
      await addFailoverEndpoint(groupId, ip, `Manual addition of ${label}`);
      setSuccess(`Added ${ip} back to DNS`);
      await loadData();
    } catch {
      setError(`Failed to add ${ip}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleFailover = async (groupId: string, targetIp: string, label: string) => {
    if (!confirm(`Failover all traffic to ${label} (${targetIp})? This will remove all other IPs from DNS.`)) return;
    setActionLoading(targetIp);
    try {
      await triggerFailover(groupId, targetIp);
      setSuccess(`Failed over to ${label}`);
      await loadData();
    } catch {
      setError(`Failover failed`);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return <Spinner label="Loading failover groups..." />;

  if (groups.length === 0) {
    return (
      <div className="card" style={{ padding: 20, textAlign: "center" }}>
        <Text styles={{ root: { color: "#605e5c" } }}>No failover groups configured. Use AppDelivery Genie to create one.</Text>
      </div>
    );
  }

  const modeColors = {
    "active-active": { bg: "#dff6dd", color: "#107c10", label: "Active/Active" },
    degraded: { bg: "#fed9cc", color: "#d13438", label: "Degraded" },
    single: { bg: "#fff4ce", color: "#c19c00", label: "Single Endpoint" },
  };

  return (
    <div>
      {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError("")} styles={{ root: { marginBottom: 8 } }}>{error}</MessageBar>}
      {success && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSuccess("")} styles={{ root: { marginBottom: 8 } }}>{success}</MessageBar>}

      <Stack horizontal tokens={{ childrenGap: 8 }} styles={{ root: { marginBottom: 12 } }}>
        <PrimaryButton
          text={probing ? "Probing..." : "Run Health Probe"}
          iconProps={{ iconName: "Heart" }}
          disabled={probing}
          onClick={handleProbe}
          styles={{ root: { borderRadius: 6 } }}
        />
        <DefaultButton
          text={showHistory ? "Hide History" : "Show History"}
          iconProps={{ iconName: "History" }}
          onClick={() => setShowHistory(!showHistory)}
          styles={{ root: { borderRadius: 6 } }}
        />
        <DefaultButton
          text="Refresh"
          iconProps={{ iconName: "Refresh" }}
          onClick={loadData}
          styles={{ root: { borderRadius: 6 } }}
        />
      </Stack>

      {groups.map((group) => {
        const status = statuses[group.id];
        const modeInfo = status ? modeColors[status.mode] : modeColors["active-active"];

        return (
          <div key={group.id} className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 12 }}>
            {/* Header */}
            <div style={{
              padding: "12px 16px",
              background: "linear-gradient(135deg, #f0f8ff 0%, #faf9f8 100%)",
              borderBottom: "1px solid #edebe9",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div>
                <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
                  <Text styles={{ root: { fontWeight: 700, fontSize: 16 } }}>� {group.name}</Text>
                  <span style={{
                    background: modeInfo.bg, color: modeInfo.color,
                    borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600,
                  }}>
                    {modeInfo.label}
                  </span>
                  <span style={{
                    background: group.failoverMode === "active-active" ? "#e8f4fd" : "#f3eef9",
                    color: group.failoverMode === "active-active" ? "#0078d4" : "#8764b8",
                    borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600,
                  }}>
                    {group.failoverMode === "active-active" ? "Round-Robin" : "Primary/Standby"}
                  </span>
                </Stack>
                <Text variant="small" styles={{ root: { color: "#605e5c", marginTop: 2 } }}>
                  {group.recordName}.{group.dnsZone} • TTL: {group.ttlSeconds}s • Probe: {group.probeIntervalSeconds}s • Auto: {group.autoFailover ? "ON" : "OFF"}
                </Text>
              </div>
              {status && (
                <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
                  <Text styles={{ root: { color: "#605e5c", fontSize: 12 } }}>
                    DNS: {status.activeIps.join(", ")}
                  </Text>
                  <DefaultButton
                    text={group.failoverMode === "active-active" ? "→ Standby" : "→ Active/Active"}
                    iconProps={{ iconName: "Switch" }}
                    onClick={() => handleModeToggle(group.id, group.failoverMode)}
                    styles={{ root: { borderRadius: 4, fontSize: 11, height: 26, minWidth: 0 } }}
                  />
                  <DefaultButton
                    text={group.autoFailover ? "Auto: ON" : "Auto: OFF"}
                    iconProps={{ iconName: group.autoFailover ? "CheckboxComposite" : "Checkbox" }}
                    onClick={() => handleAutoToggle(group.id, group.autoFailover)}
                    styles={{
                      root: {
                        borderRadius: 4, fontSize: 11, height: 26, minWidth: 0,
                        background: group.autoFailover ? "#dff6dd" : "#fff4ce",
                        borderColor: group.autoFailover ? "#107c10" : "#c19c00",
                      },
                    }}
                  />
                </Stack>
              )}
            </div>

            {/* Endpoints */}
            <div style={{ padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                {group.endpoints.map((ep) => {
                  const epHealth = status?.endpointHealth.find((h) => h.ip === ep.ip);
                  const isHealthy = epHealth?.healthy ?? true;
                  const isInDns = epHealth?.inDns ?? true;
                  const isLoading = actionLoading === ep.ip;

                  return (
                    <div key={ep.ip} style={{
                      border: `2px solid ${isHealthy && isInDns ? "#107c10" : !isHealthy ? "#d13438" : "#c19c00"}`,
                      borderRadius: 8,
                      padding: 12,
                      background: isHealthy && isInDns
                        ? "linear-gradient(135deg, #f1faf1 0%, #ffffff 100%)"
                        : !isHealthy
                          ? "linear-gradient(135deg, #fef0ee 0%, #ffffff 100%)"
                          : "linear-gradient(135deg, #fff8e6 0%, #ffffff 100%)",
                    }}>
                      <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                        <span style={{
                          width: 10, height: 10, borderRadius: "50%",
                          background: isHealthy ? "#107c10" : "#d13438",
                          display: "inline-block",
                        }} />
                        <Text styles={{ root: { fontWeight: 700, fontSize: 14 } }}>{ep.label}</Text>
                        {group.failoverMode === "active-standby" && (
                          <span style={{
                            background: ep.priority === 1 ? "#0078d4" : "#605e5c",
                            color: "white", borderRadius: 4, padding: "1px 6px", fontSize: 10,
                          }}>
                            {ep.priority === 1 ? "PRIMARY" : "STANDBY"}
                          </span>
                        )}
                      </Stack>

                      <div style={{ marginTop: 8, fontSize: 12, color: "#323130" }}>
                        <div><strong>Gateway:</strong> {ep.appGateway}</div>
                        <div><strong>IP:</strong> {ep.ip}</div>
                        <div><strong>Region:</strong> {ep.region}</div>
                        <div><strong>State:</strong> {epHealth?.operationalState || "Unknown"}</div>
                        <div>
                          <strong>In DNS:</strong>{" "}
                          <span style={{ color: isInDns ? "#107c10" : "#d13438", fontWeight: 600 }}>
                            {isInDns ? "Yes ✓" : "No ✗"}
                          </span>
                        </div>
                      </div>

                      <Stack horizontal tokens={{ childrenGap: 6 }} styles={{ root: { marginTop: 10 } }}>
                        {isInDns ? (
                          <DefaultButton
                            text="Remove from DNS"
                            iconProps={{ iconName: "Remove" }}
                            disabled={isLoading}
                            onClick={() => handleRemoveEndpoint(group.id, ep.ip, ep.label)}
                            styles={{ root: { borderRadius: 4, fontSize: 11, height: 28 } }}
                          />
                        ) : (
                          <PrimaryButton
                            text="Add to DNS"
                            iconProps={{ iconName: "Add" }}
                            disabled={isLoading}
                            onClick={() => handleAddEndpoint(group.id, ep.ip, ep.label)}
                            styles={{ root: { borderRadius: 4, fontSize: 11, height: 28 } }}
                          />
                        )}
                        <DefaultButton
                          text="Failover Here"
                          iconProps={{ iconName: "Switch" }}
                          disabled={isLoading || !isHealthy}
                          onClick={() => handleFailover(group.id, ep.ip, ep.label)}
                          styles={{ root: { borderRadius: 4, fontSize: 11, height: 28 } }}
                        />
                      </Stack>
                    </div>
                  );
                })}
              </div>

              {/* Last failover info */}
              {status?.lastFailover && (
                <div style={{
                  marginTop: 12, padding: "8px 12px", background: "#faf9f8",
                  borderRadius: 6, borderLeft: "3px solid #0078d4", fontSize: 12,
                }}>
                  <strong>Last event:</strong> {status.lastFailover.action} — {status.lastFailover.reason}
                  <br />
                  <span style={{ color: "#605e5c" }}>
                    {new Date(status.lastFailover.timestamp).toLocaleString()} • by {status.lastFailover.triggeredBy}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* History panel */}
      {showHistory && history.length > 0 && (
        <div className="card" style={{ marginTop: 8 }}>
          <Text styles={{ root: { fontWeight: 700, fontSize: 14, marginBottom: 8, display: "block" } }}>
            Failover History
          </Text>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {history.map((h) => (
              <div key={h.id} style={{
                padding: "6px 10px", borderBottom: "1px solid #edebe9",
                display: "flex", alignItems: "center", gap: 10, fontSize: 12,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: h.action === "ip_removed" || h.action === "auto_failover" || h.action === "manual_failover"
                    ? "#d13438" : "#107c10",
                }} />
                <div style={{ flex: 1 }}>
                  <strong>{h.action}</strong> — {h.ip} ({h.appGateway})
                  <br />
                  <span style={{ color: "#605e5c" }}>{h.reason}</span>
                </div>
                <span style={{ color: "#a19f9d", fontSize: 11, whiteSpace: "nowrap" }}>
                  {new Date(h.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
