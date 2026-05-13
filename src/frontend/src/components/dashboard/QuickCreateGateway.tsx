import React, { useState } from "react";
import {
  Stack,
  Text,
  TextField,
  PrimaryButton,
  Dropdown,
  IDropdownOption,
  MessageBar,
  MessageBarType,
  Spinner,
  ProgressIndicator,
  Pivot,
  PivotItem,
} from "@fluentui/react";
import { getAccessToken, createAfdFullProfile } from "../../services/api";
import { AppGatewayIcon, FrontDoorIcon, TrafficManagerIcon } from "../AzureIcons";
import axios from "axios";

interface Props {
  selectedSubscription: string;
  onComplete: () => void;
}

const skuOptions: IDropdownOption[] = [
  { key: "WAF_v2", text: "WAF_v2 (Recommended)" },
  { key: "Standard_v2", text: "Standard_v2" },
];

const regionOptions: IDropdownOption[] = [
  { key: "eastus", text: "East US" },
  { key: "eastus2", text: "East US 2" },
  { key: "westus2", text: "West US 2" },
  { key: "centralus", text: "Central US" },
  { key: "westeurope", text: "West Europe" },
  { key: "northeurope", text: "North Europe" },
  { key: "southeastasia", text: "Southeast Asia" },
  { key: "japaneast", text: "Japan East" },
  { key: "australiaeast", text: "Australia East" },
  { key: "uksouth", text: "UK South" },
];

interface RegionStatus {
  region: string;
  regionLabel: string;
  status: "pending" | "running" | "done" | "error";
  message?: string;
}

