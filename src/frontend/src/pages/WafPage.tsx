import { useState, useEffect } from "react";
import {
  Stack,
  Text,
  Spinner,
  MessageBar,
  MessageBarType,
  Panel,
  PanelType,
  Pivot,
  PivotItem,
  TextField,
  DefaultButton,
  Dropdown,
  IDropdownOption,
} from "@fluentui/react";
import { SubscriptionPicker } from "../components/SubscriptionPicker";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { getWafPolicies, getWafPolicyDetail, runLogAnalyticsQuery, getLogAnalyticsWorkspaces } from "../services/api";
import { WafPolicy } from "../types";

export function WafPage() {
  const { subscriptions, selectedSubscription, setSelectedSubscription, loading: subsLoading } = useSubscriptions();
  const [policies, setPolicies] = useState<WafPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<WafPolicy | null>(null);
  const [policyDetail, setPolicyDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [wafLogs, setWafLogs] = useState<any>(null);
  const [wafLogsLoading, setWafLogsLoading] = useState(false);
  const [wafWorkspaceId, setWafWorkspaceId] = useState(localStorage.getItem("la_workspace_id") || "");
  const [wafLogHours, setWafLogHours] = useState(24);
  const [wafWorkspaces, setWafWorkspaces] = useState<any[]>([]);

  useEffect(() => {
    if (selectedSubscription) {
      getLogAnalyticsWorkspaces(selectedSubscription).then(ws => {
        setWafWorkspaces(ws);
        if (!wafWorkspaceId && ws.length > 0) {
          setWafWorkspaceId(ws[0].id);
          localStorage.setItem("la_workspace_id", ws[0].id);
        }
      }).catch(() => {});
    }
  }, [selectedSubscription]);

  useEffect(() => {
    if (!selectedSubscription) return;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await getWafPolicies(selectedSubscription);
        setPolicies(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load WAF policies");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [selectedSubscription]);

  const handlePolicyClick = async (policy: WafPolicy) => {
    setSelectedPolicy(policy);
    setDetailLoading(true);
    setPolicyDetail(null);
    setWafLogs(null);
    try {
      const detail = await getWafPolicyDetail(selectedSubscription, policy.resourceGroup, policy.name);
      setPolicyDetail(detail);
    } catch {} finally {
      setDetailLoading(false);
    }
  };

  const loadWafLogs = async () => {
    if (!wafWorkspaceId || !selectedPolicy) return;
    setWafLogsLoading(true);
    localStorage.setItem("la_workspace_id", wafWorkspaceId);
    try {
      // Get associated gateway names
      const gwNames = (selectedPolicy.associatedGateways || []).map((ag: string) => ag.split("/").pop()).filter(Boolean);
      const gwFilter = gwNames.length > 0 ? `| where Resource in~ (${gwNames.map(n => `"${n}"`).join(", ")})` : "";

      const query = `AzureDiagnostics
| where ResourceType == "APPLICATIONGATEWAYS"
| where Category == "ApplicationGatewayFirewallLog"
${gwFilter}
| where TimeGenerated > ago(${wafLogHours}h)
| project TimeGenerated, Resource, action_s, ruleId_s, ruleGroup_s, message_s, clientIp_s, requestUri_s, hostname_s, ruleSetType_s, ruleSetVersion_s, details_message_s
| order by TimeGenerated desc
| take 500`;
      const result = await runLogAnalyticsQuery(wafWorkspaceId, query, wafLogHours);
      setWafLogs(result);
    } catch (err: any) {
      setWafLogs({ error: err?.response?.data?.error || "Failed to load WAF logs" });
    } finally {
      setWafLogsLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <Text variant="xxLarge" styles={{ root: { fontWeight: 600 } }}>
          WAF Policies
        </Text>
        <Text variant="medium" styles={{ root: { color: "#605e5c", marginTop: 4 } }}>
          Click any policy to view managed rules, custom rules, and exclusions
        </Text>
      </div>

      <Stack tokens={{ childrenGap: 16 }}>
        <SubscriptionPicker
          subscriptions={subscriptions}
          selectedSubscription={selectedSubscription || ""}
          onChange={setSelectedSubscription}
          loading={subsLoading}
        />

        {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}

        {loading ? (
          <Spinner label="Loading WAF policies..." />
        ) : policies.length === 0 ? (
          <div className="empty-state">
            <h3>No WAF policies found</h3>
            <p>No Web Application Firewall policies found in this subscription.</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #edebe9", textAlign: "left", background: "#f3f2f1" }}>
                  <th style={{ padding: "12px 16px", fontSize: 12, color: "#605e5c", fontWeight: 600 }}>Policy Name</th>
                  <th style={{ padding: "12px 16px", fontSize: 12, color: "#605e5c", fontWeight: 600 }}>Resource Group</th>
                  <th style={{ padding: "12px 16px", fontSize: 12, color: "#605e5c", fontWeight: 600 }}>Mode</th>
                  <th style={{ padding: "12px 16px", fontSize: 12, color: "#605e5c", fontWeight: 600 }}>Rule Set</th>
                  <th style={{ padding: "12px 16px", fontSize: 12, color: "#605e5c", fontWeight: 600 }}>Custom Rules</th>
                  <th style={{ padding: "12px 16px", fontSize: 12, color: "#605e5c", fontWeight: 600 }}>Associated Gateways</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id}
                    style={{ borderBottom: "1px solid #f3f2f1", cursor: "pointer", transition: "background 0.1s" }}
                    onClick={() => handlePolicyClick(p)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f9fd")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
                  >
                    <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0078d4" }}>{p.name}</td>
                    <td style={{ padding: "12px 16px" }}>{p.resourceGroup}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span className={`status-badge ${p.policyMode === "Prevention" ? "status-running" : "status-warning"}`}>
                        {p.policyMode}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>{p.ruleSetType} {p.ruleSetVersion}</td>
                    <td style={{ padding: "12px 16px" }}>{p.customRulesCount}</td>
                    <td style={{ padding: "12px 16px" }}>{p.associatedGateways.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Stack>

      {/* Policy Detail Panel */}
      <Panel
        isOpen={!!selectedPolicy}
        onDismiss={() => { setSelectedPolicy(null); setPolicyDetail(null); }}
        headerText={`WAF Policy: ${selectedPolicy?.name}`}
        type={PanelType.large}
      >
        {detailLoading ? (
          <Spinner label="Loading policy details..." styles={{ root: { marginTop: 20 } }} />
        ) : policyDetail ? (
          <Stack tokens={{ childrenGap: 16 }} styles={{ root: { marginTop: 16 } }}>
            <Pivot>
              <PivotItem headerText="Overview">
                <Stack tokens={{ childrenGap: 8 }} styles={{ root: { marginTop: 12 } }}>
                  <Stack horizontal tokens={{ childrenGap: 8 }}>
                    <Text styles={{ root: { fontWeight: 600, minWidth: 180 } }}>State:</Text>
                    <span className={`status-badge ${policyDetail.policySettings?.state === "Enabled" ? "status-pass" : "status-fail"}`}>
                      {policyDetail.policySettings?.state || "Unknown"}
                    </span>
                  </Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}>
                    <Text styles={{ root: { fontWeight: 600, minWidth: 180 } }}>Mode:</Text>
                    <span className={`status-badge ${policyDetail.policySettings?.mode === "Prevention" ? "status-pass" : "status-warning"}`}>
                      {policyDetail.policySettings?.mode || "Unknown"}
                    </span>
                  </Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}>
                    <Text styles={{ root: { fontWeight: 600, minWidth: 180 } }}>Request Body Check:</Text>
                    <Text>{policyDetail.policySettings?.requestBodyCheck ? "Enabled" : "Disabled"}</Text>
                  </Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}>
                    <Text styles={{ root: { fontWeight: 600, minWidth: 180 } }}>Max Request Body (KB):</Text>
                    <Text>{policyDetail.policySettings?.maxRequestBodySizeInKb || "N/A"}</Text>
                  </Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}>
                    <Text styles={{ root: { fontWeight: 600, minWidth: 180 } }}>File Upload Limit (MB):</Text>
                    <Text>{policyDetail.policySettings?.fileUploadLimitInMb || "N/A"}</Text>
                  </Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}>
                    <Text styles={{ root: { fontWeight: 600, minWidth: 180 } }}>Associated Gateways:</Text>
                    <Text>{(policyDetail.applicationGateways || []).length}</Text>
                  </Stack>
                  {(policyDetail.applicationGateways || []).map((ag: any, i: number) => (
                    <Text key={i} variant="small" styles={{ root: { color: "#605e5c", marginLeft: 188 } }}>
                      {ag.id?.split("/").pop()}
                    </Text>
                  ))}
                </Stack>
              </PivotItem>

              <PivotItem headerText="Managed Rules">
                <Stack tokens={{ childrenGap: 12 }} styles={{ root: { marginTop: 12 } }}>
                  {(policyDetail.managedRules?.managedRuleSets || []).map((ruleSet: any, rsi: number) => (
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
                                <Text variant="small" styles={{ root: { minWidth: 60, fontFamily: "monospace" } }}>{rule.ruleId}</Text>
                                <span className={`status-badge ${rule.state === "Enabled" ? "status-pass" : "status-fail"}`} style={{ fontSize: 10 }}>
                                  {rule.state || "Enabled"}
                                </span>
                                {rule.action && <Text variant="small" styles={{ root: { color: "#605e5c" } }}>Action: {rule.action}</Text>}
                              </Stack>
                            ))}
                          </div>
                        ))
                      ) : (
                        <Text variant="small" styles={{ root: { color: "#107c10", marginLeft: 12 } }}>
                          All rules enabled (no overrides) — using default rule set
                        </Text>
                      )}
                    </div>
                  ))}

                  {(policyDetail.managedRules?.exclusions || []).length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <Text styles={{ root: { fontWeight: 700, display: "block", marginBottom: 8 } }}>
                        Exclusions ({policyDetail.managedRules.exclusions.length})
                      </Text>
                      {policyDetail.managedRules.exclusions.map((ex: any, ei: number) => (
                        <Stack key={ei} horizontal tokens={{ childrenGap: 8 }} styles={{ root: { padding: "4px 0" } }}>
                          <Text variant="small" styles={{ root: { fontWeight: 600 } }}>{ex.matchVariable}</Text>
                          <Text variant="small">{ex.selectorMatchOperator}</Text>
                          <Text variant="small" styles={{ root: { color: "#0078d4" } }}>{ex.selector}</Text>
                        </Stack>
                      ))}
                    </div>
                  )}
                </Stack>
              </PivotItem>

              <PivotItem headerText="Custom Rules">
                <Stack tokens={{ childrenGap: 12 }} styles={{ root: { marginTop: 12 } }}>
                  {(policyDetail.customRules || []).length > 0 ? (
                    policyDetail.customRules.map((rule: any, ri: number) => (
                      <div key={ri} className="card" style={{ margin: 0, borderLeft: `3px solid ${rule.action === "Block" ? "#d13438" : rule.action === "Allow" ? "#107c10" : "#c19c00"}` }}>
                        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                          <Text styles={{ root: { fontWeight: 700 } }}>{rule.name}</Text>
                          <span className="template-component-count">Priority: {rule.priority}</span>
                          <span className={`status-badge ${rule.action === "Block" ? "status-fail" : "status-pass"}`}>{rule.action}</span>
                          <span className={`status-badge ${rule.state === "Enabled" ? "status-pass" : "status-warning"}`}>{rule.state || "Enabled"}</span>
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

              <PivotItem headerText="WAF Logs">
                <Stack tokens={{ childrenGap: 12 }} styles={{ root: { marginTop: 12 } }}>
                  <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="end">
                    <Dropdown
                      label="Log Analytics Workspace"
                      selectedKey={wafWorkspaceId}
                      options={[
                        ...wafWorkspaces.map(ws => ({ key: ws.id, text: `${ws.name} (${ws.resourceGroup})` })),
                        ...(wafWorkspaceId && !wafWorkspaces.find(ws => ws.id === wafWorkspaceId) ? [{ key: wafWorkspaceId, text: wafWorkspaceId }] : []),
                      ]}
                      onChange={(_, opt) => { const id = opt?.key as string; setWafWorkspaceId(id); localStorage.setItem("la_workspace_id", id); }}
                      placeholder="Select a workspace"
                      styles={{ root: { flex: 1 } }}
                    />
                    <Dropdown
                      label="Time Range"
                      selectedKey={wafLogHours}
                      options={[
                        { key: 1, text: "1 hour" },
                        { key: 6, text: "6 hours" },
                        { key: 24, text: "24 hours" },
                        { key: 72, text: "3 days" },
                        { key: 168, text: "7 days" },
                      ] as IDropdownOption[]}
                      onChange={(_, opt) => setWafLogHours(opt?.key as number)}
                      styles={{ root: { width: 120 } }}
                    />
                    <DefaultButton text="Load Logs" onClick={loadWafLogs} disabled={wafLogsLoading || !wafWorkspaceId} />
                  </Stack>

                  {wafLogsLoading && <Spinner label="Loading WAF logs..." />}

                  {wafLogs?.error && (
                    <MessageBar messageBarType={MessageBarType.error}>{wafLogs.error}</MessageBar>
                  )}

                  {wafLogs && !wafLogs.error && Array.isArray(wafLogs) && wafLogs[0]?.rows && (
                    <div>
                      {/* Summary stats */}
                      {(() => {
                        const rows = wafLogs[0].rows || [];
                        const actionIdx = wafLogs[0].columns.indexOf("action_s");
                        const blocked = rows.filter((r: any[]) => r[actionIdx] === "Blocked").length;
                        const detected = rows.filter((r: any[]) => r[actionIdx] === "Detected").length;
                        const allowed = rows.filter((r: any[]) => r[actionIdx] === "Allowed" || r[actionIdx] === "Matched").length;
                        return (
                          <div className="stats-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                            <div className="stat-card">
                              <div className="stat-value" style={{ color: "#d13438" }}>{blocked}</div>
                              <div className="stat-label">Blocked</div>
                            </div>
                            <div className="stat-card">
                              <div className="stat-value" style={{ color: "#c19c00" }}>{detected}</div>
                              <div className="stat-label">Detected</div>
                            </div>
                            <div className="stat-card">
                              <div className="stat-value" style={{ color: "#107c10" }}>{allowed}</div>
                              <div className="stat-label">Matched/Allowed</div>
                            </div>
                            <div className="stat-card">
                              <div className="stat-value">{rows.length}</div>
                              <div className="stat-label">Total Events</div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Log table */}
                      <div style={{ maxHeight: 400, overflow: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ borderBottom: "2px solid #edebe9", textAlign: "left", position: "sticky", top: 0, background: "white" }}>
                              {wafLogs[0].columns.map((col: string) => (
                                <th key={col} style={{ padding: "6px 8px", fontWeight: 600, whiteSpace: "nowrap" }}>
                                  {col.replace("_s", "").replace("_d", "")}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(wafLogs[0].rows || []).map((row: any[], ri: number) => {
                              const actionIdx = wafLogs[0].columns.indexOf("action_s");
                              const isBlocked = row[actionIdx] === "Blocked";
                              return (
                                <tr key={ri} style={{
                                  borderBottom: "1px solid #f3f2f1",
                                  background: isBlocked ? "#fde7e9" : undefined,
                                }}>
                                  {row.map((cell: any, ci: number) => (
                                    <td key={ci} style={{
                                      padding: "4px 8px",
                                      maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                      fontWeight: wafLogs[0].columns[ci] === "action_s" ? 700 : 400,
                                      color: cell === "Blocked" ? "#d13438" : cell === "Detected" ? "#c19c00" : undefined,
                                    }}>
                                      {cell?.toString() || "-"}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <Text variant="small" styles={{ root: { color: "#605e5c", marginTop: 8, display: "block" } }}>
                        Showing {wafLogs[0].rows.length} of {wafLogs[0].totalRows} events
                      </Text>
                    </div>
                  )}

                  {wafLogs && !wafLogs.error && (!Array.isArray(wafLogs) || !wafLogs[0]?.rows?.length) && (
                    <div className="empty-state" style={{ padding: 30 }}>
                      <h3>No WAF log events found</h3>
                      <p>No firewall log entries in the selected time range. Ensure diagnostic settings are sending ApplicationGatewayFirewallLog to this workspace.</p>
                    </div>
                  )}
                </Stack>
              </PivotItem>
            </Pivot>
          </Stack>
        ) : null}
      </Panel>
    </div>
  );
}
