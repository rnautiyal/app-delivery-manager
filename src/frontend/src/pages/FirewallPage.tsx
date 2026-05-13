import React, { useState, useEffect } from "react";
import {
  Stack,
  Text,
  Spinner,
  MessageBar,
  MessageBarType,
  DefaultButton,
  PrimaryButton,
  SearchBox,
  Pivot,
  PivotItem,
  Panel,
  PanelType,
} from "@fluentui/react";
import { SubscriptionPicker } from "../components/SubscriptionPicker";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { getAccessToken } from "../services/api";
import axios from "axios";

interface AzureFirewall {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  sku: any;
  threatIntelMode: string;
  provisioningState: string;
  firewallPolicyId?: string;
  firewallPolicyName?: string;
  ipConfigurations: any[];
  zones: string[];
  virtualHub?: { id: string; name: string };
  networkRuleCollectionCount: number;
  applicationRuleCollectionCount: number;
  natRuleCollectionCount: number;
  tags: Record<string, string>;
}

interface FirewallPolicy {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  sku: any;
  threatIntelMode: string;
  provisioningState: string;
  dnsSettings: any;
  intrusionDetection?: { mode: string; profileType?: string };
  transportSecurity?: { enabled: boolean };
  insights?: { enabled: boolean };
  childPolicies: string[];
  firewalls: string[];
  ruleCollectionGroups: string[];
  basePolicy?: string;
  tags: Record<string, string>;
}

