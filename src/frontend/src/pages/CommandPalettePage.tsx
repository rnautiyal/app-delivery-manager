import React, { useState } from "react";
import { Stack, Text, Dropdown, IDropdownOption, PrimaryButton, TextField, Spinner, MessageBar, MessageBarType } from "@fluentui/react";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { SubscriptionPicker } from "../components/SubscriptionPicker";
import { AppGatewayIcon, FrontDoorIcon, TrafficManagerIcon, WafIcon } from "../components/AzureIcons";
import {
  getGateways, startGateway, stopGateway, getWafPolicies, getTrafficManagerProfiles,
  getAfdProfiles, getAfdEndpoints, purgeAfdEndpoint, enableTrafficManagerProfile,
  disableTrafficManagerProfile,
} from "../services/api";

interface OperationResult {
  status: "success" | "error";
  message: string;
  data?: any;
}

const OPERATIONS: { category: string; icon: React.ReactNode; ops: { key: string; text: string; fields?: string[] }[] }[] = [
  {
    category: "Application Gateway",
    icon: <AppGatewayIcon size={18} />,
    ops: [
      { key: "list-gateways", text: "List all Application Gateways" },
      { key: "start-gateway", text: "Start a Gateway", fields: ["resourceGroup", "gatewayName"] },
      { key: "stop-gateway", text: "Stop a Gateway", fields: ["resourceGroup", "gatewayName"] },
      { key: "check-health", text: "Check backend health status" },
      { key: "find-no-waf", text: "Find gateways without WAF" },
      { key: "find-stopped", text: "Find stopped gateways" },
    ],
  },
  {
    category: "Azure Front Door",
    icon: <FrontDoorIcon size={18} />,
    ops: [
      { key: "list-afd", text: "List all Front Door profiles" },
      { key: "list-afd-endpoints", text: "List AFD endpoints", fields: ["resourceGroup", "profileName"] },
      { key: "purge-afd", text: "Purge AFD cache", fields: ["resourceGroup", "profileName", "endpointName"] },
    ],
  },
  {
    category: "Traffic Manager",
    icon: <TrafficManagerIcon size={18} />,
    ops: [
      { key: "list-tm", text: "List all Traffic Manager profiles" },
      { key: "enable-tm", text: "Enable TM profile", fields: ["resourceGroup", "profileName"] },
      { key: "disable-tm", text: "Disable TM profile", fields: ["resourceGroup", "profileName"] },
    ],
  },
  {
    category: "WAF",
    icon: <WafIcon size={18} />,
    ops: [
      { key: "list-waf", text: "List all WAF policies" },
      { key: "find-detection-mode", text: "Find WAF in detection mode" },
    ],
  },
];

const ALL_OPS: IDropdownOption[] = OPERATIONS.flatMap(cat =>
  cat.ops.map(op => ({ key: op.key, text: `${cat.category} → ${op.text}` }))
);

