import React, { useState, useEffect } from "react";
import {
  Text,
  Stack,
  PrimaryButton,
  DefaultButton,
  Spinner,
  MessageBar,
  MessageBarType,
  Panel,
  PanelType,
} from "@fluentui/react";
import { BaselineSnapshot, DriftReport, DriftChange, GatewayListItem } from "../../types";
import { checkDrift, saveBaseline, getBaselines } from "../../services/api";

interface Props {
  baselines: BaselineSnapshot[];
  gateways: GatewayListItem[];
  selectedSubscription: string;
  onRefresh: () => void;
}

export const DriftOverview: React.FC<Props> = ({ baselines: initialBaselines, gateways, selectedSubscription, onRefresh }) => {
  const [baselines, setBaselines] = useState<BaselineSnapshot[]>(initialBaselines);
  const [driftResults, setDriftResults] = useState<Record<string, DriftReport>>({});
  const [checking, setChecking] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Baseline detail panel
  const [selectedBaseline, setSelectedBaseline] = useState<BaselineSnapshot | null>(null);

  // Drift detail panel
  const [selectedDrift, setSelectedDrift] = useState<DriftReport | null>(null);

  useEffect(() => {
    if (!selectedSubscription || gateways.length === 0) return;

    (async () => {
      let currentBaselines: BaselineSnapshot[] = [];
      try {
        currentBaselines = await getBaselines(selectedSubscription);
        setBaselines(currentBaselines);
      } catch {}

      const runningGateways = gateways.filter((g) => g.operationalState === "Running");
      const gatewaysWithBaseline = new Set(currentBaselines.map((b) => b.gatewayName));
      const missing = runningGateways.filter((g) => !gatewaysWithBaseline.has(g.name));

      if (missing.length > 0) {
        setAutoSaving(true);
        for (const gw of missing) {
          try { await saveBaseline({ subscriptionId: selectedSubscription, resourceGroup: gw.resourceGroup, gatewayName: gw.name }); } catch {}
        }
        try { currentBaselines = await getBaselines(selectedSubscription); setBaselines(currentBaselines); } catch {}
        setAutoSaving(false);
      }

      if (currentBaselines.length > 0) {
        setChecking(true);
        const existingGwNames = new Set(gateways.map((g) => g.name));
        const results: Record<string, DriftReport> = {};
        for (const b of currentBaselines) {
          if (!existingGwNames.has(b.gatewayName)) continue;
          try { results[b.id] = await checkDrift(b.id); } catch {}
        }
        setDriftResults(results);
        setChecking(false);
      }
    })();
  }, [gateways, selectedSubscription]);

  const existingGwNames = new Set(gateways.map((g) => g.name));
  const latestPerGateway = new Map<string, BaselineSnapshot>();
  for (const b of baselines) {
    if (!existingGwNames.has(b.gatewayName)) continue;
    const existing = latestPerGateway.get(b.gatewayName);
    if (!existing || new Date(b.createdAt) > new Date(existing.createdAt)) {
      latestPerGateway.set(b.gatewayName, b);
    }
  }
  const gatewayBaselines = Array.from(latestPerGateway.values());

  const handleFixDrift = async (report: DriftReport) => {
    // "Fix" drift = save new baseline (accept current state as the new truth)
    try {
      await saveBaseline({
        subscriptionId: report.subscriptionId,
        resourceGroup: report.resourceGroup,
        gatewayName: report.gatewayName,
      });
      setSuccess(`Baseline reset for ${report.gatewayName} — drift cleared`);
      setSelectedDrift(null);
      const updated = await getBaselines(selectedSubscription);
      setBaselines(updated);
      // Re-check drift
      const latestBaseline = updated.filter((b) => b.gatewayName === report.gatewayName).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      if (latestBaseline) {
        const r = await checkDrift(latestBaseline.id);
        setDriftResults((prev) => ({ ...prev, [latestBaseline.id]: r }));
      }
      onRefresh();
    } catch {
      setError("Failed to reset baseline");
    }
  };

  // Baseline summary: count components in the saved config
  const getBaselineSummary = (b: BaselineSnapshot) => {
    const c = b.config || {};
    return {
      pools: (c.backendAddressPools || []).length,
      listeners: (c.httpListeners || []).length,
      rules: (c.requestRoutingRules || []).length,
      probes: (c.probes || []).length,
      httpSettings: (c.backendHttpSettingsCollection || []).length,
      ports: (c.frontendPorts || []).length,
      certs: (c.sslCertificates || []).length,
      sku: c.sku ? `${c.sku.name} / ${c.sku.tier}` : "N/A",
      waf: c.webApplicationFirewallConfiguration?.enabled ? "Enabled" : c.firewallPolicy ? "Policy Linked" : "Disabled",
    };
  };

  return (
    <div>
      {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError("")} styles={{ root: { marginBottom: 12 } }}>{error}</MessageBar>}
      {success && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSuccess("")} styles={{ root: { marginBottom: 12 } }}>{success}</MessageBar>}
      {autoSaving && <Spinner label="Saving baselines for new gateways..." styles={{ root: { marginBottom: 12 } }} />}
      {checking && <Spinner label="Scanning for configuration drift..." styles={{ root: { marginBottom: 12 } }} />}

      {gatewayBaselines.length === 0 && !autoSaving && !checking ? (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <Text variant="large" styles={{ root: { fontWeight: 600, display: "block", marginBottom: 8 } }}>No gateways tracked</Text>
          <Text styles={{ root: { color: "#605e5c", display: "block", marginBottom: 16 } }}>
            Baselines auto-save when running gateways are detected
          </Text>
          <PrimaryButton text="Save Baselines Now" iconProps={{ iconName: "Camera" }}
            onClick={async () => {
              setAutoSaving(true);
              for (const gw of gateways.filter((g) => g.operationalState === "Running")) {
                try { await saveBaseline({ subscriptionId: selectedSubscription, resourceGroup: gw.resourceGroup, gatewayName: gw.name }); } catch {}
              }
              const updated = await getBaselines(selectedSubscription); setBaselines(updated);
              setAutoSaving(false); onRefresh();
            }}
            styles={{ root: { borderRadius: 6 } }}
          />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
          {gatewayBaselines.map((b) => {
            const report = driftResults[b.id];
            const hasDrift = report?.hasDrift;
            const borderColor = !report ? "#c8c6c4" : hasDrift ? "#d13438" : "#107c10";
            const summary = getBaselineSummary(b);

            return (
              <div key={b.id} style={{
                background: "white",
                border: `1px solid ${borderColor}`,
                borderLeft: `4px solid ${borderColor}`,
                borderRadius: 8,
                padding: 20,
                boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                transition: "box-shadow 0.2s",
              }}>
                {/* Gateway name + status */}
                <Stack horizontal verticalAlign="center" horizontalAlign="space-between">
                  <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
                    <Text styles={{ root: { fontWeight: 700, fontSize: 16 } }}>{b.gatewayName}</Text>
                    {checking ? <Spinner size={1} /> : !report ? (
                      <span className="status-badge status-warning">Checking...</span>
                    ) : !hasDrift ? (
                      <span className="drift-badge-sync">In Sync</span>
                    ) : (
                      <span className="drift-badge-drifted" style={{ cursor: "pointer" }} onClick={() => setSelectedDrift(report)}>
                        Drifted ({report.totalChanges})
                      </span>
                    )}
                  </Stack>
                </Stack>

                {/* Baseline info — clickable */}
                <Text variant="small"
                  styles={{ root: { color: "#0078d4", cursor: "pointer", display: "block", marginTop: 6, textDecoration: "underline dotted" } }}
                  onClick={() => setSelectedBaseline(b)}
                  title="Click to view baseline summary"
                >
                  Baseline: {new Date(b.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </Text>
                <Text variant="small" styles={{ root: { color: "#a19f9d", display: "block", marginTop: 2 } }}>
                  {b.resourceGroup} | {summary.sku}
                </Text>

                {/* Quick component count */}
                <Stack horizontal wrap tokens={{ childrenGap: 6 }} styles={{ root: { marginTop: 10 } }}>
                  <span className="template-component-count">{summary.pools} pools</span>
                  <span className="template-component-count">{summary.listeners} listeners</span>
                  <span className="template-component-count">{summary.rules} rules</span>
                  <span className="template-component-count">{summary.probes} probes</span>
                  {summary.certs > 0 && <span className="template-component-count">{summary.certs} certs</span>}
                </Stack>

                {/* Drift callout */}
                {report && hasDrift && (
                  <div style={{
                    marginTop: 12, padding: 12, background: "#fdf3f4", borderRadius: 6, border: "1px solid #d1343833",
                  }}>
                    <Stack horizontal verticalAlign="center" horizontalAlign="space-between">
                      <Stack>
                        <Text styles={{ root: { fontWeight: 600, color: "#d13438", fontSize: 13 } }}>
                          {report.totalChanges} configuration change(s) detected
                        </Text>
                        <Text variant="small" styles={{ root: { color: "#605e5c", marginTop: 2 } }}>
                          <span style={{ color: "#107c10", fontWeight: 600 }}>+{report.additions}</span> added{" | "}
                          <span style={{ color: "#d13438", fontWeight: 600 }}>-{report.removals}</span> removed{" | "}
                          <span style={{ color: "#c19c00", fontWeight: 600 }}>~{report.modifications}</span> modified
                        </Text>
                        <Text variant="small" styles={{ root: { color: "#a19f9d", marginTop: 2 } }}>
                          Checked: {new Date(report.checkedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          {" | Baseline: "}{new Date(report.baselineDate).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </Text>
                      </Stack>
                      <Stack horizontal tokens={{ childrenGap: 6 }}>
                        <PrimaryButton text="View" iconProps={{ iconName: "RedEye" }}
                          styles={{ root: { borderRadius: 6, minWidth: 0, height: 30, fontSize: 12 } }}
                          onClick={() => setSelectedDrift(report)}
                        />
                        <DefaultButton text="Accept" iconProps={{ iconName: "Accept" }}
                          title="Accept current config as new baseline (clears drift)"
                          styles={{ root: { borderRadius: 6, minWidth: 0, height: 30, fontSize: 12, color: "#107c10", borderColor: "#107c10" } }}
                          onClick={() => handleFixDrift(report)}
                        />
                      </Stack>
                    </Stack>
                  </div>
                )}

                {report && !hasDrift && (
                  <Text variant="small" styles={{ root: { color: "#107c10", marginTop: 10, display: "block" } }}>
                    No drift — configuration matches baseline
                  </Text>
                )}

                {/* Actions */}
                <Stack horizontal tokens={{ childrenGap: 6 }} styles={{ root: { marginTop: 12 } }}>
                  <DefaultButton text="Check Now" iconProps={{ iconName: "Sync" }}
                    styles={{ root: { borderRadius: 6, minWidth: 0, padding: "0 10px", height: 28, fontSize: 12 } }}
                    onClick={async () => {
                      try { const r = await checkDrift(b.id); setDriftResults((prev) => ({ ...prev, [b.id]: r })); } catch {}
                    }}
                  />
                  <DefaultButton text="New Baseline" iconProps={{ iconName: "Camera" }}
                    styles={{ root: { borderRadius: 6, minWidth: 0, padding: "0 10px", height: 28, fontSize: 12 } }}
                    onClick={async () => {
                      try {
                        await saveBaseline({ subscriptionId: selectedSubscription, resourceGroup: b.resourceGroup, gatewayName: b.gatewayName });
                        setSuccess(`New baseline saved for ${b.gatewayName}`);
                        const updated = await getBaselines(selectedSubscription); setBaselines(updated); onRefresh();
                      } catch {}
                    }}
                  />
                </Stack>
              </div>
            );
          })}
        </div>
      )}

      {/* Baseline Summary Panel */}
      <Panel isOpen={!!selectedBaseline} onDismiss={() => setSelectedBaseline(null)}
        headerText={`Baseline — ${selectedBaseline?.gatewayName}`} type={PanelType.medium}>
        {selectedBaseline && (() => {
          const s = getBaselineSummary(selectedBaseline);
          const c = selectedBaseline.config || {};
          return (
            <Stack tokens={{ childrenGap: 16 }} styles={{ root: { marginTop: 16 } }}>
              <div className="card">
                <Text variant="medium" styles={{ root: { fontWeight: 700, display: "block", marginBottom: 12 } }}>Snapshot Info</Text>
                <Stack tokens={{ childrenGap: 6 }}>
                  <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Gateway:</Text><Text>{selectedBaseline.gatewayName}</Text></Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Resource Group:</Text><Text>{selectedBaseline.resourceGroup}</Text></Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Saved At:</Text><Text>{new Date(selectedBaseline.createdAt).toLocaleString()}</Text></Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Saved By:</Text><Text>{selectedBaseline.createdBy}</Text></Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>SKU:</Text><Text>{s.sku}</Text></Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>WAF:</Text><span className={`status-badge ${s.waf === "Disabled" ? "status-warning" : "status-pass"}`}>{s.waf}</span></Stack>
                </Stack>
              </div>

              <div className="card">
                <Text variant="medium" styles={{ root: { fontWeight: 700, display: "block", marginBottom: 12 } }}>Configuration Summary</Text>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    { label: "Backend Pools", val: s.pools },
                    { label: "HTTP Listeners", val: s.listeners },
                    { label: "Routing Rules", val: s.rules },
                    { label: "Health Probes", val: s.probes },
                    { label: "HTTP Settings", val: s.httpSettings },
                    { label: "Frontend Ports", val: s.ports },
                    { label: "SSL Certificates", val: s.certs },
                    { label: "Tags", val: Object.keys(c.tags || {}).length },
                  ].map((item) => (
                    <Stack key={item.label} horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                      <Text variant="small" styles={{ root: { fontWeight: 600, minWidth: 120 } }}>{item.label}:</Text>
                      <span className="template-component-count">{item.val}</span>
                    </Stack>
                  ))}
                </div>
              </div>

              {/* Backend Pool Details */}
              {(c.backendAddressPools || []).length > 0 && (
                <div className="card">
                  <Text variant="medium" styles={{ root: { fontWeight: 700, display: "block", marginBottom: 8 } }}>Backend Pools</Text>
                  {c.backendAddressPools.map((pool: any, i: number) => (
                    <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid #f3f2f1" }}>
                      <Text styles={{ root: { fontWeight: 600 } }}>{pool.name}</Text>
                      <Text variant="small" styles={{ root: { color: "#605e5c", display: "block" } }}>
                        {(pool.backendAddresses || []).map((a: any) => a.fqdn || a.ipAddress).join(", ") || "No addresses"}
                      </Text>
                    </div>
                  ))}
                </div>
              )}

              {/* Listeners */}
              {(c.httpListeners || []).length > 0 && (
                <div className="card">
                  <Text variant="medium" styles={{ root: { fontWeight: 700, display: "block", marginBottom: 8 } }}>Listeners</Text>
                  {c.httpListeners.map((l: any, i: number) => (
                    <Stack key={i} horizontal tokens={{ childrenGap: 8 }} styles={{ root: { padding: "4px 0", borderBottom: "1px solid #f3f2f1" } }}>
                      <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>{l.name}</Text>
                      <span className="status-badge status-pass">{l.protocol}</span>
                      {l.hostName && <Text variant="small">{l.hostName}</Text>}
                    </Stack>
                  ))}
                </div>
              )}
            </Stack>
          );
        })()}
      </Panel>

      {/* Drift Detail Panel */}
      <Panel isOpen={!!selectedDrift} onDismiss={() => setSelectedDrift(null)}
        headerText={`Drift Report — ${selectedDrift?.gatewayName}`} type={PanelType.medium}>
        {selectedDrift && (
          <Stack tokens={{ childrenGap: 16 }} styles={{ root: { marginTop: 16 } }}>
            <div className="card">
              <Text variant="medium" styles={{ root: { fontWeight: 700, display: "block", marginBottom: 8 } }}>Drift Summary</Text>
              <Stack tokens={{ childrenGap: 6 }}>
                <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Gateway:</Text><Text>{selectedDrift.gatewayName}</Text></Stack>
                <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Baseline Date:</Text><Text>{new Date(selectedDrift.baselineDate).toLocaleString()}</Text></Stack>
                <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Checked At:</Text><Text>{new Date(selectedDrift.checkedAt).toLocaleString()}</Text></Stack>
                <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Time Since Baseline:</Text><Text>{Math.round((new Date(selectedDrift.checkedAt).getTime() - new Date(selectedDrift.baselineDate).getTime()) / (1000 * 60 * 60))} hours</Text></Stack>
                <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Total Changes:</Text><Text style={{ fontWeight: 700, color: "#d13438" }}>{selectedDrift.totalChanges}</Text></Stack>
              </Stack>
              <Stack horizontal tokens={{ childrenGap: 16 }} styles={{ root: { marginTop: 12 } }}>
                <div style={{ padding: "8px 16px", background: "#dff6dd", borderRadius: 6, textAlign: "center" }}>
                  <Text styles={{ root: { fontWeight: 700, color: "#107c10", fontSize: 20 } }}>{selectedDrift.additions}</Text>
                  <Text variant="small" styles={{ root: { display: "block", color: "#107c10" } }}>Added</Text>
                </div>
                <div style={{ padding: "8px 16px", background: "#fed9cc", borderRadius: 6, textAlign: "center" }}>
                  <Text styles={{ root: { fontWeight: 700, color: "#d13438", fontSize: 20 } }}>{selectedDrift.removals}</Text>
                  <Text variant="small" styles={{ root: { display: "block", color: "#d13438" } }}>Removed</Text>
                </div>
                <div style={{ padding: "8px 16px", background: "#fff4ce", borderRadius: 6, textAlign: "center" }}>
                  <Text styles={{ root: { fontWeight: 700, color: "#c19c00", fontSize: 20 } }}>{selectedDrift.modifications}</Text>
                  <Text variant="small" styles={{ root: { display: "block", color: "#c19c00" } }}>Modified</Text>
                </div>
              </Stack>
            </div>

            {/* Change list */}
            <div className="card">
              <Stack horizontal horizontalAlign="space-between" verticalAlign="center" styles={{ root: { marginBottom: 12 } }}>
                <Text variant="medium" styles={{ root: { fontWeight: 700 } }}>Changes</Text>
                <DefaultButton text="Accept All (Reset Baseline)" iconProps={{ iconName: "Accept" }}
                  styles={{ root: { borderRadius: 6, color: "#107c10", borderColor: "#107c10" } }}
                  onClick={() => handleFixDrift(selectedDrift)}
                />
              </Stack>
              {selectedDrift.changes.map((change: DriftChange, idx: number) => (
                <div key={idx} className="drift-change-item">
                  <div className={`drift-icon-${change.changeType}`}>
                    {change.changeType === "added" ? "+" : change.changeType === "removed" ? "-" : "~"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                      <span className="drift-component-badge">{change.component}</span>
                      <Text styles={{ root: { fontWeight: 600, fontSize: 13 } }}>{change.name}</Text>
                      <span className={`status-badge ${change.changeType === "added" ? "status-pass" : change.changeType === "removed" ? "status-fail" : "status-warning"}`} style={{ fontSize: 10 }}>
                        {change.changeType}
                      </span>
                    </Stack>
                    {change.details && (
                      <Text variant="small" styles={{ root: { color: "#605e5c", marginTop: 4, display: "block" } }}>{change.details}</Text>
                    )}
                    {change.changeType === "modified" && change.baselineValue && change.currentValue && (
                      <div style={{ marginTop: 8, display: "flex", gap: 8, fontSize: 12 }}>
                        <div className="drift-value-baseline">
                          <Text variant="small" styles={{ root: { fontWeight: 600 } }}>Before: </Text>
                          {JSON.stringify(change.baselineValue, null, 1)}
                        </div>
                        <span style={{ color: "#605e5c", alignSelf: "center", fontSize: 16 }}>&rarr;</span>
                        <div className="drift-value-current">
                          <Text variant="small" styles={{ root: { fontWeight: 600 } }}>After: </Text>
                          {JSON.stringify(change.currentValue, null, 1)}
                        </div>
                      </div>
                    )}
                    {change.changeType === "added" && change.currentValue && (
                      <div className="drift-value-current" style={{ marginTop: 6, fontSize: 12 }}>
                        {JSON.stringify(change.currentValue)}
                      </div>
                    )}
                    {change.changeType === "removed" && change.baselineValue && (
                      <div className="drift-value-baseline" style={{ marginTop: 6, fontSize: 12 }}>
                        {JSON.stringify(change.baselineValue)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Stack>
        )}
      </Panel>
    </div>
  );
};
