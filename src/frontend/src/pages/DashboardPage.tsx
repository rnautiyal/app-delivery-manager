import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Spinner, PrimaryButton, DefaultButton, Stack, Dropdown, IDropdownOption } from "@fluentui/react";
import { useSubscriptions } from "../hooks/useSubscriptions";
import {
  getGateways,
  getExpiringCertificates,
  getTemplates,
  getBaselines,
  getAlertRules,
  getAlertHistory,
  getActivityLog,
  evaluateAlerts,
  getTrafficManagerProfiles,
  getAfdProfiles,
  getManagedGroups,
  getWafPolicies,
} from "../services/api";
import {
  GatewayListItem,
  CertificateInfo,
  ConfigTemplate,
  BaselineSnapshot,
  AlertRule,
  AlertHistoryEntry,
  ActivityLogEntry,
  TrafficManagerProfile,
  AfdProfile,
  ManagedGroup,
  WafPolicy,
} from "../types";

import { CommandCenterHeader } from "../components/dashboard/CommandCenterHeader";
import { SectionDivider } from "../components/dashboard/SectionDivider";
import { GatewayCardGrid } from "../components/dashboard/GatewayCardGrid";
import { HealthOverview } from "../components/dashboard/HealthOverview";
import { CertificateSection } from "../components/dashboard/CertificateSection";
import { TemplateCards } from "../components/dashboard/TemplateCards";
import { DriftOverview } from "../components/dashboard/DriftOverview";
import { AlertsSection } from "../components/dashboard/AlertsSection";
import { ActivityLogSection } from "../components/dashboard/ActivityLogSection";
import { QuickCreateGateway } from "../components/dashboard/QuickCreateGateway";
import { GatewayMap } from "../components/dashboard/GatewayMap";
import { BackupSection } from "../components/dashboard/BackupSection";
import { TrafficManagerSection } from "../components/dashboard/TrafficManagerSection";
import { ManagedGroupsSection } from "../components/dashboard/ManagedGroupsSection";
import { FailoverSection } from "../components/dashboard/FailoverSection";