export function CommandPalettePage() {
  const { subscriptions, selectedSubscription, setSelectedSubscription, loading: subsLoading } = useSubscriptions();
  const [selectedOp, setSelectedOp] = useState<string>("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<OperationResult | null>(null);
  const [resultData, setResultData] = useState<any[]>([]);

  const currentOp = OPERATIONS.flatMap(c => c.ops).find(o => o.key === selectedOp);

  async function execute() {
    if (!selectedSubscription || !selectedOp) return;
    setRunning(true); setResult(null); setResultData([]);
    try {
      let data: any;
      switch (selectedOp) {
        case "list-gateways":
          data = await getGateways(selectedSubscription);
          setResultData(data);
          setResult({ status: "success", message: `Found ${data.length} gateways` });
          break;
        case "start-gateway":
          await startGateway(selectedSubscription, fields.resourceGroup, fields.gatewayName);
          setResult({ status: "success", message: `Started ${fields.gatewayName}. Takes 2-5 minutes.` });
          break;
        case "stop-gateway":
          await stopGateway(selectedSubscription, fields.resourceGroup, fields.gatewayName);
          setResult({ status: "success", message: `Stopped ${fields.gatewayName}.` });
          break;
        case "check-health":
          data = await getGateways(selectedSubscription);
          const running = data.filter((g: any) => g.operationalState === "Running").length;
          const stopped = data.filter((g: any) => g.operationalState === "Stopped").length;
          setResultData(data);
          setResult({ status: "success", message: `${data.length} gateways: ${running} running, ${stopped} stopped` });
          break;
        case "find-no-waf":
          data = await getGateways(selectedSubscription);
          const noWaf = data.filter((g: any) => !g.wafEnabled);
          setResultData(noWaf);
          setResult({ status: noWaf.length > 0 ? "error" : "success", message: `${noWaf.length} gateways without WAF` });
          break;
        case "find-stopped":
          data = await getGateways(selectedSubscription);
          const stoppedGws = data.filter((g: any) => g.operationalState === "Stopped");
          setResultData(stoppedGws);
          setResult({ status: stoppedGws.length > 0 ? "error" : "success", message: `${stoppedGws.length} stopped gateways` });
          break;
        case "list-afd":
          data = await getAfdProfiles(selectedSubscription);
          setResultData(data);
          setResult({ status: "success", message: `Found ${data.length} Front Door profiles` });
          break;
        case "list-afd-endpoints":
          data = await getAfdEndpoints(selectedSubscription, fields.resourceGroup, fields.profileName);
          setResultData(data);
          setResult({ status: "success", message: `Found ${data.length} endpoints` });
          break;
        case "purge-afd":
          await purgeAfdEndpoint(selectedSubscription, fields.resourceGroup, fields.profileName, fields.endpointName);
          setResult({ status: "success", message: `Cache purged for ${fields.endpointName}` });
          break;
        case "list-tm":
          data = await getTrafficManagerProfiles(selectedSubscription);
          setResultData(data);
          setResult({ status: "success", message: `Found ${data.length} Traffic Manager profiles` });
          break;
        case "enable-tm":
          await enableTrafficManagerProfile(selectedSubscription, fields.resourceGroup, fields.profileName);
          setResult({ status: "success", message: `Enabled ${fields.profileName}` });
          break;
        case "disable-tm":
          await disableTrafficManagerProfile(selectedSubscription, fields.resourceGroup, fields.profileName);
          setResult({ status: "success", message: `Disabled ${fields.profileName}` });
          break;
        case "list-waf":
          data = await getWafPolicies(selectedSubscription);
          setResultData(data);
          setResult({ status: "success", message: `Found ${data.length} WAF policies` });
          break;
        case "find-detection-mode":
          data = await getWafPolicies(selectedSubscription);
          const detection = data.filter((w: any) => w.policyMode === "Detection");
          setResultData(detection);
          setResult({ status: detection.length > 0 ? "error" : "success", message: `${detection.length} WAF policies in detection mode` });
          break;
        default:
          setResult({ status: "error", message: "Unknown operation" });
      }
    } catch (e: any) {
      setResult({ status: "error", message: e?.response?.data?.error || e?.message || "Operation failed" });
    } finally { setRunning(false); }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <Text variant="xxLarge" styles={{ root: { fontWeight: 600 } }}>Command Palette</Text>
        <Text variant="medium" styles={{ root: { color: "#605e5c", marginTop: 4, display: "block" } }}>
          Execute operations directly — no AI required
        </Text>
      </div>

      <Stack tokens={{ childrenGap: 16 }}>
        <SubscriptionPicker subscriptions={subscriptions} selectedSubscription={selectedSubscription} onChange={setSelectedSubscription} loading={subsLoading} />

        <div className="card" style={{ padding: 20 }}>
          <Stack tokens={{ childrenGap: 16 }}>
            <Dropdown
              label="Select Operation"
              placeholder="Choose an operation..."
              options={ALL_OPS}
              selectedKey={selectedOp}
              onChange={(_, opt) => { setSelectedOp(opt?.key as string || ""); setFields({}); setResult(null); setResultData([]); }}
              styles={{ root: { maxWidth: 500 }, dropdown: { borderRadius: 6 } }}
            />

            {currentOp?.fields && (
              <Stack horizontal wrap tokens={{ childrenGap: 12 }} verticalAlign="end">
                {currentOp.fields.map(f => (
                  <TextField key={f} label={f.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}
                    value={fields[f] || ""} onChange={(_, v) => setFields(prev => ({ ...prev, [f]: v || "" }))}
                    required styles={{ root: { minWidth: 200 } }} />
                ))}
              </Stack>
            )}

            <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
              <PrimaryButton text="Execute" iconProps={{ iconName: "Play" }}
                disabled={!selectedOp || !selectedSubscription || running || (currentOp?.fields && currentOp.fields.some(f => !fields[f]))}
                onClick={execute} styles={{ root: { borderRadius: 6 } }} />
              {running && <Spinner size={1} />}
            </Stack>
          </Stack>
        </div>

        {result && (
          <MessageBar messageBarType={result.status === "success" ? MessageBarType.success : MessageBarType.error}
            onDismiss={() => setResult(null)} styles={{ root: { borderRadius: 6 } }}>
            {result.message}
          </MessageBar>
        )}

        {resultData.length > 0 && (
          <div className="card" style={{ padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #edebe9", textAlign: "left" }}>
                  {Object.keys(resultData[0]).filter(k => !["id", "subscriptionId", "tags"].includes(k)).slice(0, 7).map(k => (
                    <th key={k} style={{ padding: "10px 12px", fontWeight: 600 }}>{k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resultData.slice(0, 50).map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #edebe9" }}>
                    {Object.entries(row).filter(([k]) => !["id", "subscriptionId", "tags"].includes(k)).slice(0, 7).map(([k, v], j) => (
                      <td key={j} style={{ padding: "8px 12px" }}>
                        {typeof v === "boolean" ? (v ? "Yes" : "No") : typeof v === "object" ? JSON.stringify(v).slice(0, 50) : String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Quick Operations Grid */}
        <Text variant="large" styles={{ root: { fontWeight: 700, marginTop: 16 } }}>Quick Operations</Text>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {OPERATIONS.map(cat => (
            <div key={cat.category} className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", background: "#faf9f8", borderBottom: "1px solid #edebe9", display: "flex", alignItems: "center", gap: 8 }}>
                {cat.icon}
                <Text styles={{ root: { fontWeight: 700, fontSize: 14 } }}>{cat.category}</Text>
              </div>
              <div style={{ padding: 8 }}>
                {cat.ops.map(op => (
                  <div key={op.key} onClick={() => { setSelectedOp(op.key); setFields({}); setResult(null); setResultData([]); }}
                    style={{ padding: "8px 10px", cursor: "pointer", borderRadius: 6, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#e8f4fd")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <span style={{ color: "#0078d4" }}>▸</span> {op.text}
                    {!op.fields && <span style={{ marginLeft: "auto", fontSize: 10, color: "#a19f9d" }}>instant</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Stack>
    </div>
  );
}
