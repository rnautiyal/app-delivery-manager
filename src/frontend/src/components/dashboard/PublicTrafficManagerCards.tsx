import React, { useState } from "react";
import {
  Stack,
  Text,
  PrimaryButton,
  DefaultButton,
  MessageBar,
  MessageBarType,
} from "@fluentui/react";
import { TrafficManagerProfile } from "../../types";
import {
  enableTrafficManagerProfile,
  disableTrafficManagerProfile,
  enableTrafficManagerEndpoint,
  disableTrafficManagerEndpoint,
  updateTmRoutingMethod,
  checkAndFailover,
} from "../../services/api";

interface Props {
  profiles: TrafficManagerProfile[];
  subscriptionId: string;
  onRefresh: () => void;
}

export const PublicTrafficManagerCards: React.FC<Props> = ({ profiles, subscriptionId, onRefresh }) => {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleModeToggle = async (p: TrafficManagerProfile) => {
    const newMethod = p.trafficRoutingMethod === "Priority" ? "Weighted" : "Priority";
    const label = newMethod === "Weighted" ? "Active/Active (Weighted)" : "Active/Standby (Priority)";
    if (!confirm(`Switch "${p.name}" to ${label}?`)) return;
    setActionLoading(p.id);
    try {
      await updateTmRoutingMethod(p.subscriptionId, p.resourceGroup, p.name, newMethod);
      setSuccess(`Switched to ${label}`);
      onRefresh();
    } catch {
      setError("Failed to switch mode");
    } finally {
      setActionLoading(null);
    }
  };

  const handleEndpointToggle = async (p: TrafficManagerProfile, ep: any, enable: boolean) => {
    setActionLoading(ep.id);
    try {
      const epType = ep.type?.split("/").pop() || ep.id?.split("/")[10] || "ExternalEndpoints";
      if (enable) {
        await enableTrafficManagerEndpoint(p.subscriptionId, p.resourceGroup, p.name, epType, ep.name);
      } else {
        await disableTrafficManagerEndpoint(p.subscriptionId, p.resourceGroup, p.name, epType, ep.name);
      }
      setSuccess(`Endpoint ${ep.name} ${enable ? "enabled" : "disabled"}`);
      onRefresh();
    } catch {
      setError(`Failed to ${enable ? "enable" : "disable"} endpoint`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckFailover = async (p: TrafficManagerProfile) => {
    setActionLoading(p.id);
    try {
      const result = await checkAndFailover(p.subscriptionId, p.resourceGroup, p.name);
      if (result.action === "failover_executed") {
        setSuccess(`Failover executed: enabled ${result.enabledEndpoints?.join(", ")}`);
        onRefresh();
      } else {
        setSuccess("All endpoints healthy — no failover needed");
      }
    } catch {
      setError("Failover check failed");
    } finally {
      setActionLoading(null);
    }
  };

  const routingModeLabel = (method: string) => {
    switch (method) {
      case "Priority": return { label: "Active/Standby", color: "#8764b8", bg: "#f3eef9" };
      case "Weighted": return { label: "Active/Active", color: "#0078d4", bg: "#e8f4fd" };
      case "Performance": return { label: "Performance", color: "#008272", bg: "#e6f7f5" };
      case "Geographic": return { label: "Geographic", color: "#5c2d91", bg: "#f3eef9" };
      default: return { label: method, color: "#605e5c", bg: "#f5f5f5" };
    }
  };

  const monitorStatusColor = (status: string) => {
    switch (status) {
      case "Online": return "#107c10";
      case "Degraded": return "#c19c00";
      case "CheckingEndpoint": return "#c19c00";
      default: return "#d13438";
    }
  };

  if (profiles.length === 0) {
    return (
      <div className="card" style={{ padding: 20, textAlign: "center" }}>
        <Text styles={{ root: { color: "#605e5c" } }}>No Traffic Manager profiles found</Text>
      </div>
    );
  }

  return (
    <div>
      {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError("")} styles={{ root: { marginBottom: 8 } }}>{error}</MessageBar>}
      {success && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSuccess("")} styles={{ root: { marginBottom: 8 } }}>{success}</MessageBar>}

      {profiles.map((p) => {
        const mode = routingModeLabel(p.trafficRoutingMethod);
        const monitorColor = monitorStatusColor(p.monitorConfig?.profileMonitorStatus);
        const healthyEps = p.endpoints.filter((e) => e.endpointMonitorStatus === "Online" || e.endpointMonitorStatus === "CheckingEndpoint").length;
        const totalEps = p.endpoints.length;
        const isDegraded = p.monitorConfig?.profileMonitorStatus === "Degraded";

        return (
          <div key={p.id} className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 12 }}>
            {/* Header */}
            <div style={{
              padding: "12px 16px",
              background: "linear-gradient(135deg, #faf9f8 0%, #f0f8ff 100%)",
              borderBottom: "1px solid #edebe9",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div>
                <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
                  <Text styles={{ root: { fontWeight: 700, fontSize: 16 } }}>🚦 {p.name}</Text>
                  <span style={{
                    background: isDegraded ? "#fed9cc" : healthyEps === totalEps ? "#dff6dd" : "#fff4ce",
                    color: isDegraded ? "#d13438" : healthyEps === totalEps ? "#107c10" : "#c19c00",
                    borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600,
                  }}>
                    {isDegraded ? "Degraded" : healthyEps === totalEps ? "Healthy" : `${healthyEps}/${totalEps} Online`}
                  </span>
                  <span style={{
                    background: mode.bg, color: mode.color,
                    borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600,
                  }}>
                    {mode.label}
                  </span>
                </Stack>
                <Text variant="small" styles={{ root: { color: "#605e5c", marginTop: 2 } }}>
                  {p.dnsConfig?.fqdn} • TTL: {p.dnsConfig?.ttl}s • Monitor: {p.monitorConfig?.protocol}:{p.monitorConfig?.port}{p.monitorConfig?.path}
                </Text>
              </div>
              <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
                <DefaultButton
                  text={p.trafficRoutingMethod === "Priority" ? "→ Active/Active" : "→ Active/Standby"}
                  iconProps={{ iconName: "Switch" }}
                  disabled={actionLoading === p.id || !["Priority", "Weighted"].includes(p.trafficRoutingMethod)}
                  onClick={() => handleModeToggle(p)}
                  styles={{ root: { borderRadius: 4, fontSize: 11, height: 26, minWidth: 0 } }}
                />
                <DefaultButton
                  text="Check Failover"
                  iconProps={{ iconName: "Heart" }}
                  disabled={actionLoading === p.id}
                  onClick={() => handleCheckFailover(p)}
                  styles={{ root: { borderRadius: 4, fontSize: 11, height: 26, minWidth: 0 } }}
                />
                {p.profileStatus === "Enabled" ? (
                  <DefaultButton
                    text="Disable"
                    disabled={actionLoading === p.id}
                    onClick={async () => {
                      if (!confirm(`Disable profile "${p.name}"?`)) return;
                      setActionLoading(p.id);
                      try { await disableTrafficManagerProfile(p.subscriptionId, p.resourceGroup, p.name); setSuccess("Profile disabled"); onRefresh(); }
                      catch { setError("Failed to disable"); }
                      finally { setActionLoading(null); }
                    }}
                    styles={{ root: { borderRadius: 4, fontSize: 11, height: 26, minWidth: 0, color: "#d13438" } }}
                  />
                ) : (
                  <PrimaryButton
                    text="Enable"
                    disabled={actionLoading === p.id}
                    onClick={async () => {
                      setActionLoading(p.id);
                      try { await enableTrafficManagerProfile(p.subscriptionId, p.resourceGroup, p.name); setSuccess("Profile enabled"); onRefresh(); }
                      catch { setError("Failed to enable"); }
                      finally { setActionLoading(null); }
                    }}
                    styles={{ root: { borderRadius: 4, fontSize: 11, height: 26, minWidth: 0 } }}
                  />
                )}
              </Stack>
            </div>

            {/* Endpoints */}
            <div style={{ padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
                {p.endpoints.map((ep) => {
                  const isOnline = ep.endpointMonitorStatus === "Online" || ep.endpointMonitorStatus === "CheckingEndpoint";
                  const isEnabled = ep.endpointStatus === "Enabled";

                  return (
                    <div key={ep.id || ep.name} style={{
                      border: `2px solid ${isOnline && isEnabled ? "#107c10" : !isEnabled ? "#a19f9d" : "#d13438"}`,
                      borderRadius: 8,
                      padding: 12,
                      background: isOnline && isEnabled
                        ? "linear-gradient(135deg, #f1faf1 0%, #ffffff 100%)"
                        : !isEnabled
                          ? "linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%)"
                          : "linear-gradient(135deg, #fef0ee 0%, #ffffff 100%)",
                    }}>
                      <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                        <span style={{
                          width: 10, height: 10, borderRadius: "50%",
                          background: isOnline ? "#107c10" : !isEnabled ? "#a19f9d" : "#d13438",
                          display: "inline-block",
                        }} />
                        <Text styles={{ root: { fontWeight: 700, fontSize: 14 } }}>{ep.name}</Text>
                        {p.trafficRoutingMethod === "Priority" && ep.priority && (
                          <span style={{
                            background: ep.priority === 1 ? "#0078d4" : "#605e5c",
                            color: "white", borderRadius: 4, padding: "1px 6px", fontSize: 10,
                          }}>
                            P{ep.priority}
                          </span>
                        )}
                        {p.trafficRoutingMethod === "Weighted" && ep.weight !== undefined && (
                          <span style={{
                            background: "#0078d4", color: "white",
                            borderRadius: 4, padding: "1px 6px", fontSize: 10,
                          }}>
                            W:{ep.weight}
                          </span>
                        )}
                      </Stack>

                      <div style={{ marginTop: 8, fontSize: 12, color: "#323130" }}>
                        <div><strong>Target:</strong> {ep.target || ep.targetResourceId?.split("/").pop() || "-"}</div>
                        <div><strong>Status:</strong> {ep.endpointStatus}</div>
                        <div><strong>Monitor:</strong>{" "}
                          <span style={{ color: isOnline ? "#107c10" : "#d13438", fontWeight: 600 }}>
                            {ep.endpointMonitorStatus}
                          </span>
                        </div>
                        {ep.endpointLocation && <div><strong>Location:</strong> {ep.endpointLocation}</div>}
                      </div>

                      <Stack horizontal tokens={{ childrenGap: 6 }} styles={{ root: { marginTop: 10 } }}>
                        {isEnabled ? (
                          <DefaultButton
                            text="Disable"
                            iconProps={{ iconName: "StatusCircleBlock" }}
                            disabled={actionLoading === ep.id}
                            onClick={() => handleEndpointToggle(p, ep, false)}
                            styles={{ root: { borderRadius: 4, fontSize: 11, height: 28 } }}
                          />
                        ) : (
                          <PrimaryButton
                            text="Enable"
                            iconProps={{ iconName: "StatusCircleCheckmark" }}
                            disabled={actionLoading === ep.id}
                            onClick={() => handleEndpointToggle(p, ep, true)}
                            styles={{ root: { borderRadius: 4, fontSize: 11, height: 28 } }}
                          />
                        )}
                      </Stack>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