export function DashboardPage() {
  const navigate = useNavigate();
  const { subscriptions, selectedSubscription, setSelectedSubscription, loading: subsLoading } = useSubscriptions();

  const [gateways, setGateways] = useState<GatewayListItem[]>([]);
  const [expiringCerts, setExpiringCerts] = useState<CertificateInfo[]>([]);
  const [templates, setTemplates] = useState<ConfigTemplate[]>([]);
  const [baselines, setBaselines] = useState<BaselineSnapshot[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [alertHistory, setAlertHistory] = useState<AlertHistoryEntry[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [trafficManagerProfiles, setTrafficManagerProfiles] = useState<TrafficManagerProfile[]>([]);
  const [afdProfiles, setAfdProfiles] = useState<AfdProfile[]>([]);
  const [managedGroups, setManagedGroups] = useState<ManagedGroup[]>([]);
  const [wafPolicies, setWafPolicies] = useState<WafPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedGateway, setExpandedGateway] = useState<string | null>(null);
  const [showGatewayGrid, setShowGatewayGrid] = useState(false);
  const [tileGroupBy, setTileGroupBy] = useState<string>("none");

  const tileGroupOptions: IDropdownOption[] = [
    { key: "none", text: "No Grouping" },
    { key: "resourceGroup", text: "Resource Group" },
    { key: "managedGroup", text: "Managed Group" },
    { key: "location", text: "Location" },
    { key: "status", text: "Status" },
    { key: "waf", text: "WAF Enabled/Disabled" },
  ];

  function getGatewayTileGroupKey(gw: GatewayListItem): string {
    switch (tileGroupBy) {
      case "resourceGroup": return gw.resourceGroup;
      case "managedGroup": {
        const mg = managedGroups.find(g => g.resources.gateways.includes(gw.id));
        return mg ? mg.name : "Unassigned";
      }
      case "location": return gw.location;
      case "status": return gw.operationalState || "Unknown";
      case "waf": return gw.wafEnabled ? "WAF Enabled" : "WAF Disabled";
      default: return "";
    }
  }

  function getGroupedGatewayTiles(): Map<string, GatewayListItem[]> {
    const groups = new Map<string, GatewayListItem[]>();
    for (const gw of gateways) {
      const key = getGatewayTileGroupKey(gw);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(gw);
    }
    return groups;
  }

  const loadData = useCallback(async () => {
    if (!selectedSubscription) return;
    setLoading(true);
    try {
      const [gws, certs, tmpls, bases, rules, hist, logs, tmProfiles, afdProfs, mGroups, wafPols] = await Promise.all([
        getGateways(selectedSubscription).catch(() => []),
        getExpiringCertificates(selectedSubscription, 30).catch(() => []),
        getTemplates().catch(() => []),
        getBaselines(selectedSubscription).catch(() => []),
        getAlertRules(selectedSubscription).catch(() => []),
        getAlertHistory(selectedSubscription, 50).catch(() => []),
        getActivityLog(selectedSubscription, 50).catch(() => []),
        getTrafficManagerProfiles(selectedSubscription).catch(() => []),
        getAfdProfiles(selectedSubscription).catch(() => []),
        getManagedGroups(selectedSubscription).catch(() => []),
        getWafPolicies(selectedSubscription).catch(() => []),
      ]);
      setGateways(gws);
      setExpiringCerts(certs);
      setTemplates(tmpls);
      setBaselines(bases);
      setAlertRules(rules);
      setAlertHistory(hist);
      setActivityLogs(logs);
      setTrafficManagerProfiles(tmProfiles);
      setAfdProfiles(afdProfs);
      setManagedGroups(mGroups);
      setWafPolicies(wafPols);
    } catch {
      // Individual sections handle their own errors
    } finally {
      setLoading(false);
    }
  }, [selectedSubscription]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = {
    total: gateways.length,
    running: gateways.filter((g) => g.operationalState === "Running").length,
    stopped: gateways.filter((g) => g.operationalState === "Stopped").length,
    wafEnabled: gateways.filter((g) => g.wafEnabled).length,
    wafDisabled: gateways.filter((g) => !g.wafEnabled).length,
    alerts: alertHistory.filter((h) => !h.acknowledged).length,
    driftChanges: 0,
    expiringCerts: expiringCerts.length,
    afdCount: afdProfiles.length,
    tmCount: trafficManagerProfiles.length,
  };

  return (
    <div className="page-container command-center">
      <CommandCenterHeader
        subscriptions={subscriptions}
        selectedSubscription={selectedSubscription || ""}
        onSubscriptionChange={setSelectedSubscription}
        subLoading={subsLoading}
        stats={stats}
      />

      {loading ? (
        <Spinner label="Loading command center..." styles={{ root: { marginTop: 40 } }} />
      ) : (
        <>
          {/* ============ ZONE 1: OBSERVE ============ */}
          <div className="zone-header">
            <span className="zone-tag">01 / OBSERVE</span>
            <h2 className="zone-title">Infrastructure Overview</h2>
            <p className="zone-subtitle">Real-time visibility into your global Application Gateway footprint</p>
          </div>

          <SectionDivider title="Managed Groups" emoji="🏗️" count={managedGroups.length} />
          <ManagedGroupsSection
            groups={managedGroups}
            gateways={gateways}
            wafPolicies={wafPolicies}
            trafficManagers={trafficManagerProfiles}
            afdProfiles={afdProfiles}
            subscriptionId={selectedSubscription}
            onRefresh={loadData}
          />

          <SectionDivider title="Global Footprint" emoji="🗺️" count={gateways.length} />
          <GatewayMap gateways={gateways} trafficManagerProfiles={trafficManagerProfiles} afdProfiles={afdProfiles} />

          <SectionDivider
            title="Application Gateways"
            emoji="🌐"
            count={gateways.length}
            action={
              <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="end">
                <Dropdown
                  selectedKey={tileGroupBy}
                  options={tileGroupOptions}
                  onChange={(_, opt) => setTileGroupBy(opt?.key as string || "none")}
                  styles={{ root: { minWidth: 160 }, dropdown: { borderRadius: 6 } }}
                />
                <DefaultButton
                  text={showGatewayGrid ? "Collapse" : "Expand"}
                  iconProps={{ iconName: showGatewayGrid ? "ChevronUp" : "ChevronDown" }}
                  onClick={() => setShowGatewayGrid(!showGatewayGrid)}
                  styles={{ root: { borderRadius: 6 } }}
                />
                <DefaultButton text="Refresh" iconProps={{ iconName: "Refresh" }} onClick={loadData}
                  styles={{ root: { borderRadius: 6 } }} />
              </Stack>
            }
          />

          {/* Summary tiles when collapsed */}
          {!showGatewayGrid && tileGroupBy === "none" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
              {gateways.map(gw => (
                <div key={gw.id} className="card" style={{ padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                  onClick={() => { setShowGatewayGrid(true); setExpandedGateway(gw.id); }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: gw.operationalState === "Running" ? "#107c10" : gw.operationalState === "Stopped" ? "#d13438" : "#c19c00"
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{gw.name}</div>
                    <div style={{ fontSize: 11, color: "#605e5c", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {gw.resourceGroup} • {gw.location}
                    </div>
                  </div>
                  {gw.wafEnabled && <span style={{ background: "#dff6dd", color: "#107c10", borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 600 }}>WAF</span>}
                </div>
              ))}
            </div>
          )}

          {/* Grouped tiles when a group-by is selected */}
          {!showGatewayGrid && tileGroupBy !== "none" && (
            <Stack tokens={{ childrenGap: 12 }}>
              {Array.from(getGroupedGatewayTiles().entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([groupName, groupGws]) => {
                  const running = groupGws.filter(g => g.operationalState === "Running").length;
                  const stopped = groupGws.filter(g => g.operationalState === "Stopped").length;
                  const wafOn = groupGws.filter(g => g.wafEnabled).length;
                  const mgColor = tileGroupBy === "managedGroup"
                    ? (managedGroups.find(g => g.name === groupName)?.color || "#605e5c")
                    : "#0078d4";
                  return (
                    <div key={groupName} className="card" style={{ padding: 0, overflow: "hidden", borderLeft: `3px solid ${mgColor}` }}>
                      <div style={{ padding: "10px 16px", background: "#faf9f8", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #edebe9" }}>
                        <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{groupName}</span>
                        <span style={{ fontSize: 11, color: "#605e5c" }}>{groupGws.length} gateways</span>
                        <span style={{ fontSize: 11, color: "#107c10" }}>▲ {running}</span>
                        {stopped > 0 && <span style={{ fontSize: 11, color: "#d13438" }}>▼ {stopped}</span>}
                        <span style={{ fontSize: 11, color: wafOn === groupGws.length ? "#107c10" : "#d83b01" }}>WAF {wafOn}/{groupGws.length}</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6, padding: 8 }}>
                        {groupGws.map(gw => (
                          <div key={gw.id} style={{ padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, borderRadius: 6, border: "1px solid #edebe9" }}
                            onClick={() => { setShowGatewayGrid(true); setExpandedGateway(gw.id); }}>
                            <span style={{
                              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                              background: gw.operationalState === "Running" ? "#107c10" : gw.operationalState === "Stopped" ? "#d13438" : "#c19c00"
                            }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 500, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{gw.name}</div>
                            </div>
                            {gw.wafEnabled && <span style={{ fontSize: 9, color: "#107c10", fontWeight: 600 }}>WAF</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </Stack>
          )}

          {/* Full card grid when expanded */}
          {showGatewayGrid && (
            <GatewayCardGrid
              gateways={gateways}
              expandedId={expandedGateway}
              onToggle={setExpandedGateway}
              selectedSubscription={selectedSubscription || ""}
              trafficManagerProfiles={trafficManagerProfiles}
            />
          )}

          {/* Front Door Profiles */}
          <SectionDivider title="Front Door (AFD)" emoji="🌍" count={afdProfiles.length}
            action={<DefaultButton text="Manage" iconProps={{ iconName: "Globe" }} onClick={() => navigate("/afd")} styles={{ root: { borderRadius: 6 } }} />}
          />
          {afdProfiles.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 24, color: "#605e5c" }}>No Front Door profiles found</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
              {afdProfiles.map(p => (
                <div key={p.id} className="card" style={{ padding: "14px 16px", cursor: "pointer", borderLeft: "3px solid #008272" }}
                  onClick={() => navigate("/afd")}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#008272", marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "#605e5c", marginBottom: 8 }}>{p.resourceGroup} • {p.location}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span className="status-badge status-running" style={{ fontSize: 10 }}>{p.sku}</span>
                    <span style={{ fontSize: 11, color: "#605e5c" }}>{p.endpointCount || 0} endpoints</span>
                    <span style={{ fontSize: 11, color: "#605e5c" }}>{p.customDomainCount || 0} domains</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Public Traffic Manager */}
          <SectionDivider title="Public Traffic Manager" emoji="🚦" count={trafficManagerProfiles.length}
            action={<DefaultButton text="Manage" iconProps={{ iconName: "BranchFork2" }} onClick={() => navigate("/traffic-manager")} styles={{ root: { borderRadius: 6 } }} />}
          />
          {trafficManagerProfiles.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 24, color: "#605e5c" }}>No Traffic Manager profiles found</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
              {trafficManagerProfiles.map(p => (
                <div key={p.id} className="card" style={{ padding: "14px 16px", cursor: "pointer", borderLeft: "3px solid #5c2d91" }}
                  onClick={() => navigate("/traffic-manager")}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#5c2d91", marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "#605e5c", marginBottom: 8 }}>{p.resourceGroup} • {p.dnsConfig?.fqdn}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ background: "#5c2d91", color: "white", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>{p.trafficRoutingMethod}</span>
                    <span className={`status-badge ${p.profileStatus === "Enabled" ? "status-running" : "status-stopped"}`} style={{ fontSize: 10 }}>{p.profileStatus}</span>
                    <span className={`status-badge ${p.monitorConfig?.profileMonitorStatus === "Online" ? "status-running" : p.monitorConfig?.profileMonitorStatus === "Degraded" ? "status-warning" : "status-stopped"}`} style={{ fontSize: 10 }}>{p.monitorConfig?.profileMonitorStatus}</span>
                    <span style={{ fontSize: 11, color: "#605e5c" }}>{p.endpoints?.length || 0} endpoints</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Private Traffic Manager (DNS Failover) */}
          <SectionDivider title="Private Traffic Manager" emoji="🔒" />
          <FailoverSection subscriptionId={selectedSubscription || ""} />

          {/* ============ ZONE 2: OPERATE ============ */}
          <div className="zone-header">
            <span className="zone-tag" style={{ background: "#107c10" }}>02 / OPERATE</span>
            <h2 className="zone-title">Self-Service Operations</h2>
            <p className="zone-subtitle">Provision, configure, and manage gateways with zero Azure Portal clicks</p>
          </div>

          <SectionDivider title="Quick Provision" emoji="🚀" />
          <QuickCreateGateway
            selectedSubscription={selectedSubscription || ""}
            onComplete={loadData}
          />

          <SectionDivider title="Configuration Templates" emoji="📋" count={templates.length} />
          <TemplateCards
            templates={templates}
            gateways={gateways}
            selectedSubscription={selectedSubscription || ""}
            onRefresh={loadData}
          />

          <SectionDivider title="SSL Certificate Management" emoji="🔐" />
          <CertificateSection
            gateways={gateways}
            selectedSubscription={selectedSubscription || ""}
          />

          <SectionDivider title="Backup & Disaster Recovery" emoji="💾" />
          <BackupSection
            gateways={gateways}
            selectedSubscription={selectedSubscription || ""}
            onRefresh={loadData}
          />

          {/* ============ ZONE 3: GOVERN ============ */}
          <div className="zone-header">
            <span className="zone-tag" style={{ background: "#8764b8" }}>03 / GOVERN</span>
            <h2 className="zone-title">Compliance & Monitoring</h2>
            <p className="zone-subtitle">Track changes, enforce policies, and audit every action</p>
          </div>

          <SectionDivider
            title="Configuration Drift Detection"
            emoji="🔍"
            count={baselines.length}
            action={
              <PrimaryButton text="Manage Baselines" iconProps={{ iconName: "Camera" }}
                styles={{ root: { borderRadius: 6 } }}
                onClick={() => navigate("/drift")} />
            }
          />
          <DriftOverview
            baselines={baselines}
            gateways={gateways}
            selectedSubscription={selectedSubscription || ""}
            onRefresh={loadData}
          />

          <SectionDivider
            title="Alerts & Notifications"
            emoji="🔔"
            count={alertHistory.filter((h) => !h.acknowledged).length}
            action={
              <PrimaryButton text="Evaluate Now" iconProps={{ iconName: "Play" }}
                onClick={async () => {
                  if (selectedSubscription) {
                    await evaluateAlerts(selectedSubscription);
                    loadData();
                  }
                }}
                styles={{ root: { borderRadius: 6 } }} />
            }
          />
          <AlertsSection
            rules={alertRules}
            history={alertHistory}
            selectedSubscription={selectedSubscription || ""}
            onRefresh={loadData}
          />

          <SectionDivider title="Audit Trail" emoji="📝" count={activityLogs.length} />
          <ActivityLogSection logs={activityLogs} />

          {/* Footer */}
          <div style={{ marginTop: 48, padding: 24, textAlign: "center", color: "#a19f9d", fontSize: 12, borderTop: "1px solid #edebe9" }}>
            AppGW Manager — AI-Powered Azure Application Gateway Platform | Powered by Claude AI
          </div>
        </>
      )}
    </div>
  );
}