export function FirewallPage() {
  const { subscriptions, selectedSubscription, setSelectedSubscription, loading: subLoading } = useSubscriptions();
  const [firewalls, setFirewalls] = useState<AzureFirewall[]>([]);
  const [policies, setPolicies] = useState<FirewallPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedFw, setSelectedFw] = useState<AzureFirewall | null>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<FirewallPolicy | null>(null);
  const [ruleGroups, setRuleGroups] = useState<any[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);

  useEffect(() => {
    if (selectedSubscription) loadData();
  }, [selectedSubscription]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [fwRes, polRes] = await Promise.all([
        axios.get(`/api/firewall/firewalls/${selectedSubscription}`, { headers }),
        axios.get(`/api/firewall/policies/${selectedSubscription}`, { headers }),
      ]);
      setFirewalls(fwRes.data.data || []);
      setPolicies(polRes.data.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load firewall data");
    } finally {
      setLoading(false);
    }
  }

  async function loadRuleGroups(policy: FirewallPolicy) {
    setRulesLoading(true);
    setRuleGroups([]);
    try {
      const token = await getAccessToken();
      const res = await axios.get(
        `/api/firewall/policies/${selectedSubscription}/${policy.resourceGroup}/${policy.name}/rules`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRuleGroups(res.data.data || []);
    } catch {
      setRuleGroups([]);
    } finally {
      setRulesLoading(false);
    }
  }

  const filteredFw = firewalls.filter(
    (fw) => fw.name.toLowerCase().includes(search.toLowerCase()) || fw.resourceGroup.toLowerCase().includes(search.toLowerCase())
  );
  const filteredPolicies = policies.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.resourceGroup.toLowerCase().includes(search.toLowerCase())
  );

  const threatColor = (mode: string) => {
    switch (mode) {
      case "Alert": return { bg: "#fff4ce", color: "#c19c00" };
      case "Deny": return { bg: "#dff6dd", color: "#107c10" };
      case "Off": return { bg: "#fce4e4", color: "#d13438" };
      default: return { bg: "#f3f2f1", color: "#605e5c" };
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
          <Text variant="xxLarge" styles={{ root: { fontWeight: 700 } }}>Firewall Manager</Text>
          <span style={{ fontSize: 11, background: "#0078d4", color: "white", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
            {firewalls.length} Firewalls
          </span>
          <span style={{ fontSize: 11, background: "#5c2d91", color: "white", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
            {policies.length} Policies
          </span>
        </Stack>
      </div>

      <Stack horizontal tokens={{ childrenGap: 16 }} styles={{ root: { marginBottom: 16 } }}>
        <SubscriptionPicker subscriptions={subscriptions} selectedSubscription={selectedSubscription || ""} onChange={setSelectedSubscription} loading={subLoading} />
        <SearchBox placeholder="Search firewalls or policies..." value={search} onChange={(_, v) => setSearch(v || "")} styles={{ root: { width: 300 } }} />
        <DefaultButton text="Refresh" iconProps={{ iconName: "Refresh" }} onClick={loadData} styles={{ root: { borderRadius: 6 } }} />
      </Stack>

      {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError(null)} styles={{ root: { marginBottom: 16 } }}>{error}</MessageBar>}

      {loading ? (
        <Spinner label="Loading firewalls and policies..." />
      ) : (
        <Pivot>
          {/* ====== FIREWALLS TAB ====== */}
          <PivotItem headerText={`Azure Firewalls (${filteredFw.length})`} itemIcon="Firewall">
            {filteredFw.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 40 }}>
                <Text styles={{ root: { color: "#605e5c" } }}>No Azure Firewalls found in this subscription</Text>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16, marginTop: 16 }}>
                {filteredFw.map((fw) => {
                  const ti = threatColor(fw.threatIntelMode);
                  return (
                    <div key={fw.id} className="card" style={{ padding: 20, cursor: "pointer", borderLeft: "4px solid #0078d4" }}
                      onClick={() => setSelectedFw(fw)}>
                      <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
                        <Text styles={{ root: { fontWeight: 700, fontSize: 16 } }}>{fw.name}</Text>
                        <span className={`status-badge ${fw.provisioningState === "Succeeded" ? "status-pass" : "status-warning"}`}>
                          {fw.provisioningState}
                        </span>
                      </Stack>
                      <Stack horizontal tokens={{ childrenGap: 12 }} styles={{ root: { marginTop: 8 } }}>
                        <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{fw.resourceGroup}</Text>
                        <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{fw.location}</Text>
                        <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{fw.sku?.tier || "Standard"}</Text>
                      </Stack>
                      <Stack horizontal tokens={{ childrenGap: 8 }} styles={{ root: { marginTop: 10 } }}>
                        <span style={{ background: ti.bg, color: ti.color, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                          Threat Intel: {fw.threatIntelMode || "Off"}
                        </span>
                        {fw.zones.length > 0 && (
                          <span style={{ background: "#dff6dd", color: "#107c10", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                            Zones: {fw.zones.join(", ")}
                          </span>
                        )}
                        {fw.firewallPolicyName && (
                          <span style={{ background: "#e8e0f5", color: "#5c2d91", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                            Policy: {fw.firewallPolicyName}
                          </span>
                        )}
                      </Stack>
                      <Stack horizontal tokens={{ childrenGap: 12 }} styles={{ root: { marginTop: 10 } }}>
                        {fw.ipConfigurations.map((ip, i) => (
                          <Text key={i} variant="small" styles={{ root: { fontFamily: "monospace", color: "#0078d4" } }}>
                            {ip.privateIPAddress || ip.publicIPAddressName || "—"}
                          </Text>
                        ))}
                      </Stack>
                      <Stack horizontal tokens={{ childrenGap: 8 }} styles={{ root: { marginTop: 8 } }}>
                        <span className="template-component-count">{fw.networkRuleCollectionCount} network rules</span>
                        <span className="template-component-count">{fw.applicationRuleCollectionCount} app rules</span>
                        <span className="template-component-count">{fw.natRuleCollectionCount} NAT rules</span>
                      </Stack>
                    </div>
                  );
                })}
              </div>
            )}
          </PivotItem>

          {/* ====== POLICIES TAB ====== */}
          <PivotItem headerText={`Firewall Policies (${filteredPolicies.length})`} itemIcon="Shield">
            {filteredPolicies.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 40 }}>
                <Text styles={{ root: { color: "#605e5c" } }}>No Firewall Policies found in this subscription</Text>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16, marginTop: 16 }}>
                {filteredPolicies.map((p) => {
                  const ti = threatColor(p.threatIntelMode);
                  return (
                    <div key={p.id} className="card" style={{ padding: 20, cursor: "pointer", borderLeft: "4px solid #5c2d91" }}
                      onClick={() => { setSelectedPolicy(p); loadRuleGroups(p); }}>
                      <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
                        <Text styles={{ root: { fontWeight: 700, fontSize: 16 } }}>{p.name}</Text>
                        <span className={`status-badge ${p.provisioningState === "Succeeded" ? "status-pass" : "status-warning"}`}>
                          {p.provisioningState}
                        </span>
                      </Stack>
                      <Stack horizontal tokens={{ childrenGap: 12 }} styles={{ root: { marginTop: 8 } }}>
                        <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{p.resourceGroup}</Text>
                        <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{p.location}</Text>
                        <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{p.sku?.tier || "Standard"}</Text>
                      </Stack>
                      <Stack horizontal tokens={{ childrenGap: 8 }} styles={{ root: { marginTop: 10 } }}>
                        <span style={{ background: ti.bg, color: ti.color, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                          Threat Intel: {p.threatIntelMode || "Off"}
                        </span>
                        {p.intrusionDetection && (
                          <span style={{
                            background: p.intrusionDetection.mode === "Deny" ? "#dff6dd" : p.intrusionDetection.mode === "Alert" ? "#fff4ce" : "#f3f2f1",
                            color: p.intrusionDetection.mode === "Deny" ? "#107c10" : p.intrusionDetection.mode === "Alert" ? "#c19c00" : "#605e5c",
                            padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600
                          }}>
                            IDPS: {p.intrusionDetection.mode}
                          </span>
                        )}
                        {p.dnsSettings && (
                          <span style={{ background: "#e8f4fd", color: "#0078d4", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                            DNS Proxy
                          </span>
                        )}
                      </Stack>
                      <Stack horizontal tokens={{ childrenGap: 8 }} styles={{ root: { marginTop: 10 } }}>
                        <span className="template-component-count">{p.ruleCollectionGroups.length} rule groups</span>
                        <span className="template-component-count">{p.firewalls.length} firewalls</span>
                        {p.childPolicies.length > 0 && <span className="template-component-count">{p.childPolicies.length} child policies</span>}
                        {p.basePolicy && <span className="template-component-count">inherits: {p.basePolicy}</span>}
                      </Stack>
                    </div>
                  );
                })}
              </div>
            )}
          </PivotItem>
        </Pivot>
      )}

      {/* Firewall Detail Panel */}
      <Panel isOpen={!!selectedFw} onDismiss={() => setSelectedFw(null)} headerText={`Firewall: ${selectedFw?.name || ""}`} type={PanelType.large}>
        {selectedFw && (
          <Stack tokens={{ childrenGap: 16 }} styles={{ root: { padding: "16px 0" } }}>
            <div style={{ background: "#f3f2f1", borderRadius: 8, padding: 16 }}>
              <Stack horizontal tokens={{ childrenGap: 32 }} wrap>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Resource Group</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{selectedFw.resourceGroup}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Location</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{selectedFw.location}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>SKU</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{selectedFw.sku?.name} / {selectedFw.sku?.tier}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Threat Intel</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{selectedFw.threatIntelMode || "Off"}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Zones</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{selectedFw.zones.length > 0 ? selectedFw.zones.join(", ") : "None"}</Text></div>
                {selectedFw.firewallPolicyName && <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Linked Policy</Text><br /><Text styles={{ root: { fontWeight: 600, color: "#5c2d91" } }}>{selectedFw.firewallPolicyName}</Text></div>}
              </Stack>
            </div>
            <div style={{ background: "#faf9f8", borderRadius: 8, padding: 16, border: "1px solid #edebe9" }}>
              <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block" } }}>IP Configurations</Text>
              <Stack tokens={{ childrenGap: 6 }}>
                {selectedFw.ipConfigurations.map((ip, i) => (
                  <Stack key={i} horizontal tokens={{ childrenGap: 16 }} style={{ background: "white", borderRadius: 6, padding: "8px 12px", border: "1px solid #edebe9" }}>
                    <Text styles={{ root: { fontWeight: 600, minWidth: 120 } }}>{ip.name}</Text>
                    <Text variant="small" styles={{ root: { fontFamily: "monospace", color: "#0078d4" } }}>Private: {ip.privateIPAddress || "—"}</Text>
                    {ip.publicIPAddressName && <Text variant="small" styles={{ root: { color: "#605e5c" } }}>Public IP: {ip.publicIPAddressName}</Text>}
                  </Stack>
                ))}
              </Stack>
            </div>
            <Stack horizontal tokens={{ childrenGap: 12 }}>
              <div style={{ background: "white", border: "1px solid #edebe9", borderRadius: 8, padding: "10px 20px", textAlign: "center", minWidth: 100 }}>
                <Text styles={{ root: { fontSize: 24, fontWeight: 700, color: "#0078d4", display: "block" } }}>{selectedFw.networkRuleCollectionCount}</Text>
                <Text variant="small" styles={{ root: { color: "#605e5c" } }}>Network Rules</Text>
              </div>
              <div style={{ background: "white", border: "1px solid #edebe9", borderRadius: 8, padding: "10px 20px", textAlign: "center", minWidth: 100 }}>
                <Text styles={{ root: { fontSize: 24, fontWeight: 700, color: "#5c2d91", display: "block" } }}>{selectedFw.applicationRuleCollectionCount}</Text>
                <Text variant="small" styles={{ root: { color: "#605e5c" } }}>App Rules</Text>
              </div>
              <div style={{ background: "white", border: "1px solid #edebe9", borderRadius: 8, padding: "10px 20px", textAlign: "center", minWidth: 100 }}>
                <Text styles={{ root: { fontSize: 24, fontWeight: 700, color: "#d83b01", display: "block" } }}>{selectedFw.natRuleCollectionCount}</Text>
                <Text variant="small" styles={{ root: { color: "#605e5c" } }}>NAT Rules</Text>
              </div>
            </Stack>
          </Stack>
        )}
      </Panel>

      {/* Policy Detail Panel */}
      <Panel isOpen={!!selectedPolicy} onDismiss={() => { setSelectedPolicy(null); setRuleGroups([]); }} headerText={`Policy: ${selectedPolicy?.name || ""}`} type={PanelType.large}>
        {selectedPolicy && (
          <Stack tokens={{ childrenGap: 16 }} styles={{ root: { padding: "16px 0" } }}>
            <div style={{ background: "#f3f2f1", borderRadius: 8, padding: 16 }}>
              <Stack horizontal tokens={{ childrenGap: 32 }} wrap>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Resource Group</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{selectedPolicy.resourceGroup}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Location</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{selectedPolicy.location}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>SKU</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{selectedPolicy.sku?.tier || "Standard"}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Threat Intel</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{selectedPolicy.threatIntelMode || "Off"}</Text></div>
                {selectedPolicy.intrusionDetection && <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>IDPS</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{selectedPolicy.intrusionDetection.mode}</Text></div>}
                {selectedPolicy.basePolicy && <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Base Policy</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{selectedPolicy.basePolicy}</Text></div>}
              </Stack>
            </div>
            <div style={{ background: "#faf9f8", borderRadius: 8, padding: 16, border: "1px solid #edebe9" }}>
              <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block" } }}>
                Linked Firewalls ({selectedPolicy.firewalls.length})
              </Text>
              {selectedPolicy.firewalls.length === 0 ? (
                <Text variant="small" styles={{ root: { color: "#a19f9d", fontStyle: "italic" } }}>No firewalls using this policy</Text>
              ) : (
                <Stack horizontal wrap tokens={{ childrenGap: 8 }}>
                  {selectedPolicy.firewalls.map((fw, i) => (
                    <span key={i} style={{ background: "#e8f4fd", color: "#0078d4", padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>{fw}</span>
                  ))}
                </Stack>
              )}
            </div>
            <div style={{ background: "#faf9f8", borderRadius: 8, padding: 16, border: "1px solid #edebe9" }}>
              <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block" } }}>
                Rule Collection Groups ({ruleGroups.length})
              </Text>
              {rulesLoading ? (
                <Spinner label="Loading rule groups..." />
              ) : ruleGroups.length === 0 ? (
                <Text variant="small" styles={{ root: { color: "#a19f9d", fontStyle: "italic" } }}>No rule collection groups</Text>
              ) : (
                <Stack tokens={{ childrenGap: 8 }}>
                  {ruleGroups.map((rg, i) => (
                    <div key={i} style={{ background: "white", borderRadius: 6, padding: 12, border: "1px solid #edebe9" }}>
                      <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
                        <Text styles={{ root: { fontWeight: 600 } }}>{rg.name}</Text>
                        <Text variant="small" styles={{ root: { color: "#a19f9d" } }}>priority: {rg.priority}</Text>
                      </Stack>
                      {(rg.ruleCollections || []).length > 0 && (
                        <Stack tokens={{ childrenGap: 4 }} styles={{ root: { marginTop: 8 } }}>
                          {rg.ruleCollections.map((rc: any, j: number) => (
                            <Stack key={j} horizontal tokens={{ childrenGap: 12 }} style={{ fontSize: 12, padding: "4px 8px", background: "#faf9f8", borderRadius: 4 }}>
                              <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>{rc.name}</Text>
                              <span className="template-component-count">{rc.ruleCollectionType?.replace("FirewallPolicy", "")}</span>
                              <Text variant="small" styles={{ root: { color: "#a19f9d" } }}>priority: {rc.priority}</Text>
                              <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{rc.rulesCount} rules</Text>
                              {rc.action && <Text variant="small" styles={{ root: { color: rc.action.type === "Allow" ? "#107c10" : "#d13438", fontWeight: 600 } }}>{rc.action.type}</Text>}
                            </Stack>
                          ))}
                        </Stack>
                      )}
                    </div>
                  ))}
                </Stack>
              )}
            </div>
          </Stack>
        )}
      </Panel>
    </div>
  );
}
