import { useState, useEffect } from "react";
import {
  Stack, Text, Spinner, MessageBar, MessageBarType, Dropdown,
  Pivot, PivotItem, SearchBox, TextField, PrimaryButton, IconButton
} from "@fluentui/react";
import { getTrafficAnalytics, getLogAnalyticsWorkspaces, getGateways } from "../services/api";
import { sendChatMessage } from "../services/chatApi";
import { useSubscriptions } from "../hooks/useSubscriptions";

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatLatency(ms: number): string {
  if (!ms && ms !== 0) return "—";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function statusColor(code: number): string {
  if (code < 300) return "#107c10";
  if (code < 400) return "#0078d4";
  if (code < 500) return "#ffaa00";
  return "#d13438";
}

function statusBg(code: number): string {
  if (code < 300) return "#dff6dd";
  if (code < 400) return "#deecf9";
  if (code < 500) return "#fff4ce";
  return "#fde7e9";
}

function methodColor(method: string): string {
  switch (method?.toUpperCase()) {
    case "GET": return "#107c10";
    case "POST": return "#0078d4";
    case "PUT": return "#8764b8";
    case "DELETE": return "#d13438";
    case "PATCH": return "#ca5010";
    case "OPTIONS": return "#605e5c";
    case "HEAD": return "#005b70";
    default: return "#605e5c";
  }
}

function latencyColor(ms: number): string {
  if (ms < 500) return "#107c10";
  if (ms < 2000) return "#0078d4";
  if (ms < 5000) return "#ffaa00";
  return "#d13438";
}

function tableFromResult(result: any): { columns: string[]; rows: any[][] } {
  if (!result || !Array.isArray(result) || result.length === 0) return { columns: [], rows: [] };
  return { columns: result[0].columns || [], rows: result[0].rows || [] };
}

const cellStyle: React.CSSProperties = { padding: "6px 8px", whiteSpace: "nowrap" };
const headerStyle: React.CSSProperties = { padding: "8px", whiteSpace: "nowrap", background: "#f3f2f1", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "#323130" };

export function TrafficAnalyticsPage() {
  const { selectedSubscription } = useSubscriptions();
  const [workspaceId, setWorkspaceId] = useState(localStorage.getItem("la_workspace_id") || "");
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [gateways, setGateways] = useState<any[]>([]);
  const [selectedGateway, setSelectedGateway] = useState("");
  const [hours, setHours] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [searchFilter, setSearchFilter] = useState("");

  // AppDelivery Genie mini-chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatConvId, setChatConvId] = useState<string | undefined>();

  const suggestedQuestions = [
    "Which client IPs are sending the most requests?",
    "Show me all 502 errors in the last hour",
    "What is the average backend latency per server?",
    "Are there any WAF blocked requests?",
    "Which URLs have the highest error rate?",
    "Show slow requests taking more than 5 seconds",
  ];

  async function handleChatSend(question?: string) {
    const msg = question || chatInput.trim();
    if (!msg) return;
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: msg }]);
    setChatLoading(true);
    try {
      const contextPrefix = selectedGateway
        ? `[Context: User is viewing Traffic Analytics for gateway "${selectedGateway}" in workspace ${workspaceId}, last ${hours}h] `
        : `[Context: User is viewing Traffic Analytics for all gateways in workspace ${workspaceId}, last ${hours}h] `;
      const result = await sendChatMessage(contextPrefix + msg, chatConvId);
      setChatConvId(result.conversationId);
      setChatMessages(prev => [...prev, { role: "assistant", content: result.response }]);
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Sorry, I couldn't process that. Make sure the backend is running and the AI service is configured." }]);
    } finally {
      setChatLoading(false);
    }
  }

  useEffect(() => {
    if (selectedSubscription) {
      getLogAnalyticsWorkspaces(selectedSubscription).then(setWorkspaces).catch(() => {});
      getGateways(selectedSubscription).then(setGateways).catch(() => {});
    }
  }, [selectedSubscription]);

  async function loadAnalytics() {
    if (!workspaceId) { setError("Select a Log Analytics workspace first"); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await getTrafficAnalytics(workspaceId, hours, selectedGateway || undefined);
      setData(result);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Failed to load traffic analytics");
    } finally {
      setLoading(false);
    }
  }

  const accessLogs = data ? tableFromResult(data.accessLogs) : { columns: [], rows: [] };
  const topClients = data ? tableFromResult(data.topClients) : { columns: [], rows: [] };
  const backendLatency = data ? tableFromResult(data.backendLatency) : { columns: [], rows: [] };
  const statusBreakdown = data ? tableFromResult(data.statusBreakdown) : { columns: [], rows: [] };
  const trafficTimeline = data ? tableFromResult(data.trafficTimeline) : { columns: [], rows: [] };
  const afdLogs = data ? tableFromResult(data.afdLogs) : { columns: [], rows: [] };
  const tmProbeHealth = data ? tableFromResult(data.tmProbeHealth) : { columns: [], rows: [] };

  const filteredLogs = searchFilter
    ? accessLogs.rows.filter(row => row.some((cell: any) => String(cell).toLowerCase().includes(searchFilter.toLowerCase())))
    : accessLogs.rows;

  const totalRequests = accessLogs.rows.length;
  const errorRequests = accessLogs.rows.filter(r => parseInt(r[7]) >= 400).length;
  const avgLatency = totalRequests > 0 ? accessLogs.rows.reduce((sum, r) => sum + (parseFloat(r[13]) || 0), 0) / totalRequests : 0;
  const uniqueClients = new Set(accessLogs.rows.map(r => r[2])).size;

  return (
    <div className="page-container">
      <div style={{ background: "linear-gradient(135deg, #0078d4 0%, #005b70 100%)", borderRadius: 16, padding: "24px 32px", marginBottom: 20 }}>
        <Text variant="xxLarge" styles={{ root: { fontWeight: 700, color: "white" } }}>🛰️ Traffic Analytics</Text>
        <Text variant="medium" styles={{ root: { color: "rgba(255,255,255,0.85)", marginLeft: 12 } }}>
          Real-time AppGW traffic — client IPs, backends, latency, headers, SSL
        </Text>
      </div>

      <Stack tokens={{ childrenGap: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="end" wrap>
            <Dropdown label="Workspace" selectedKey={workspaceId}
              options={workspaces.map(w => ({ key: w.id, text: `${w.name} (${w.location})` }))}
              onChange={(_, opt) => { setWorkspaceId(opt?.key as string); localStorage.setItem("la_workspace_id", opt?.key as string); }}
              placeholder="Select workspace" styles={{ root: { minWidth: 280 } }} />
            <Dropdown label="Gateway" selectedKey={selectedGateway}
              options={[{ key: "", text: "All Gateways" }, ...gateways.map(g => ({ key: g.name, text: g.name }))]}
              onChange={(_, opt) => setSelectedGateway(opt?.key as string)} styles={{ root: { minWidth: 200 } }} />
            <Dropdown label="Time Range" selectedKey={String(hours)}
              options={[{ key: "1", text: "Last 1 hour" }, { key: "3", text: "Last 3 hours" }, { key: "6", text: "Last 6 hours" }, { key: "12", text: "Last 12 hours" }, { key: "24", text: "Last 24 hours" }]}
              onChange={(_, opt) => setHours(parseInt(opt?.key as string))} styles={{ root: { minWidth: 150 } }} />
            <button onClick={loadAnalytics} disabled={loading || !workspaceId}
              style={{ background: "linear-gradient(135deg, #0078d4, #005b70)", color: "white", border: "none", borderRadius: 8, padding: "8px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer", height: 34, boxShadow: "0 2px 8px rgba(0,120,212,0.3)" }}>
              {loading ? "Loading..." : "⚡ Load Analytics"}
            </button>
          </Stack>
        </div>

        {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError(null)}>{error}</MessageBar>}
        {loading && <Spinner label="Running 5 analytics queries across your AppGW logs..." />}

        {data && !loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <div style={{ background: "linear-gradient(135deg, #0078d4, #50e6ff)", borderRadius: 12, padding: 20, color: "white" }}>
              <div style={{ fontSize: 11, opacity: 0.8, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Total Requests</div>
              <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>{totalRequests.toLocaleString()}</div>
            </div>
            <div style={{ background: errorRequests > 0 ? "linear-gradient(135deg, #d13438, #ff6b6b)" : "linear-gradient(135deg, #107c10, #5dc75d)", borderRadius: 12, padding: 20, color: "white" }}>
              <div style={{ fontSize: 11, opacity: 0.8, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Errors (4xx/5xx)</div>
              <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>{errorRequests}</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{totalRequests > 0 ? ((errorRequests / totalRequests) * 100).toFixed(1) : 0}% error rate</div>
            </div>
            <div style={{ background: "linear-gradient(135deg, #8764b8, #b794f6)", borderRadius: 12, padding: 20, color: "white" }}>
              <div style={{ fontSize: 11, opacity: 0.8, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Avg Latency</div>
              <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>{formatLatency(avgLatency)}</div>
            </div>
            <div style={{ background: "linear-gradient(135deg, #ca5010, #ff8c00)", borderRadius: 12, padding: 20, color: "white" }}>
              <div style={{ fontSize: 11, opacity: 0.8, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Unique Clients</div>
              <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>{uniqueClients}</div>
            </div>
            <div style={{ background: "linear-gradient(135deg, #005b70, #00b7c3)", borderRadius: 12, padding: 20, color: "white" }}>
              <div style={{ fontSize: 11, opacity: 0.8, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Backends</div>
              <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>{backendLatency.rows.length}</div>
            </div>
          </div>
        )}

        {data && !loading && (
          <Pivot styles={{ root: { marginTop: 8 } }}>
            <PivotItem headerText={`📋 Access Logs (${filteredLogs.length})`}>
              <Stack tokens={{ childrenGap: 12 }} style={{ marginTop: 12 }}>
                <SearchBox placeholder="🔍 Filter by IP, URL, status, backend, user agent..." value={searchFilter} onChange={(_, v) => setSearchFilter(v || "")} styles={{ root: { maxWidth: 500 } }} />
                <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #edebe9" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'Cascadia Code', 'Consolas', monospace" }}>
                    <thead>
                      <tr>
                        {["Time", "Gateway", "Client IP", "Port", "Method", "URL", "Query", "Status", "Backend Status", "HTTP", "Host", "Orig Host", "Backend", "Latency", "Backend Lat", "Recv", "Sent", "User Agent", "Orig URI", "SSL", "Cipher", "TLS", "Client Cert", "Listener", "Rule", "Pool", "Backend Setting", "Transaction ID"].map(h => (
                          <th key={h} style={headerStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.slice(0, 200).map((row, i) => {
                        const [time, gw, clientIp, clientPort, method, uri, query, status, serverStatus, httpVer, host, origHost, backend, latency, backendLat, recv, sent, ua, origUri, sslEnabled, sslCipher, sslProto, sslClientVerify, listener, rule, pool, backendSetting, txId] = row;
                        const statusCode = parseInt(status);
                        const lat = parseFloat(latency);
                        return (
                          <tr key={i} style={{ borderBottom: "1px solid #f3f2f1", background: i % 2 === 0 ? "white" : "#faf9f8" }}>
                            <td style={{ ...cellStyle, color: "#605e5c", fontSize: 10 }}>{time ? new Date(time).toLocaleTimeString() : "—"}</td>
                            <td style={{ ...cellStyle, fontWeight: 600, color: "#0078d4" }}>{gw || "—"}</td>
                            <td style={{ ...cellStyle, color: "#005b70", fontWeight: 600 }}>{clientIp || "—"}</td>
                            <td style={cellStyle}><span style={{ background: methodColor(method), color: "white", borderRadius: 4, padding: "2px 8px", fontWeight: 700, fontSize: 10 }}>{method || "—"}</span></td>
                            <td style={{ ...cellStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }} title={uri}>{uri || "—"}</td>
                            <td style={{ ...cellStyle, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", color: "#a19f9d", fontSize: 10 }} title={query}>{query || "—"}</td>
                            <td style={cellStyle}><span style={{ background: statusBg(statusCode), color: statusColor(statusCode), borderRadius: 6, padding: "2px 10px", fontWeight: 800, fontSize: 11, border: `1px solid ${statusColor(statusCode)}22` }}>{status || "—"}</span></td>
                            <td style={{ ...cellStyle, color: "#605e5c" }}>{serverStatus || "—"}</td>
                            <td style={{ ...cellStyle, fontSize: 10, color: "#605e5c" }}>{httpVer || "—"}</td>
                            <td style={{ ...cellStyle, color: "#0078d4", fontSize: 10 }}>{host || "—"}</td>
                            <td style={{ ...cellStyle, color: "#a19f9d", fontSize: 10 }}>{origHost || "—"}</td>
                            <td style={{ ...cellStyle, color: "#8764b8", fontWeight: 600 }}>{backend || "—"}</td>
                            <td style={cellStyle}><span style={{ background: `${latencyColor(lat)}18`, color: latencyColor(lat), borderRadius: 4, padding: "2px 8px", fontWeight: 700, fontSize: 11 }}>{formatLatency(lat)}</span></td>
                            <td style={{ ...cellStyle, color: "#605e5c" }}>{formatLatency(parseFloat(backendLat))}</td>
                            <td style={{ ...cellStyle, fontSize: 10, color: "#605e5c" }}>{formatBytes(parseFloat(recv))}</td>
                            <td style={{ ...cellStyle, fontSize: 10, color: "#605e5c" }}>{formatBytes(parseFloat(sent))}</td>
                            <td style={{ ...cellStyle, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", color: "#a19f9d", fontSize: 9 }} title={ua}>{ua || "—"}</td>
                            <td style={{ ...cellStyle, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", fontSize: 10 }} title={origUri}>{origUri || "—"}</td>
                            <td style={cellStyle}>{sslEnabled === "on" ? <span style={{ background: "#107c10", color: "white", borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>🔒 SSL</span> : <span style={{ background: "#ffaa00", color: "#323130", borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 600 }}>HTTP</span>}</td>
                            <td style={{ ...cellStyle, fontSize: 9, color: "#605e5c" }}>{sslCipher || "—"}</td>
                            <td style={cellStyle}>{sslProto ? <span style={{ background: sslProto.includes("1.3") ? "#107c10" : sslProto.includes("1.2") ? "#0078d4" : "#d13438", color: "white", borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 600 }}>{sslProto}</span> : "—"}</td>
                            <td style={{ ...cellStyle, fontSize: 9, color: "#605e5c" }}>{sslClientVerify || "—"}</td>
                            <td style={{ ...cellStyle, color: "#ca5010", fontSize: 10 }}>{listener || "—"}</td>
                            <td style={{ ...cellStyle, color: "#005b70", fontSize: 10 }}>{rule || "—"}</td>
                            <td style={{ ...cellStyle, color: "#8764b8", fontSize: 10 }}>{pool || "—"}</td>
                            <td style={{ ...cellStyle, fontSize: 10, color: "#605e5c" }}>{backendSetting || "—"}</td>
                            <td style={{ ...cellStyle, fontSize: 8, color: "#a19f9d", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis" }} title={txId}>{txId || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredLogs.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#a19f9d" }}>No access logs found for this time range</div>}
                </div>
              </Stack>
            </PivotItem>

            <PivotItem headerText={`👥 Top Clients (${topClients.rows.length})`}>
              <div style={{ overflowX: "auto", marginTop: 12, borderRadius: 10, border: "1px solid #edebe9" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr>{["#", "Client IP", "Requests", "Avg Latency", "Errors", "Bytes Sent", "Bytes Received", "Error Rate", "Traffic"].map(h => <th key={h} style={headerStyle}>{h}</th>)}</tr></thead>
                  <tbody>
                    {topClients.rows.map((row, i) => {
                      const [ip, resourceType, requests, avgLat, errors, sent, recv] = row;
                      const errRate = requests > 0 ? ((errors / requests) * 100).toFixed(1) : "0";
                      const maxReq = Math.max(...topClients.rows.map((r: any) => Number(r[1]) || 1));
                      const barWidth = Math.max(8, (Number(requests) / maxReq) * 200);
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid #f3f2f1", background: i % 2 === 0 ? "white" : "#faf9f8" }}>
                          <td style={{ padding: "8px 12px", fontWeight: 700, color: "#a19f9d" }}>{i + 1}</td>
                          <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#005b70", fontWeight: 700, fontSize: 14 }}>{ip}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 800, fontSize: 16, color: "#0078d4" }}>{Number(requests).toLocaleString()}</td>
                          <td style={{ padding: "8px 12px" }}><span style={{ background: `${latencyColor(parseFloat(avgLat))}18`, color: latencyColor(parseFloat(avgLat)), borderRadius: 4, padding: "2px 8px", fontWeight: 600 }}>{formatLatency(parseFloat(avgLat))}</span></td>
                          <td style={{ padding: "8px 12px", color: errors > 0 ? "#d13438" : "#107c10", fontWeight: 700, fontSize: 15 }}>{errors}</td>
                          <td style={{ padding: "8px 12px", color: "#605e5c" }}>{formatBytes(parseFloat(sent))}</td>
                          <td style={{ padding: "8px 12px", color: "#605e5c" }}>{formatBytes(parseFloat(recv))}</td>
                          <td style={{ padding: "8px 12px" }}><span style={{ background: parseFloat(errRate) > 10 ? "#fde7e9" : parseFloat(errRate) > 0 ? "#fff4ce" : "#dff6dd", color: parseFloat(errRate) > 10 ? "#d13438" : parseFloat(errRate) > 0 ? "#ca5010" : "#107c10", borderRadius: 6, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>{errRate}%</span></td>
                          <td style={{ padding: "8px 12px" }}><div style={{ height: 16, width: barWidth, borderRadius: 4, background: `linear-gradient(90deg, #0078d4, ${errors > 0 ? "#d13438" : "#50e6ff"})` }} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {topClients.rows.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#a19f9d" }}>No client data found</div>}
              </div>
            </PivotItem>

            <PivotItem headerText={`🖥️ Backends (${backendLatency.rows.length})`}>
              <div style={{ overflowX: "auto", marginTop: 12, borderRadius: 10, border: "1px solid #edebe9" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr>{["Backend Server", "Gateway", "Requests", "Avg Latency", "P95 Latency", "Max Latency", "Backend Response", "Errors", "Health"].map(h => <th key={h} style={headerStyle}>{h}</th>)}</tr></thead>
                  <tbody>
                    {backendLatency.rows.map((row, i) => {
                      const [backend, gw, requests, avgLat, p95, maxLat, backendLat, errors] = row;
                      const errRate = requests > 0 ? (errors / requests) * 100 : 0;
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid #f3f2f1", background: i % 2 === 0 ? "white" : "#faf9f8" }}>
                          <td style={{ padding: "10px 12px" }}><span style={{ fontFamily: "monospace", color: "#8764b8", fontWeight: 700, fontSize: 14 }}>{backend}</span></td>
                          <td style={{ padding: "10px 12px", color: "#0078d4" }}>{gw}</td>
                          <td style={{ padding: "10px 12px", fontWeight: 800, fontSize: 16 }}>{Number(requests).toLocaleString()}</td>
                          <td style={{ padding: "10px 12px" }}><span style={{ background: `${latencyColor(parseFloat(avgLat))}18`, color: latencyColor(parseFloat(avgLat)), borderRadius: 4, padding: "3px 10px", fontWeight: 700 }}>{formatLatency(parseFloat(avgLat))}</span></td>
                          <td style={{ padding: "10px 12px", fontWeight: 700, color: latencyColor(parseFloat(p95)) }}>{formatLatency(parseFloat(p95))}</td>
                          <td style={{ padding: "10px 12px", color: "#605e5c" }}>{formatLatency(parseFloat(maxLat))}</td>
                          <td style={{ padding: "10px 12px" }}>{formatLatency(parseFloat(backendLat))}</td>
                          <td style={{ padding: "10px 12px", color: errors > 0 ? "#d13438" : "#107c10", fontWeight: 700 }}>{errors}</td>
                          <td style={{ padding: "10px 12px" }}><div style={{ width: 60, height: 8, borderRadius: 4, background: "#edebe9" }}><div style={{ width: `${Math.max(5, 100 - errRate)}%`, height: "100%", borderRadius: 4, background: errRate > 10 ? "#d13438" : errRate > 0 ? "#ffaa00" : "#107c10" }} /></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {backendLatency.rows.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#a19f9d" }}>No backend data found</div>}
              </div>
            </PivotItem>

            <PivotItem headerText={`📊 Status Codes (${statusBreakdown.rows.length})`}>
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 14 }}>
                {statusBreakdown.rows.map((row, i) => {
                  const [code, resourceType, gw, count] = row;
                  const codeNum = parseInt(code);
                  return (
                    <div key={i} style={{ background: "white", borderRadius: 14, padding: 20, border: `2px solid ${statusColor(codeNum)}33`, boxShadow: `0 4px 12px ${statusColor(codeNum)}15`, textAlign: "center" }}>
                      <div style={{ fontSize: 34, fontWeight: 900, color: statusColor(codeNum), textShadow: `0 2px 8px ${statusColor(codeNum)}33` }}>{code}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: "#323130" }}>{Number(count).toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: "#605e5c", marginTop: 4 }}>{gw}</div>
                      <div style={{ marginTop: 4, fontSize: 9, color: "#a19f9d" }}>{resourceType}</div>
                      <div style={{ marginTop: 8, fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: statusColor(codeNum), letterSpacing: 0.5 }}>
                        {codeNum < 300 ? "Success" : codeNum < 400 ? "Redirect" : codeNum < 500 ? "Client Error" : "Server Error"}
                      </div>
                    </div>
                  );
                })}
                {statusBreakdown.rows.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#a19f9d", gridColumn: "1/-1" }}>No status data found</div>}
              </div>
            </PivotItem>

            <PivotItem headerText="📈 Traffic Timeline">
              <div style={{ overflowX: "auto", marginTop: 12, borderRadius: 10, border: "1px solid #edebe9" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr>{["Time", "Gateway", "Requests", "Avg Latency", "Errors", "Traffic Volume"].map(h => <th key={h} style={headerStyle}>{h}</th>)}</tr></thead>
                  <tbody>
                    {trafficTimeline.rows.map((row, i) => {
                      const [time, resourceType, gw, requests, avgLat, errors] = row;
                      const maxReq = Math.max(...trafficTimeline.rows.map((r: any) => Number(r[2]) || 1));
                      const barWidth = Math.max(6, (Number(requests) / maxReq) * 100);
                      const errPct = Number(requests) > 0 ? (Number(errors) / Number(requests)) * 100 : 0;
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid #f3f2f1", background: i % 2 === 0 ? "white" : "#faf9f8" }}>
                          <td style={{ padding: "8px 12px", whiteSpace: "nowrap", fontSize: 12, color: "#605e5c" }}>{time ? new Date(time).toLocaleTimeString() : "—"}</td>
                          <td style={{ padding: "8px 12px", color: "#0078d4", fontWeight: 500 }}>{gw}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 800, fontSize: 15 }}>{Number(requests).toLocaleString()}</td>
                          <td style={{ padding: "8px 12px" }}><span style={{ color: latencyColor(parseFloat(avgLat)), fontWeight: 600 }}>{formatLatency(parseFloat(avgLat))}</span></td>
                          <td style={{ padding: "8px 12px", color: errors > 0 ? "#d13438" : "#107c10", fontWeight: 600 }}>{errors}</td>
                          <td style={{ padding: "8px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <div style={{ height: 18, borderRadius: 4, background: "#edebe9", flex: 1, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${barWidth}%`, borderRadius: 4, background: errPct > 10 ? "linear-gradient(90deg, #0078d4, #d13438)" : "linear-gradient(90deg, #0078d4, #50e6ff)" }} />
                              </div>
                              <span style={{ fontSize: 10, color: "#a19f9d", minWidth: 30 }}>{Math.round(barWidth)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {trafficTimeline.rows.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#a19f9d" }}>No timeline data found</div>}
              </div>
            </PivotItem>

            {/* ── Front Door Logs Tab ── */}
            <PivotItem headerText={`🚪 Front Door (${afdLogs.rows.length})`}>
              <div style={{ overflowX: "auto", marginTop: 12, borderRadius: 10, border: "1px solid #edebe9" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'Cascadia Code', 'Consolas', monospace" }}>
                  <thead><tr>{["Time", "Profile", "Client IP", "Method", "URL", "Status", "Routing Rule", "Backend Host", "Latency", "Req Bytes", "Resp Bytes", "User Agent", "Host", "Security", "Cache", "POP", "HTTP", "Socket IP"].map(h => <th key={h} style={headerStyle}>{h}</th>)}</tr></thead>
                  <tbody>
                    {afdLogs.rows.slice(0, 200).map((row, i) => {
                      const [time, resource, clientIp, method, uri, status, routingRule, backendHost, latency, reqBytes, respBytes, ua, host, security, cache, pop, httpVer, socketIp] = row;
                      const statusCode = parseInt(status);
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid #f3f2f1", background: i % 2 === 0 ? "white" : "#faf9f8" }}>
                          <td style={{ ...cellStyle, color: "#605e5c", fontSize: 10 }}>{time ? new Date(time).toLocaleTimeString() : "—"}</td>
                          <td style={{ ...cellStyle, fontWeight: 600, color: "#0078d4" }}>{resource || "—"}</td>
                          <td style={{ ...cellStyle, color: "#005b70", fontWeight: 600 }}>{clientIp || "—"}</td>
                          <td style={{ ...cellStyle, color: "#a19f9d", fontSize: 10 }}>{"—"}</td>
                          <td style={cellStyle}><span style={{ background: methodColor(method), color: "white", borderRadius: 4, padding: "2px 8px", fontWeight: 700, fontSize: 10 }}>{method || "—"}</span></td>
                          <td style={{ ...cellStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }} title={uri}>{uri || "—"}</td>
                          <td style={cellStyle}><span style={{ background: statusBg(statusCode), color: statusColor(statusCode), borderRadius: 6, padding: "2px 10px", fontWeight: 800, fontSize: 11 }}>{status || "—"}</span></td>
                          <td style={{ ...cellStyle, color: "#ca5010", fontWeight: 500 }}>{routingRule || "—"}</td>
                          <td style={{ ...cellStyle, color: "#8764b8", fontWeight: 600 }}>{backendHost || "—"}</td>
                          <td style={cellStyle}><span style={{ background: `${latencyColor(parseFloat(latency))}18`, color: latencyColor(parseFloat(latency)), borderRadius: 4, padding: "2px 8px", fontWeight: 700, fontSize: 11 }}>{formatLatency(parseFloat(latency))}</span></td>
                          <td style={{ ...cellStyle, fontSize: 10 }}>{formatBytes(parseFloat(reqBytes))}</td>
                          <td style={{ ...cellStyle, fontSize: 10 }}>{formatBytes(parseFloat(respBytes))}</td>
                          <td style={{ ...cellStyle, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", color: "#a19f9d", fontSize: 9 }} title={ua}>{ua || "—"}</td>
                          <td style={{ ...cellStyle, color: "#0078d4", fontSize: 10 }}>{host || "—"}</td>

                          <td style={cellStyle}>{security ? <span style={{ background: "#107c10", color: "white", borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 600 }}>🔒 {security}</span> : "—"}</td>
                          <td style={cellStyle}><span style={{ background: cache === "HIT" ? "#dff6dd" : cache === "MISS" ? "#fff4ce" : "#f3f2f1", color: cache === "HIT" ? "#107c10" : cache === "MISS" ? "#ca5010" : "#605e5c", borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 600 }}>{cache || "—"}</span></td>
                          <td style={{ ...cellStyle, fontWeight: 600, color: "#5c2d91", fontSize: 10 }}>{pop || "—"}</td>
                          <td style={{ ...cellStyle, fontSize: 10 }}>{httpVer || "—"}</td>
                          <td style={{ ...cellStyle, color: "#605e5c", fontSize: 10 }}>{socketIp || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {afdLogs.rows.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#a19f9d" }}>No Front Door logs found</div>}
              </div>
            </PivotItem>

            {/* ── Traffic Manager Probe Health Tab ── */}
            <PivotItem headerText={`🌍 Traffic Manager (${tmProbeHealth.rows.length})`}>
              <div style={{ overflowX: "auto", marginTop: 12, borderRadius: 10, border: "1px solid #edebe9" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr>{["Time", "Profile", "Endpoint", "Status", "Message"].map(h => <th key={h} style={headerStyle}>{h}</th>)}</tr></thead>
                  <tbody>
                    {tmProbeHealth.rows.map((row, i) => {
                      const [time, resource, endpoint, status, message] = row;
                      const isHealthy = status === "Online" || status === "Enabled";
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid #f3f2f1", background: i % 2 === 0 ? "white" : "#faf9f8" }}>
                          <td style={{ padding: "8px 12px", fontSize: 12, color: "#605e5c" }}>{time ? new Date(time).toLocaleTimeString() : "—"}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600, color: "#0078d4" }}>{resource || "—"}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600, color: "#5c2d91" }}>{endpoint || "—"}</td>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{
                              background: isHealthy ? "#dff6dd" : "#fde7e9",
                              color: isHealthy ? "#107c10" : "#d13438",
                              borderRadius: 6, padding: "3px 12px", fontWeight: 700, fontSize: 12,
                              border: `1px solid ${isHealthy ? "#107c1022" : "#d1343822"}`
                            }}>{status || "—"}</span>
                          </td>
                          <td style={{ padding: "8px 12px", fontSize: 11, color: "#605e5c", maxWidth: 400 }} title={message}>{message || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {tmProbeHealth.rows.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#a19f9d" }}>No Traffic Manager probe health data found</div>}
              </div>
            </PivotItem>
          </Pivot>
        )}

        {!data && !loading && (
          <div className="card" style={{ textAlign: "center", padding: 60, background: "linear-gradient(135deg, #faf9f8, #f3f2f1)" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🛰️</div>
            <Text variant="xLarge" styles={{ root: { fontWeight: 700, display: "block", marginBottom: 8 } }}>Traffic Analytics Dashboard</Text>
            <Text styles={{ root: { color: "#605e5c", display: "block", marginBottom: 20, maxWidth: 500, margin: "0 auto 20px" } }}>
              Deep-dive into your Application Gateway traffic. See every request with client IPs, backend servers, latency breakdown, HTTP headers, SSL details, routing rules, and more.
            </Text>
            <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
              {[
                { label: "Client IPs", color: "#005b70", icon: "👥" },
                { label: "Backend Servers", color: "#8764b8", icon: "🖥️" },
                { label: "Latency P95", color: "#ca5010", icon: "⏱️" },
                { label: "HTTP Headers", color: "#0078d4", icon: "📋" },
                { label: "SSL/TLS", color: "#107c10", icon: "🔒" },
                { label: "Status Codes", color: "#d13438", icon: "📊" },
                { label: "Routing Rules", color: "#005b70", icon: "🔀" },
              ].map(item => (
                <div key={item.label} style={{ background: `${item.color}10`, borderRadius: 10, padding: "10px 16px", fontSize: 12, fontWeight: 600, color: item.color, border: `1px solid ${item.color}22` }}>
                  {item.icon} {item.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </Stack>

      {/* AppDelivery Genie Floating Chat */}
      {!chatOpen && (
        <div
          onClick={() => setChatOpen(true)}
          style={{
            position: "fixed", bottom: 24, right: 24, width: 60, height: 60,
            borderRadius: "50%", background: "linear-gradient(135deg, #0078d4, #005b70)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", boxShadow: "0 4px 20px rgba(0,120,212,0.4)",
            fontSize: 28, color: "white", zIndex: 1000,
            transition: "transform 0.2s",
          }}
          title="Ask AppDelivery Genie about traffic"
        >
          🧞
        </div>
      )}

      {chatOpen && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, width: 420, height: 520,
          background: "white", borderRadius: 16, boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
          display: "flex", flexDirection: "column", zIndex: 1000, overflow: "hidden",
          border: "1px solid #e1dfdd",
        }}>
          {/* Header */}
          <div style={{
            background: "linear-gradient(135deg, #0078d4, #005b70)",
            padding: "14px 16px", display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 22 }}>🧞</span>
            <div style={{ flex: 1 }}>
              <Text styles={{ root: { color: "white", fontWeight: 700, fontSize: 15 } }}>AppDelivery Genie</Text>
              <Text styles={{ root: { color: "rgba(255,255,255,0.7)", fontSize: 11 } }}>Ask about traffic patterns</Text>
            </div>
            <IconButton
              iconProps={{ iconName: "Cancel" }}
              onClick={() => setChatOpen(false)}
              styles={{ root: { color: "white" }, rootHovered: { color: "white", background: "rgba(255,255,255,0.15)" } }}
            />
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
            {chatMessages.length === 0 && (
              <div style={{ padding: 8 }}>
                <Text styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block", color: "#323130" } }}>
                  Quick questions:
                </Text>
                {suggestedQuestions.map((q, i) => (
                  <div
                    key={i}
                    onClick={() => handleChatSend(q)}
                    style={{
                      padding: "8px 12px", marginBottom: 6, borderRadius: 8,
                      background: "#f3f2f1", cursor: "pointer", fontSize: 12,
                      border: "1px solid #edebe9", transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#e8f4fd")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#f3f2f1")}
                  >
                    {q}
                  </div>
                ))}
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                marginBottom: 8,
              }}>
                <div style={{
                  maxWidth: "85%", padding: "10px 14px", borderRadius: 12,
                  background: msg.role === "user" ? "#0078d4" : "#f3f2f1",
                  color: msg.role === "user" ? "white" : "#323130",
                  fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap",
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0" }}>
                <Spinner size={1} />
                <Text variant="small" styles={{ root: { color: "#605e5c" } }}>Analyzing traffic...</Text>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ borderTop: "1px solid #edebe9", padding: "10px 12px", display: "flex", gap: 8 }}>
            <TextField
              value={chatInput}
              onChange={(_, v) => setChatInput(v || "")}
              placeholder="Ask about traffic patterns..."
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
              styles={{ root: { flex: 1 }, field: { fontSize: 13 } }}
              borderless
              underlined
            />
            <PrimaryButton
              text="Send"
              onClick={() => handleChatSend()}
              disabled={chatLoading || !chatInput.trim()}
              styles={{ root: { borderRadius: 8, minWidth: 60 } }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
