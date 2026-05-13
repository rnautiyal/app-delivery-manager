import React, { useState } from "react";
import {
  Text,
  Stack,
  PrimaryButton,
  DefaultButton,
  Dialog,
  DialogType,
  DialogFooter,
  TextField,
  Dropdown,
  IDropdownOption,
  MessageBar,
  MessageBarType,
  ChoiceGroup,
  IChoiceGroupOption,
  Separator,
  Panel,
  PanelType,
} from "@fluentui/react";
import { ConfigTemplate, GatewayListItem } from "../../types";
import { saveTemplate, applyTemplate, deleteTemplate, exportTemplate, exportTemplateAsArm, exportTemplateAsBicep, exportTemplateAsTerraform, deployTemplate } from "../../services/api";

interface Props {
  templates: ConfigTemplate[];
  gateways: GatewayListItem[];
  selectedSubscription: string;
  onRefresh: () => void;
}

export const TemplateCards: React.FC<Props> = ({ templates, gateways, selectedSubscription, onRefresh }) => {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [applyId, setApplyId] = useState("");
  const [applyMode, setApplyMode] = useState<"restore" | "deploy">("restore");
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
  const [saveGw, setSaveGw] = useState("");
  const [applyGw, setApplyGw] = useState("");
  // Deploy new fields
  const [deployName, setDeployName] = useState("");
  const [deployRg, setDeployRg] = useState("");
  const [deployLocation, setDeployLocation] = useState("eastus");
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [viewTemplate, setViewTemplate] = useState<ConfigTemplate | null>(null);

  const gwOptions: IDropdownOption[] = gateways.map((g) => ({ key: g.name, text: `${g.name} (${g.resourceGroup})` }));
  const locationOptions: IDropdownOption[] = [
    { key: "eastus", text: "East US" }, { key: "eastus2", text: "East US 2" },
    { key: "westus", text: "West US" }, { key: "westus2", text: "West US 2" },
    { key: "centralus", text: "Central US" }, { key: "northeurope", text: "North Europe" },
    { key: "westeurope", text: "West Europe" }, { key: "southeastasia", text: "Southeast Asia" },
    { key: "canadacentral", text: "Canada Central" }, { key: "canadaeast", text: "Canada East" },
    { key: "uksouth", text: "UK South" }, { key: "japaneast", text: "Japan East" },
  ];
  const applyModeOptions: IChoiceGroupOption[] = [
    { key: "restore", text: "Restore to existing gateway", iconProps: { iconName: "Sync" } },
    { key: "deploy", text: "Deploy as new gateway", iconProps: { iconName: "Add" } },
  ];

  const handleSave = async () => {
    const gw = gateways.find((g) => g.name === saveGw);
    if (!gw || !saveName) return;
    setSaving(true);
    try {
      await saveTemplate({ subscriptionId: selectedSubscription, resourceGroup: gw.resourceGroup, gatewayName: gw.name, name: saveName, description: saveDesc });
      setSuccess(`Template "${saveName}" saved`);
      setShowSaveDialog(false);
      setSaveName("");
      setSaveDesc("");
      setSaveGw("");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      if (applyMode === "restore") {
        const gw = gateways.find((g) => g.name === applyGw);
        if (!gw || !applyId) return;
        await applyTemplate(applyId, { subscriptionId: selectedSubscription, resourceGroup: gw.resourceGroup, gatewayName: gw.name });
        setSuccess(`Template restored to "${gw.name}"`);
      } else {
        // Deploy as new gateway via ARM API
        if (!deployName || !deployRg) { setError("Gateway name and resource group are required"); setApplying(false); return; }
        const result = await deployTemplate(applyId, {
          subscriptionId: selectedSubscription,
          resourceGroup: deployRg,
          gatewayName: deployName,
          location: deployLocation,
        });
        setSuccess(`Gateway "${deployName}" deployed to ${deployRg} (${deployLocation}) — Status: ${result.status}`);
        onRefresh();
      }
      setShowApplyDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply");
    } finally {
      setApplying(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate(id);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleExport = async (id: string, name: string, format: string = "json") => {
    try {
      let content: string;
      let filename: string;
      const safeName = name.replace(/\s+/g, "-").toLowerCase();

      if (format === "arm") {
        const arm = await exportTemplateAsArm(id);
        content = JSON.stringify(arm, null, 2);
        filename = `${safeName}.arm.json`;
      } else if (format === "bicep") {
        const result = await exportTemplateAsBicep(id);
        content = result.content;
        filename = `${safeName}.bicep`;
      } else if (format === "terraform") {
        const result = await exportTemplateAsTerraform(id);
        content = result.content;
        filename = `${safeName}.tf`;
      } else {
        const exported = await exportTemplate(id);
        content = JSON.stringify(exported, null, 2);
        filename = `template-${safeName}.json`;
      }

      const blob = new Blob([content], { type: format === "json" || format === "arm" ? "application/json" : "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to export template");
    }
  };

  return (
    <div>
      {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError("")} styles={{ root: { marginBottom: 8 } }}>{error}</MessageBar>}
      {success && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSuccess("")} styles={{ root: { marginBottom: 8 } }}>{success}</MessageBar>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {templates.map((t) => (
          <div key={t.id} className="card" style={{ padding: "16px", borderLeft: "3px solid #8764b8", cursor: "pointer" }} onClick={() => setViewTemplate(t)}>
            <Text styles={{ root: { fontWeight: 700, fontSize: 14, display: "block", color: "#8764b8" } }}>{t.name}</Text>
            <Text variant="small" styles={{ root: { color: "#605e5c", display: "block", marginTop: 4 } }}>{t.description || "No description"}</Text>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <Text variant="small" styles={{ root: { color: "#a19f9d" } }}>From: {t.sourceGateway.name}</Text>
              <Text variant="small" styles={{ root: { color: "#a19f9d" } }}>
                {new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </Text>
            </div>
            <Stack horizontal wrap tokens={{ childrenGap: 6 }} styles={{ root: { marginTop: 8 } }}>
              <span className="template-component-count">{t.config.backendAddressPools.length} pools</span>
              <span className="template-component-count">{t.config.httpListeners.length} listeners</span>
              <span className="template-component-count">{t.config.requestRoutingRules.length} rules</span>
              <span className="template-component-count">{t.config.probes.length} probes</span>
              {t.config.wafConfiguration && <span className="template-component-count" style={{ background: "#dff6dd", color: "#107c10" }}>WAF</span>}
            </Stack>
            <Stack horizontal tokens={{ childrenGap: 6 }} styles={{ root: { marginTop: 12 } }}>
              <PrimaryButton
                text="Apply"
                styles={{ root: { borderRadius: 6, minWidth: 0, padding: "0 10px", height: 28, fontSize: 12 } }}
                onClick={(e) => {
                  e.stopPropagation();
                  setApplyId(t.id);
                  setApplyMode("restore");
                  setDeployName(`${t.sourceGateway.name}-clone`);
                  setDeployRg(t.sourceGateway.resourceGroup);
                  setShowApplyDialog(true);
                }}
              />
              <DefaultButton
                text="ARM"
                styles={{ root: { borderRadius: 6, minWidth: 0, padding: "0 8px", height: 28, fontSize: 11 } }}
                onClick={(e) => { e.stopPropagation(); handleExport(t.id, t.name, "arm"); }}
              />
              <DefaultButton
                text="Bicep"
                styles={{ root: { borderRadius: 6, minWidth: 0, padding: "0 8px", height: 28, fontSize: 11 } }}
                onClick={(e) => { e.stopPropagation(); handleExport(t.id, t.name, "bicep"); }}
              />
              <DefaultButton
                text="TF"
                styles={{ root: { borderRadius: 6, minWidth: 0, padding: "0 8px", height: 28, fontSize: 11 } }}
                onClick={(e) => { e.stopPropagation(); handleExport(t.id, t.name, "terraform"); }}
              />
              <DefaultButton
                text="Delete"
                styles={{ root: { borderRadius: 6, minWidth: 0, padding: "0 8px", height: 28, fontSize: 12, color: "#d13438", borderColor: "#d13438" } }}
                onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
              />
            </Stack>
          </div>
        ))}

        <div className="card" style={{ padding: "16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 140, border: "2px dashed #edebe9" }}
          onClick={() => setShowSaveDialog(true)}>
          <Stack horizontalAlign="center" tokens={{ childrenGap: 4 }}>
            <span style={{ fontSize: 28, color: "#a19f9d" }}>+</span>
            <Text styles={{ root: { color: "#605e5c" } }}>Save New Template</Text>
          </Stack>
        </div>
      </div>

      {/* Save Dialog */}
      <Dialog hidden={!showSaveDialog} onDismiss={() => setShowSaveDialog(false)}
        dialogContentProps={{ type: DialogType.normal, title: "Save Config Template" }}>
        <Stack tokens={{ childrenGap: 12 }}>
          <Dropdown label="Source Gateway" options={gwOptions} selectedKey={saveGw} onChange={(_, o) => setSaveGw(o?.key as string || "")} required />
          <TextField label="Template Name" value={saveName} onChange={(_, v) => setSaveName(v || "")} required />
          <TextField label="Description" value={saveDesc} onChange={(_, v) => setSaveDesc(v || "")} multiline rows={2} />
        </Stack>
        <DialogFooter>
          <PrimaryButton text={saving ? "Saving..." : "Save"} disabled={!saveName || !saveGw || saving} onClick={handleSave} />
          <DefaultButton text="Cancel" onClick={() => setShowSaveDialog(false)} />
        </DialogFooter>
      </Dialog>

      {/* Template Detail Panel */}
      <Panel
        isOpen={!!viewTemplate}
        onDismiss={() => setViewTemplate(null)}
        headerText={`Template: ${viewTemplate?.name || ""}`}
        type={PanelType.large}
      >
        {viewTemplate && (
          <Stack tokens={{ childrenGap: 16 }} styles={{ root: { padding: "16px 0" } }}>
            {/* Meta info */}
            <div style={{ background: "#f3f2f1", borderRadius: 8, padding: 16 }}>
              <Stack horizontal tokens={{ childrenGap: 32 }} wrap>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Description</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{viewTemplate.description || "No description"}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Source Gateway</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{viewTemplate.sourceGateway.name}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Resource Group</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{viewTemplate.sourceGateway.resourceGroup}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Created</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{new Date(viewTemplate.createdAt).toLocaleString()}</Text></div>
                <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>SKU</Text><br /><Text styles={{ root: { fontWeight: 600 } }}>{viewTemplate.config.sku?.name} / {viewTemplate.config.sku?.tier}</Text></div>
              </Stack>
            </div>

            {/* Summary counts */}
            <Stack horizontal tokens={{ childrenGap: 12 }} wrap>
              {[
                { label: "Backend Pools", count: viewTemplate.config.backendAddressPools.length, color: "#0078d4" },
                { label: "HTTP Settings", count: viewTemplate.config.backendHttpSettingsCollection.length, color: "#8764b8" },
                { label: "Listeners", count: viewTemplate.config.httpListeners.length, color: "#107c10" },
                { label: "Rules", count: viewTemplate.config.requestRoutingRules.length, color: "#ca5010" },
                { label: "Probes", count: viewTemplate.config.probes.length, color: "#005b70" },
                { label: "Frontend Ports", count: viewTemplate.config.frontendPorts.length, color: "#4f6bed" },
              ].map((s) => (
                <div key={s.label} style={{ background: "white", border: "1px solid #edebe9", borderRadius: 8, padding: "10px 20px", textAlign: "center", minWidth: 100 }}>
                  <Text styles={{ root: { fontSize: 24, fontWeight: 700, color: s.color, display: "block" } }}>{s.count}</Text>
                  <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{s.label}</Text>
                </div>
              ))}
              {viewTemplate.config.wafConfiguration && (
                <div style={{ background: "#dff6dd", border: "1px solid #107c10", borderRadius: 8, padding: "10px 20px", textAlign: "center", minWidth: 100 }}>
                  <Text styles={{ root: { fontSize: 24, fontWeight: 700, color: "#107c10", display: "block" } }}>ON</Text>
                  <Text variant="small" styles={{ root: { color: "#107c10" } }}>WAF</Text>
                </div>
              )}
            </Stack>

            {/* Backend Pools */}
            {viewTemplate.config.backendAddressPools.length > 0 && (
              <div style={{ background: "#faf9f8", borderRadius: 8, padding: 16, border: "1px solid #edebe9" }}>
                <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block" } }}>Backend Pools</Text>
                <Stack tokens={{ childrenGap: 6 }}>
                  {viewTemplate.config.backendAddressPools.map((pool: any, i: number) => (
                    <div key={i} style={{ background: "white", borderRadius: 6, padding: "8px 12px", border: "1px solid #edebe9" }}>
                      <Text styles={{ root: { fontWeight: 600 } }}>{pool.name}</Text>
                      {pool.backendAddresses && pool.backendAddresses.length > 0 && (
                        <Text variant="small" styles={{ root: { color: "#605e5c", marginLeft: 12 } }}>
                          {pool.backendAddresses.map((a: any) => a.fqdn || a.ipAddress).join(", ")}
                        </Text>
                      )}
                    </div>
                  ))}
                </Stack>
              </div>
            )}

            {/* Listeners */}
            {viewTemplate.config.httpListeners.length > 0 && (
              <div style={{ background: "#faf9f8", borderRadius: 8, padding: 16, border: "1px solid #edebe9" }}>
                <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block" } }}>HTTP Listeners</Text>
                <Stack tokens={{ childrenGap: 6 }}>
                  {viewTemplate.config.httpListeners.map((l: any, i: number) => (
                    <Stack key={i} horizontal tokens={{ childrenGap: 16 }} style={{ background: "white", borderRadius: 6, padding: "8px 12px", border: "1px solid #edebe9" }}>
                      <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>{l.name}</Text>
                      <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{l.protocol}</Text>
                      {l.hostName && <Text variant="small" styles={{ root: { color: "#0078d4", fontFamily: "monospace" } }}>{l.hostName}</Text>}
                      {l.port && <Text variant="small" styles={{ root: { color: "#605e5c" } }}>:{l.port}</Text>}
                    </Stack>
                  ))}
                </Stack>
              </div>
            )}

            {/* Rules */}
            {viewTemplate.config.requestRoutingRules.length > 0 && (
              <div style={{ background: "#faf9f8", borderRadius: 8, padding: 16, border: "1px solid #edebe9" }}>
                <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block" } }}>Routing Rules</Text>
                <Stack tokens={{ childrenGap: 6 }}>
                  {viewTemplate.config.requestRoutingRules.map((r: any, i: number) => (
                    <Stack key={i} horizontal tokens={{ childrenGap: 16 }} style={{ background: "white", borderRadius: 6, padding: "8px 12px", border: "1px solid #edebe9" }}>
                      <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>{r.name}</Text>
                      <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{r.ruleType || "Basic"}</Text>
                      {r.priority && <Text variant="small" styles={{ root: { color: "#a19f9d" } }}>priority: {r.priority}</Text>}
                    </Stack>
                  ))}
                </Stack>
              </div>
            )}

            {/* Probes */}
            {viewTemplate.config.probes.length > 0 && (
              <div style={{ background: "#faf9f8", borderRadius: 8, padding: 16, border: "1px solid #edebe9" }}>
                <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block" } }}>Health Probes</Text>
                <Stack tokens={{ childrenGap: 6 }}>
                  {viewTemplate.config.probes.map((p: any, i: number) => (
                    <Stack key={i} horizontal tokens={{ childrenGap: 16 }} style={{ background: "white", borderRadius: 6, padding: "8px 12px", border: "1px solid #edebe9" }}>
                      <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>{p.name}</Text>
                      <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{p.protocol}</Text>
                      <Text variant="small" styles={{ root: { fontFamily: "monospace", color: "#0078d4" } }}>{p.host || "*"}:{p.port}{p.path}</Text>
                      <Text variant="small" styles={{ root: { color: "#a19f9d" } }}>interval: {p.interval}s</Text>
                    </Stack>
                  ))}
                </Stack>
              </div>
            )}

            {/* WAF */}
            {viewTemplate.config.wafConfiguration && (
              <div style={{ background: "#faf9f8", borderRadius: 8, padding: 16, border: "1px solid #107c10" }}>
                <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block", color: "#107c10" } }}>WAF Configuration</Text>
                <Stack horizontal tokens={{ childrenGap: 24 }} wrap>
                  <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Enabled:</Text> <Text styles={{ root: { fontWeight: 600 } }}>{viewTemplate.config.wafConfiguration.enabled ? "Yes" : "No"}</Text></div>
                  <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Mode:</Text> <Text styles={{ root: { fontWeight: 600 } }}>{viewTemplate.config.wafConfiguration.firewallMode}</Text></div>
                  <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Rule Set:</Text> <Text styles={{ root: { fontWeight: 600 } }}>{viewTemplate.config.wafConfiguration.ruleSetType} {viewTemplate.config.wafConfiguration.ruleSetVersion}</Text></div>
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
                {JSON.stringify(viewTemplate.config, null, 2)}
              </pre>
            </div>
          </Stack>
        )}
      </Panel>

      {/* Apply / Deploy Dialog */}
      <Dialog hidden={!showApplyDialog} onDismiss={() => setShowApplyDialog(false)}
        dialogContentProps={{ type: DialogType.normal, title: "Apply Template" }}
        minWidth={480}>
        <ChoiceGroup
          selectedKey={applyMode}
          options={applyModeOptions}
          onChange={(_, o) => setApplyMode(o?.key as "restore" | "deploy" || "restore")}
          styles={{ root: { marginBottom: 12 } }}
        />
        <Separator />
        {applyMode === "restore" ? (
          <Stack tokens={{ childrenGap: 8 }} styles={{ root: { marginTop: 8 } }}>
            <Text variant="small" styles={{ root: { color: "#605e5c" } }}>Push this template's config onto an existing gateway. Overwrites backend pools, listeners, rules, probes.</Text>
            <Dropdown label="Target Gateway" options={gwOptions} selectedKey={applyGw} onChange={(_, o) => setApplyGw(o?.key as string || "")} required />
          </Stack>
        ) : (
          <Stack tokens={{ childrenGap: 8 }} styles={{ root: { marginTop: 8 } }}>
            <Text variant="small" styles={{ root: { color: "#605e5c" } }}>Deploy a new Application Gateway with full infrastructure (NSG + VNet + Subnet + Public IP + AppGW) to Azure.</Text>
            <TextField label="New Gateway Name" value={deployName} onChange={(_, v) => setDeployName(v || "")} required placeholder="e.g. appgw-prod-west" />
            <TextField label="Resource Group" value={deployRg} onChange={(_, v) => setDeployRg(v || "")} required placeholder="e.g. myapp-rg" />
            <Dropdown label="Location" options={locationOptions} selectedKey={deployLocation} onChange={(_, o) => setDeployLocation(o?.key as string || "eastus")} />
          </Stack>
        )}
        <DialogFooter>
          <PrimaryButton
            text={applying ? (applyMode === "restore" ? "Restoring..." : "Deploying...") : (applyMode === "restore" ? "Restore" : "Deploy to Azure")}
            disabled={applying || (applyMode === "restore" ? !applyGw : (!deployName || !deployRg))}
            onClick={handleApply}
          />
          <DefaultButton text="Cancel" onClick={() => setShowApplyDialog(false)} />
        </DialogFooter>
      </Dialog>
    </div>
  );
};
