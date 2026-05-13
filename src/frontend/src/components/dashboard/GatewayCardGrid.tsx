import React, { useState, useEffect } from "react";
import { Stack, Text, DefaultButton, PrimaryButton, Panel, PanelType, Spinner, Pivot, PivotItem } from "@fluentui/react";
import { GatewayListItem, TrafficManagerProfile } from "../../types";
import { GatewayExpandedCard } from "./GatewayExpandedCard";
import { getWafPolicies, getWafPolicyDetail, checkDdosProtection, enableDdosProtection, disableDdosProtection, enableVnetEncryption, disableVnetEncryption } from "../../services/api";
import { TrafficManagerSection } from "./TrafficManagerSection";

interface Props {
  gateways: GatewayListItem[];
  expandedId: string | null;
  onToggle: (id: string | null) => void;
  selectedSubscription: string;
  trafficManagerProfiles?: TrafficManagerProfile[];
}

export const GatewayCardGrid: React.FC<Props> = ({ gateways, expandedId, onToggle, selectedSubscription, trafficManagerProfiles }) => {
  const [wafPanel, setWafPanel] = useState<{ open: boolean; gatewayName: string; loading: boolean; data: any }>({
    open: false, gatewayName: "", loading: false, data: null,
  });
  const [policyDetail, setPolicyDetail] = useState<{ loading: boolean; data: any }>({ loading: false, data: null });
  const [ddosStatus, setDdosStatus] = useState<Record<string, boolean | null>>({});
  const [ddosLoading, setDdosLoading] = useState<string | null>(null);
  const [vnetEncryption, setVnetEncryption] = useState<Record<string, boolean | null>>({});
  const [vnetEncLoading, setVnetEncLoading] = useState<string | null>(null);

  // Load DDoS status sequentially to avoid 429 rate limiting
  useEffect(() => {
    let cancelled = false;
    async function loadDdos() {
      for (const gw of gateways) {
        if (cancelled) break;
        if (ddosStatus[gw.id] !== undefined) continue;
        try {
          const result = await checkDdosProtection(selectedSubscription, gw.resourceGroup, gw.name);
          if (!cancelled) {
            setDdosStatus((prev) => ({ ...prev, [gw.id]: result?.enabled ?? false }));
            setVnetEncryption((prev) => ({ ...prev, [gw.id]: result?.vnetEncryption ?? false }));
          }
        } catch {
          if (!cancelled) setDdosStatus((prev) => ({ ...prev, [gw.id]: null }));
        }
      }
    }
    loadDdos();
    return () => { cancelled = true; };
  }, [gateways, selectedSubscription]);

  const handleDdosToggle = async (e: React.MouseEvent, gw: GatewayListItem) => {
    e.stopPropagation();
    const isEnabled = ddosStatus[gw.id];
    const action = isEnabled ? "disable" : "enable";
    if (!confirm(`${action === "enable" ? "Enable" : "Disable"} DDoS Protection Standard on the VNet for "${gw.name}"?\n\n${action === "enable" ? "Note: DDoS Standard costs ~$2,944/month per VNet." : "Warning: This removes advanced DDoS protection."}`)) return;

    setDdosLoading(gw.id);
    try {
      if (action === "enable") {
        await enableDdosProtection(selectedSubscription, gw.resourceGroup, gw.name);
      } else {
        await disableDdosProtection(selectedSubscription, gw.resourceGroup, gw.name);
      }
      setDdosStatus((prev) => ({ ...prev, [gw.id]: action === "enable" }));
    } catch {
      alert(`Failed to ${action} DDoS protection`);
    } finally {
      setDdosLoading(null);
    }
  };

  const handleVnetEncryptionToggle = async (e: React.MouseEvent, gw: GatewayListItem) => {
    e.stopPropagation();
    const isEnabled = vnetEncryption[gw.id];
    const action = isEnabled ? "disable" : "enable";
    if (!confirm(`${action === "enable" ? "Enable" : "Disable"} VNet encryption on the VNet for "${gw.name}"?\n\n${action === "enable" ? "This encrypts traffic between VMs within the VNet. Requires supported VM sizes (e.g., accelerated networking)." : "Warning: This removes VNet-level encryption for inter-VM traffic."}`)) return;

    setVnetEncLoading(gw.id);
    try {
      if (action === "enable") {
        await enableVnetEncryption(selectedSubscription, gw.resourceGroup, gw.name);
      } else {
        await disableVnetEncryption(selectedSubscription, gw.resourceGroup, gw.name);
      }
      setVnetEncryption((prev) => ({ ...prev, [gw.id]: action === "enable" }));
    } catch {
      alert(`Failed to ${action} VNet encryption`);
    } finally {
      setVnetEncLoading(null);
    }
  };

  const loadPolicyDetail = async (subscriptionId: string, resourceGroup: string, policyName: string) => {
    setPolicyDetail({ loading: true, data: null });
    try {
      const detail = await getWafPolicyDetail(subscriptionId, resourceGroup, policyName);
      setPolicyDetail({ loading: false, data: detail });
    } catch {
      setPolicyDetail({ loading: false, data: null });
    }
  };

  const handleWafClick = async (e: React.MouseEvent, gw: GatewayListItem) => {
    e.stopPropagation();
    setWafPanel({ open: true, gatewayName: gw.name, loading: true, data: null });
    setPolicyDetail({ loading: false, data: null });
    try {
      const policies = await getWafPolicies(selectedSubscription);
      const gwPolicies = policies.filter((p: any) =>
        (p.associatedGateways || []).some((ag: string) => ag.toLowerCase().includes(gw.name.toLowerCase()))
      );
      setWafPanel({ open: true, gatewayName: gw.name, loading: false, data: { policies, gwPolicies, gateway: gw } });

      // Auto-expand: if there's a linked policy, load its details immediately
      const policyToExpand = gwPolicies[0] || policies[0];
      if (policyToExpand) {
        loadPolicyDetail(selectedSubscription, policyToExpand.resourceGroup, policyToExpand.name);
      }
    } catch {
      setWafPanel({ open: true, gatewayName: gw.name, loading: false, data: { policies: [], gwPolicies: [], gateway: gw } });
    }
  };

  if (gateways.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <h3>No gateways found</h3>
          <p>Select a subscription with Application Gateways or ask AppDelivery Genie to create one</p>
        </div>
      </div>
    );
  }

  // Group gateways by "appgw-group" tag
  const grouped: Record<string, typeof gateways> = {};
  gateways.forEach((gw) => {
    const group = gw.tags?.["appgw-group"] || "Ungrouped";
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(gw);
  });

  const groupColors: Record<string, { accent: string; bg: string; icon: string }> = {
    Finance: { accent: "#0078d4", bg: "linear-gradient(135deg, #e8f4fd 0%, #f0f8ff 100%)", icon: "💰" },
    Marketing: { accent: "#8764b8", bg: "linear-gradient(135deg, #f3eef9 0%, #f9f5ff 100%)", icon: "📢" },
    Ungrouped: { accent: "#605e5c", bg: "linear-gradient(135deg, #f5f5f5 0%, #faf9f8 100%)", icon: "📦" },
  };

  const sortedGroups = Object.keys(grouped).sort((a, b) => {
    if (a === "Ungrouped") return 1;
    if (b === "Ungrouped") return -1;
    return a.localeCompare(b);
  });

  const renderCard = (gw: typeof gateways[0]) => {
    const isExpanded = expandedId === gw.id;
    return (
      <div
        key={gw.id}
        className={`gateway-card ${isExpanded ? "expanded" : ""}`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-waf-badge]")) return;
          if (!isExpanded) onToggle(gw.id);
        }}
      >
        <div className="gateway-card-header">
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
            <Text styles={{ root: { fontWeight: 700, fontSize: 16 } }}>{gw.name}</Text>
            <span className={`status-badge status-${gw.operationalState?.toLowerCase()}`}>
              {gw.operationalState}
            </span>
            <span
              data-waf-badge="true"
              className={`status-badge ${gw.wafEnabled ? "status-pass" : "status-warning"}`}
              style={{ cursor: "pointer", textDecoration: "underline dotted" }}
              onClick={(e) => handleWafClick(e, gw)}
              title="Click to view WAF configuration"
            >
              WAF {gw.wafEnabled ? "ON" : "OFF"}
            </span>
            <span
              className={`status-badge ${ddosStatus[gw.id] === true ? "status-pass" : ddosStatus[gw.id] === false ? "status-warning" : ""}`}
              style={{ cursor: "pointer", textDecoration: "underline dotted" }}
              onClick={(e) => handleDdosToggle(e, gw)}
              title={ddosStatus[gw.id] === true ? "Click to disable DDoS Standard" : ddosStatus[gw.id] === false ? "Click to enable DDoS Standard" : "Checking..."}
            >
              {ddosLoading === gw.id ? "DDoS ..." : `DDoS ${ddosStatus[gw.id] === true ? "ON" : ddosStatus[gw.id] === false ? "OFF" : "..."}`}
            </span>
            <span
              className={`status-badge ${vnetEncryption[gw.id] === true ? "status-pass" : vnetEncryption[gw.id] === false ? "status-warning" : ""}`}
              style={{ fontSize: 10, cursor: "pointer", textDecoration: "underline dotted" }}
              onClick={(e) => handleVnetEncryptionToggle(e, gw)}
              title={vnetEncryption[gw.id] === true ? "Click to disable VNet encryption" : vnetEncryption[gw.id] === false ? "Click to enable VNet encryption" : "Checking..."}
            >
              {vnetEncLoading === gw.id ? "🔐 Encrypt ..." : `🔐 Encrypt ${vnetEncryption[gw.id] === true ? "ON" : vnetEncryption[gw.id] === false ? "OFF" : "..."}`}
            </span>
          </Stack>
          {isExpanded && (
            <DefaultButton
              text="Collapse"
              iconProps={{ iconName: "ChevronUp" }}
              onClick={(e) => { e.stopPropagation(); onToggle(null); }}
              styles={{ root: { borderRadius: 6, minWidth: 0 } }}
            />
          )}
        </div>

        <Stack horizontal tokens={{ childrenGap: 16 }} styles={{ root: { marginTop: 6 } }}>
          <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{gw.resourceGroup}</Text>
          <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{gw.location}</Text>
          <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{gw.sku} / {gw.tier}</Text>
        </Stack>

        <div className="gateway-card-stats">
          <div className="gateway-card-stat">
            <strong>{gw.backendPoolCount}</strong> Pools
          </div>
          <div className="gateway-card-stat">
            <strong>{gw.listenerCount}</strong> Listeners
          </div>
          <div className="gateway-card-stat">
            <strong>{gw.ruleCount}</strong> Rules
          </div>
        </div>

        {isExpanded && (
          <GatewayExpandedCard
            subscriptionId={selectedSubscription}
            resourceGroup={gw.resourceGroup}
            gatewayName={gw.name}
          />
        )}
      </div>
    );
  };

  return (
    <>
      {sortedGroups.map((group) => {
        const { accent, bg, icon } = groupColors[group] || groupColors["Ungrouped"];
        const groupGateways = grouped[group];
        const running = groupGateways.filter((g) => g.operationalState === "Running").length;
        const stopped = groupGateways.length - running;

        return (
          <div key={group} className="gateway-group">
            <div className="gateway-group-header" style={{ background: bg, borderLeftColor: accent }}>
              <div className="gateway-group-title-row">
                <span className="gateway-group-icon">{icon}</span>
                <h3 className="gateway-group-title">{group}</h3>
                <span className="gateway-group-count" style={{ background: accent }}>{groupGateways.length}</span>
              </div>
              <div className="gateway-group-meta">
                <span className="gateway-group-stat">
                  <span className="health-dot healthy" /> {running} running
                </span>
                {stopped > 0 && (
                  <span className="gateway-group-stat">
                    <span className="health-dot unhealthy" /> {stopped} stopped
                  </span>
                )}
              </div>
            </div>
            <div className="gateway-card-grid">
              {groupGateways.map(renderCard)}
            </div>
            {group === "Finance" && trafficManagerProfiles && trafficManagerProfiles.length > 0 && (
              <div style={{ marginTop: 12, marginLeft: 8, marginRight: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0078d4", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>🌍</span> Traffic Manager
                </div>
                <TrafficManagerSection selectedSubscription={selectedSubscription} />
              </div>
            )}
          </div>
        );
      })}

      {/* WAF Detail Panel */}
      <Panel
        isOpen={wafPanel.open}
        onDismiss={() => { setWafPanel({ ...wafPanel, open: false }); setPolicyDetail({ loading: false, data: null }); }}
        headerText={`WAF Configuration — ${wafPanel.gatewayName}`}
        type={PanelType.large}
      >
        {wafPanel.loading ? (
          <Spinner label="Loading WAF configuration..." styles={{ root: { marginTop: 20 } }} />
        ) : wafPanel.data ? (
          <Stack tokens={{ childrenGap: 16 }} styles={{ root: { marginTop: 16 } }}>
            {/* Gateway WAF Status */}
            <div className="card">
              <Text variant="large" styles={{ root: { fontWeight: 700, display: "block", marginBottom: 12 } }}>
                Gateway WAF Status
              </Text>
              <Stack horizontal tokens={{ childrenGap: 24 }}>
                <Stack tokens={{ childrenGap: 6 }}>
                  <Text styles={{ root: { fontWeight: 600 } }}>WAF Enabled</Text>
                  <span className={`status-badge ${wafPanel.data.gateway?.wafEnabled ? "status-pass" : "status-fail"}`} style={{ fontSize: 14, padding: "4px 12px" }}>
                    {wafPanel.data.gateway?.wafEnabled ? "Yes" : "No"}
                  </span>
                </Stack>
                <Stack tokens={{ childrenGap: 6 }}>
                  <Text styles={{ root: { fontWeight: 600 } }}>SKU</Text>
                  <Text>{wafPanel.data.gateway?.sku}</Text>
                </Stack>
              </Stack>
            </div>

            {/* WAF Policies List — clickable */}
            {wafPanel.data.policies?.length > 0 ? (
              <div className="card">
                <Text variant="medium" styles={{ root: { fontWeight: 700, display: "block", marginBottom: 12 } }}>
                  WAF Policies ({wafPanel.data.policies.length})
                </Text>
                <Text variant="small" styles={{ root: { color: "#605e5c", marginBottom: 12, display: "block" } }}>
                  Click a policy to view managed rules, custom rules, and exclusions
                </Text>
                {wafPanel.data.policies.map((p: any) => {
                  const isLinked = (wafPanel.data.gwPolicies || []).some((gp: any) => gp.id === p.id);
                  return (
                    <Stack key={p.id} horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}
                      styles={{
                        root: {
                          padding: "10px 12px",
                          borderBottom: "1px solid #f3f2f1",
                          cursor: "pointer",
                          borderRadius: 4,
                          transition: "background 0.1s",
                          background: isLinked ? "#f3f9fd" : "transparent",
                          selectors: { ":hover": { background: "#f3f2f1" } },
                        },
                      }}
                      onClick={() => loadPolicyDetail(selectedSubscription, p.resourceGroup, p.name)}
                    >
                      <Text styles={{ root: { fontWeight: 600, minWidth: 160, color: "#0078d4" } }}>{p.name}</Text>
                      <span className={`status-badge ${p.policyMode === "Prevention" ? "status-pass" : "status-warning"}`}>
                        {p.policyMode}
                      </span>
                      <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{p.ruleSetType} {p.ruleSetVersion}</Text>
                      <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{p.customRulesCount} custom rules</Text>
                      {isLinked && <span className="status-badge status-pass">Linked</span>}
                    </Stack>
                  );
                })}
              </div>
            ) : (
              <div className="card">
                {wafPanel.data.gateway?.wafEnabled ? (
                  <Text styles={{ root: { color: "#c19c00" } }}>
                    This gateway uses inline WAF configuration (legacy). No standalone WAF policy found.
                  </Text>
                ) : (
                  <Text styles={{ root: { color: "#d13438" } }}>
                    No WAF policies found. The SKU must be WAF_v2 to use WAF.
                  </Text>
                )}
              </div>
            )}

            {/* Policy Deep Dive */}
            {policyDetail.loading && <Spinner label="Loading policy details..." />}
            {policyDetail.data && (
              <div className="card" style={{ borderLeft: "4px solid #0078d4" }}>
                <Text variant="large" styles={{ root: { fontWeight: 700, display: "block", marginBottom: 4 } }}>
                  {policyDetail.data.name}
                </Text>
                <Text variant="small" styles={{ root: { color: "#605e5c", display: "block", marginBottom: 16 } }}>
                  {policyDetail.data.id}
                </Text>

                <Pivot>
                  {/* Overview Tab */}
                  <PivotItem headerText="Overview">
                    <Stack tokens={{ childrenGap: 8 }} styles={{ root: { marginTop: 12 } }}>
                      <Stack horizontal tokens={{ childrenGap: 8 }}>
                        <Text styles={{ root: { fontWeight: 600, minWidth: 180 } }}>State:</Text>
                        <span className={`status-badge ${policyDetail.data.policySettings?.state === "Enabled" ? "status-pass" : "status-fail"}`}>
                          {policyDetail.data.policySettings?.state || "Unknown"}
                        </span>
                      </Stack>
                      <Stack horizontal tokens={{ childrenGap: 8 }}>
                        <Text styles={{ root: { fontWeight: 600, minWidth: 180 } }}>Mode:</Text>
                        <span className={`status-badge ${policyDetail.data.policySettings?.mode === "Prevention" ? "status-pass" : "status-warning"}`}>
                          {policyDetail.data.policySettings?.mode || "Unknown"}
                        </span>
                      </Stack>
                      <Stack horizontal tokens={{ childrenGap: 8 }}>
                        <Text styles={{ root: { fontWeight: 600, minWidth: 180 } }}>Request Body Check:</Text>
                        <Text>{policyDetail.data.policySettings?.requestBodyCheck ? "Enabled" : "Disabled"}</Text>
                      </Stack>
                      <Stack horizontal tokens={{ childrenGap: 8 }}>
                        <Text styles={{ root: { fontWeight: 600, minWidth: 180 } }}>Max Request Body (KB):</Text>
                        <Text>{policyDetail.data.policySettings?.maxRequestBodySizeInKb || "N/A"}</Text>
                      </Stack>
                      <Stack horizontal tokens={{ childrenGap: 8 }}>
                        <Text styles={{ root: { fontWeight: 600, minWidth: 180 } }}>File Upload Limit (MB):</Text>
                        <Text>{policyDetail.data.policySettings?.fileUploadLimitInMb || "N/A"}</Text>
                      </Stack>
                      <Stack horizontal tokens={{ childrenGap: 8 }}>
                        <Text styles={{ root: { fontWeight: 600, minWidth: 180 } }}>Associated Gateways:</Text>
                        <Text>{(policyDetail.data.applicationGateways || []).length}</Text>
                      </Stack>
                      {(policyDetail.data.applicationGateways || []).map((ag: any, i: number) => (
                        <Text key={i} variant="small" styles={{ root: { color: "#605e5c", marginLeft: 188 } }}>
                          {ag.id?.split("/").pop()}
                        </Text>
                      ))}
                    </Stack>
                  </PivotItem>

                  {/* Managed Rules Tab */}
                  <PivotItem headerText="Managed Rules">
                    <Stack tokens={{ childrenGap: 12 }} styles={{ root: { marginTop: 12 } }}>
                      {(policyDetail.data.managedRules?.managedRuleSets || []).map((ruleSet: any, rsi: number) => (
                        <div key={rsi}>
                          <Text styles={{ root: { fontWeight: 700, display: "block", marginBottom: 8 } }}>
                            {ruleSet.ruleSetType} {ruleSet.ruleSetVersion}
                          </Text>
                          {(ruleSet.ruleGroupOverrides || []).length > 0 ? (
                            ruleSet.ruleGroupOverrides.map((group: any, gi: number) => (
                              <div key={gi} style={{ marginBottom: 12, paddingLeft: 12, borderLeft: "2px solid #edebe9" }}>
                                <Text styles={{ root: { fontWeight: 600, display: "block", marginBottom: 4 } }}>
                                  {group.ruleGroupName}
                                </Text>
                                {(group.rules || []).map((rule: any, ri: number) => (
                                  <Stack key={ri} horizontal tokens={{ childrenGap: 8 }} styles={{ root: { padding: "3px 0" } }}>
                                    <Text variant="small" styles={{ root: { minWidth: 60, fontFamily: "monospace" } }}>
                                      {rule.ruleId}
                                    </Text>
                                    <span className={`status-badge ${rule.state === "Enabled" ? "status-pass" : rule.state === "Disabled" ? "status-fail" : "status-warning"}`} style={{ fontSize: 10 }}>
                                      {rule.state || "Enabled"}
                                    </span>
                                    {rule.action && <Text variant="small" styles={{ root: { color: "#605e5c" } }}>Action: {rule.action}</Text>}
                                  </Stack>
                                ))}
                              </div>
                            ))
                          ) : (
                            <Text variant="small" styles={{ root: { color: "#107c10", marginLeft: 12 } }}>
                              All rules enabled (no overrides) — using default rule set configuration
                            </Text>
                          )}
                        </div>
                      ))}
                      {(policyDetail.data.managedRules?.managedRuleSets || []).length === 0 && (
                        <Text styles={{ root: { color: "#d13438" } }}>No managed rule sets configured</Text>
                      )}

                      {/* Exclusions */}
                      {(policyDetail.data.managedRules?.exclusions || []).length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <Text styles={{ root: { fontWeight: 700, display: "block", marginBottom: 8 } }}>
                            Exclusions ({policyDetail.data.managedRules.exclusions.length})
                          </Text>
                          {policyDetail.data.managedRules.exclusions.map((ex: any, ei: number) => (
                            <Stack key={ei} horizontal tokens={{ childrenGap: 8 }} styles={{ root: { padding: "4px 0", borderBottom: "1px solid #f3f2f1" } }}>
                              <Text variant="small" styles={{ root: { fontWeight: 600 } }}>{ex.matchVariable}</Text>
                              <Text variant="small">{ex.selectorMatchOperator}</Text>
                              <Text variant="small" styles={{ root: { color: "#0078d4" } }}>{ex.selector}</Text>
                            </Stack>
                          ))}
                        </div>
                      )}
                    </Stack>
                  </PivotItem>

                  {/* Custom Rules Tab */}
                  <PivotItem headerText="Custom Rules">
                    <Stack tokens={{ childrenGap: 12 }} styles={{ root: { marginTop: 12 } }}>
                      {(policyDetail.data.customRules || []).length > 0 ? (
                        policyDetail.data.customRules.map((rule: any, ri: number) => (
                          <div key={ri} className="card" style={{ margin: 0, borderLeft: `3px solid ${rule.action === "Block" ? "#d13438" : rule.action === "Allow" ? "#107c10" : "#c19c00"}` }}>
                            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                              <Text styles={{ root: { fontWeight: 700 } }}>{rule.name}</Text>
                              <span className={`severity-badge severity-${rule.priority <= 10 ? "critical" : rule.priority <= 50 ? "high" : "medium"}`}>
                                Priority: {rule.priority}
                              </span>
                              <span className={`status-badge ${rule.action === "Block" ? "status-fail" : "status-pass"}`}>
                                {rule.action}
                              </span>
                              <span className={`status-badge ${rule.state === "Enabled" ? "status-pass" : "status-warning"}`}>
                                {rule.state || "Enabled"}
                              </span>
                            </Stack>
                            <Text variant="small" styles={{ root: { color: "#605e5c", display: "block", marginTop: 4 } }}>
                              Type: {rule.ruleType} | Match: {(rule.matchConditions || []).length} condition(s)
                            </Text>
                            {(rule.matchConditions || []).map((mc: any, mi: number) => (
                              <Stack key={mi} styles={{ root: { marginTop: 4, paddingLeft: 12, borderLeft: "2px solid #edebe9" } }}>
                                <Text variant="small">
                                  <strong>{mc.matchVariables?.[0]?.variableName}</strong>
                                  {mc.matchVariables?.[0]?.selector && `.${mc.matchVariables[0].selector}`}
                                  {" "}{mc.operator}{" "}
                                  <code style={{ background: "#f3f2f1", padding: "1px 4px", borderRadius: 2 }}>
                                    {(mc.matchValues || []).join(", ")}
                                  </code>
                                  {mc.negationConditon && " (negated)"}
                                </Text>
                              </Stack>
                            ))}
                          </div>
                        ))
                      ) : (
                        <Text styles={{ root: { color: "#605e5c" } }}>No custom rules configured</Text>
                      )}
                    </Stack>
                  </PivotItem>
                </Pivot>
              </div>
            )}
          </Stack>
        ) : null}
      </Panel>
    </>
  );
};