export const QuickCreateGateway: React.FC<Props> = ({ selectedSubscription, onComplete }) => {
  const [name, setName] = useState("demo-appgw");
  const [selectedRegions, setSelectedRegions] = useState<string[]>(["eastus"]);
  const [sku, setSku] = useState("WAF_v2");
  const [backendIp, setBackendIp] = useState("10.0.2.4");
  const [backendPort, setBackendPort] = useState("80");
  const [listenerName, setListenerName] = useState("default-listener");
  const [ruleName, setRuleName] = useState("default-rule");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [regionStatuses, setRegionStatuses] = useState<RegionStatus[]>([]);

  const createInRegion = async (region: string, regionLabel: string, token: string, idx: number) => {
    const suffix = selectedRegions.length > 1 ? `-${region.replace(/[^a-z0-9]/g, "").slice(0, 4)}` : "";
    const gwName = `${name}${suffix}`;

    setRegionStatuses((prev) => prev.map((r, i) => i === idx ? { ...r, status: "running" } : r));

    try {
      const message = `Create a gateway NOW with these EXACT parameters. Do NOT ask questions, just build it:
- Name: ${gwName}
- Region: ${region}
- SKU: ${sku}
- Resource Group: ${gwName}-rg
- Backend IP: ${backendIp}
- Backend Port: ${backendPort}
- Listener name: ${listenerName}
- Routing rule name: ${ruleName}
- Listener: HTTP on port 80
- Health probe path: /
${sku.includes("WAF") ? `- Create a WAF policy named ${gwName}-waf-policy and link it to the gateway` : ""}
Start building immediately. Use these exact names. Do NOT ask any questions.`;

      const resp = await axios.post("/api/chat", { message }, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 600000,
      });

      const aiResponse = resp.data?.data?.response || "";
      const failed = aiResponse.toLowerCase().includes("failed to start gateway creation");

      setRegionStatuses((prev) => prev.map((r, i) =>
        i === idx ? { ...r, status: failed ? "error" : "done", message: failed ? "Gateway creation failed" : `${gwName} provisioning (~6 min)` } : r
      ));

      return !failed;
    } catch (err: any) {
      setRegionStatuses((prev) => prev.map((r, i) =>
        i === idx ? { ...r, status: "error", message: err?.message || "Failed" } : r
      ));
      return false;
    }
  };

  const handleCreate = async () => {
    if (!name || !selectedSubscription || !backendIp || selectedRegions.length === 0) return;
    setCreating(true);
    setError("");
    setSuccess("");

    const statuses: RegionStatus[] = selectedRegions.map((r) => ({
      region: r,
      regionLabel: regionOptions.find((o) => o.key === r)?.text || r,
      status: "pending" as const,
    }));
    setRegionStatuses(statuses);

    try {
      const token = await getAccessToken();
      let successCount = 0;
      for (let i = 0; i < selectedRegions.length; i++) {
        const ok = await createInRegion(selectedRegions[i], statuses[i].regionLabel, token, i);
        if (ok) successCount++;
      }

      if (successCount === selectedRegions.length) {
        setSuccess(`All ${successCount} gateway(s) created successfully! Provisioning takes ~6 minutes per gateway.`);
      } else if (successCount > 0) {
        setSuccess(`${successCount}/${selectedRegions.length} gateway(s) created. Check errors below.`);
      } else {
        setError("All gateway creations failed. Check the debug logs.");
      }

      onComplete();
    } catch (err: any) {
      setError(err?.message || "Failed to create gateways");
    } finally {
      setCreating(false);
    }
  };

  const [activeTab, setActiveTab] = useState("appgw");
  const [afdName, setAfdName] = useState("my-frontdoor");
  const [afdRg, setAfdRg] = useState("my-afd-rg");
  const [afdSku, setAfdSku] = useState("Standard_AzureFrontDoor");
  const [afdEndpointName, setAfdEndpointName] = useState("my-endpoint");
  const [afdOriginGroupName, setAfdOriginGroupName] = useState("default-origin-group");
  const [afdOriginName, setAfdOriginName] = useState("my-origin");
  const [afdOriginHost, setAfdOriginHost] = useState("");
  const [afdRouteName, setAfdRouteName] = useState("default-route");
  const [afdProbeProtocol, setAfdProbeProtocol] = useState("Https");
  const [afdProbePath, setAfdProbePath] = useState("/");
  const [afdProbeInterval, setAfdProbeInterval] = useState("100");
  const [afdSteps, setAfdSteps] = useState<{ step: string; status: string; message: string }[]>([]);
  const [tmName, setTmName] = useState("my-traffic-mgr");
  const [tmMethod, setTmMethod] = useState("Performance");
  const [tmEndpoints, setTmEndpoints] = useState("");

  const afdSkuOptions: IDropdownOption[] = [
    { key: "Standard_AzureFrontDoor", text: "Standard" },
    { key: "Premium_AzureFrontDoor", text: "Premium (WAF + Private Link)" },
  ];
  const tmMethodOptions: IDropdownOption[] = [
    { key: "Performance", text: "Performance" },
    { key: "Priority", text: "Priority" },
    { key: "Weighted", text: "Weighted" },
    { key: "Geographic", text: "Geographic" },
  ];

  const handleCreateAfd = async () => {
    if (!afdName || !afdOriginHost || !selectedSubscription) return;
    setCreating(true); setError(""); setSuccess(""); setAfdSteps([]);
    try {
      const result = await createAfdFullProfile(selectedSubscription, {
        resourceGroup: afdRg,
        location: "eastus",
        profileName: afdName,
        sku: afdSku,
        endpointName: afdEndpointName,
        originGroupName: afdOriginGroupName,
        originName: afdOriginName,
        originHostName: afdOriginHost,
        originHostHeader: afdOriginHost,
        routeName: afdRouteName,
        probeProtocol: afdProbeProtocol,
        probePath: afdProbePath,
        probeIntervalInSeconds: parseInt(afdProbeInterval) || 100,
      });
      setAfdSteps(result.steps || []);
      if (result.status === "success") {
        setSuccess(`Front Door "${afdName}" created successfully!`);
      } else {
        setError(`Front Door creation ${result.status}. Check steps below.`);
      }
      onComplete();
    } catch (e: any) { setError(e?.response?.data?.error || e?.message || "Failed"); }
    finally { setCreating(false); }
  };

  const handleCreateTm = async () => {
    if (!tmName) return;
    setCreating(true); setError(""); setSuccess("");
    try {
      const token = await getAccessToken();
      const msg = `Create a Traffic Manager profile NOW with these EXACT parameters:
- Profile Name: ${tmName}
- Resource Group: ${tmName}-rg
- Routing Method: ${tmMethod}
- Monitor Protocol: HTTP, Port: 80, Path: /
${tmEndpoints ? `- Add endpoints: ${tmEndpoints}` : ""}
Create it immediately. Do NOT ask questions.`;
      await axios.post("/api/chat", { message: msg }, { headers: { Authorization: `Bearer ${token}` }, timeout: 600000 });
      setSuccess(`Traffic Manager "${tmName}" creation started.`);
      onComplete();
    } catch (e: any) { setError(e?.message || "Failed"); }
    finally { setCreating(false); }
  };

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError("")}>{error}</MessageBar>}
      {success && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSuccess("")}>{success}</MessageBar>}

      {/* Resource Type Tabs */}
      <div style={{ display: "flex", borderBottom: "2px solid #edebe9" }}>
        {[
          { key: "appgw", label: "Application Gateway", icon: <AppGatewayIcon size={18} /> },
          { key: "afd", label: "Front Door", icon: <FrontDoorIcon size={18} /> },
          { key: "tm", label: "Traffic Manager", icon: <TrafficManagerIcon size={18} /> },
        ].map(tab => (
          <div key={tab.key}
            onClick={() => !creating && setActiveTab(tab.key)}
            style={{
              flex: 1, padding: "12px 16px", cursor: creating ? "default" : "pointer", textAlign: "center",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: activeTab === tab.key ? "white" : "#faf9f8",
              borderBottom: activeTab === tab.key ? "2px solid #0078d4" : "2px solid transparent",
              marginBottom: -2, fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? "#0078d4" : "#605e5c",
              transition: "all 0.15s",
            }}>
            {tab.icon}
            <span style={{ fontSize: 13 }}>{tab.label}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: 20 }}>
        {creating ? (
          <Stack tokens={{ childrenGap: 12 }}>
            <Text variant="large" styles={{ root: { fontWeight: 700 } }}>Provisioning...</Text>
            <ProgressIndicator description="Creating resources in Azure..." />
            {regionStatuses.map((rs, i) => (
              <Stack key={i} horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}
                styles={{ root: { padding: "8px 12px", background: rs.status === "error" ? "#fdf3f4" : rs.status === "done" ? "#f0fff0" : "white", border: "1px solid #edebe9", borderRadius: 6, borderLeft: `3px solid ${rs.status === "done" ? "#107c10" : rs.status === "error" ? "#d13438" : rs.status === "running" ? "#0078d4" : "#c8c6c4"}` } }}>
                <span style={{ fontSize: 16 }}>{rs.status === "done" ? "✅" : rs.status === "running" ? "⏳" : rs.status === "error" ? "❌" : "⭕"}</span>
                <Stack styles={{ root: { flex: 1 } }}>
                  <Text styles={{ root: { fontWeight: 600, fontSize: 13 } }}>{rs.regionLabel}</Text>
                  {rs.message && <Text variant="small" styles={{ root: { color: rs.status === "error" ? "#d13438" : "#605e5c" } }}>{rs.message}</Text>}
                </Stack>
                {rs.status === "running" && <Spinner size={1} />}
              </Stack>
            ))}
          </Stack>
        ) : (
          <>
            {/* ===== Application Gateway Tab ===== */}
            {activeTab === "appgw" && (
              <Stack tokens={{ childrenGap: 14 }}>
                <Text variant="medium" styles={{ root: { fontWeight: 600, color: "#0078d4" } }}>Create an Application Gateway with WAF, backend pool, and health probe</Text>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 120px", gap: 12 }}>
                  <TextField label="Name" value={name} onChange={(_, v) => setName(v || "")} required />
                  <Dropdown label="SKU" options={skuOptions} selectedKey={sku} onChange={(_, o) => setSku(o?.key as string)} />
                  <TextField label="Backend IP" value={backendIp} onChange={(_, v) => setBackendIp(v || "")} required placeholder="10.0.2.4" />
                  <TextField label="Port" type="number" value={backendPort} onChange={(_, v) => setBackendPort(v || "80")} />
                </div>
                <Dropdown label="Regions" multiSelect options={regionOptions} selectedKeys={selectedRegions}
                  onChange={(_, opt) => { if (opt) setSelectedRegions(prev => opt.selected ? [...prev, opt.key as string] : prev.filter(k => k !== opt.key)); }}
                  placeholder="Select regions" styles={{ root: { maxWidth: 500 } }} />
                <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
                  <PrimaryButton text={selectedRegions.length > 1 ? `Create ${selectedRegions.length} Gateways` : "Create Gateway"} iconProps={{ iconName: "Add" }}
                    disabled={!name || !backendIp || !selectedSubscription || selectedRegions.length === 0} onClick={handleCreate}
                    styles={{ root: { borderRadius: 6 } }} />
                  <Text variant="small" styles={{ root: { color: "#a19f9d" } }}>~6 min per gateway</Text>
                </Stack>
              </Stack>
            )}

            {/* ===== Front Door Tab ===== */}
            {activeTab === "afd" && (
              <Stack tokens={{ childrenGap: 14 }}>
                <Text variant="medium" styles={{ root: { fontWeight: 600, color: "#008272" } }}>Create a complete Front Door profile with endpoint, origin, and route</Text>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <TextField label="Profile Name" value={afdName} onChange={(_, v) => setAfdName(v || "")} required />
                  <TextField label="Resource Group" value={afdRg} onChange={(_, v) => setAfdRg(v || "")} required />
                  <Dropdown label="SKU" options={afdSkuOptions} selectedKey={afdSku} onChange={(_, o) => setAfdSku(o?.key as string)} />
                </div>
                <TextField label="Origin Hostname (required)" value={afdOriginHost} onChange={(_, v) => setAfdOriginHost(v || "")} required
                  placeholder="myapp.azurewebsites.net" description="The backend origin that Front Door routes traffic to" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                  <TextField label="Endpoint" value={afdEndpointName} onChange={(_, v) => setAfdEndpointName(v || "")} />
                  <TextField label="Origin Group" value={afdOriginGroupName} onChange={(_, v) => setAfdOriginGroupName(v || "")} />
                  <TextField label="Origin Name" value={afdOriginName} onChange={(_, v) => setAfdOriginName(v || "")} />
                  <TextField label="Route Name" value={afdRouteName} onChange={(_, v) => setAfdRouteName(v || "")} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <Dropdown label="Probe Protocol" options={[{key:"Https",text:"HTTPS"},{key:"Http",text:"HTTP"}]} selectedKey={afdProbeProtocol} onChange={(_,o) => setAfdProbeProtocol(o?.key as string)} />
                  <TextField label="Probe Path" value={afdProbePath} onChange={(_, v) => setAfdProbePath(v || "/")} />
                  <TextField label="Probe Interval (s)" type="number" value={afdProbeInterval} onChange={(_, v) => setAfdProbeInterval(v || "100")} />
                </div>
                {afdSteps.length > 0 && (
                  <Stack tokens={{ childrenGap: 4 }}>
                    {afdSteps.map((s, i) => (
                      <Stack key={i} horizontal tokens={{ childrenGap: 8 }} verticalAlign="center"
                        styles={{ root: { padding: "6px 10px", borderRadius: 4, background: s.status === "success" ? "#f0fff0" : "#fdf3f4", borderLeft: `3px solid ${s.status === "success" ? "#107c10" : "#d13438"}` } }}>
                        <span style={{ fontSize: 14 }}>{s.status === "success" ? "✅" : "❌"}</span>
                        <Text variant="small" styles={{ root: { fontWeight: 600, minWidth: 100 } }}>{s.step}</Text>
                        <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{s.message}</Text>
                      </Stack>
                    ))}
                  </Stack>
                )}
                <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
                  <PrimaryButton text="Create Front Door" iconProps={{ iconName: "Add" }}
                    disabled={!afdName || !afdOriginHost || !selectedSubscription || creating} onClick={handleCreateAfd}
                    styles={{ root: { borderRadius: 6 } }} />
                  {creating && <Spinner size={1} />}
                  <Text variant="small" styles={{ root: { color: "#a19f9d" } }}>Creates profile, endpoint, origin group, origin & route</Text>
                </Stack>
              </Stack>
            )}

            {/* ===== Traffic Manager Tab ===== */}
            {activeTab === "tm" && (
              <Stack tokens={{ childrenGap: 14 }}>
                <Text variant="medium" styles={{ root: { fontWeight: 600, color: "#5c2d91" } }}>Create a Traffic Manager profile with DNS-based global load balancing</Text>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <TextField label="Profile Name" value={tmName} onChange={(_, v) => setTmName(v || "")} required />
                  <TextField label="Resource Group" value={`${tmName}-rg`} onChange={() => {}} description="Auto-generated" readOnly />
                  <Dropdown label="Routing Method" options={tmMethodOptions} selectedKey={tmMethod} onChange={(_, o) => setTmMethod(o?.key as string)} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                  <Dropdown label="Monitor Protocol" options={[{key:"HTTP",text:"HTTP"},{key:"HTTPS",text:"HTTPS"},{key:"TCP",text:"TCP"}]} selectedKey="HTTP" />
                  <TextField label="Monitor Port" value="80" readOnly />
                  <TextField label="Monitor Path" value="/" />
                  <TextField label="DNS TTL (s)" value="60" />
                </div>
                <TextField label="Endpoints (comma-separated FQDNs)" value={tmEndpoints} onChange={(_, v) => setTmEndpoints(v || "")}
                  placeholder="app1.azurewebsites.net, app2.azurewebsites.net"
                  description="External endpoints will be created for each FQDN" />
                <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
                  <PrimaryButton text="Create Traffic Manager" iconProps={{ iconName: "Add" }}
                    disabled={!tmName} onClick={handleCreateTm}
                    styles={{ root: { borderRadius: 6 } }} />
                  <Text variant="small" styles={{ root: { color: "#a19f9d" } }}>Creates profile + endpoints + monitoring (~1 min)</Text>
                </Stack>
              </Stack>
            )}
          </>
        )}
      </div>
    </div>
  );
};
