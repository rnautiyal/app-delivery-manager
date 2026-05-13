import { useState, useEffect } from "react";
import { Stack, Text, Spinner, MessageBar, MessageBarType, SearchBox, CommandBar, ICommandBarItemProps, Panel, PanelType } from "@fluentui/react";
import { getAccessToken } from "../services/api";
import axios from "axios";

interface GcpLoadBalancer {
  id: string;
  name: string;
  type: string;
  scheme: string;
  region: string;
  ipAddress: string;
  port: string;
  protocol: string;
  healthStatus: string;
  backendCount: number;
  creationTimestamp: string;
  description: string;
}

export function GcpLbPage() {
  const [lbs, setLbs] = useState<GcpLoadBalancer[]>([]);
  const [filtered, setFiltered] = useState<GcpLoadBalancer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [configured, setConfigured] = useState(true);
  const [projectId, setProjectId] = useState("");
  const [selected, setSelected] = useState<GcpLoadBalancer | null>(null);

  useEffect(() => { checkStatus(); }, []);
  useEffect(() => {
    if (search) {
      setFiltered(lbs.filter(lb => lb.name.toLowerCase().includes(search.toLowerCase()) || lb.type.toLowerCase().includes(search.toLowerCase()) || lb.region.toLowerCase().includes(search.toLowerCase())));
    } else {
      setFiltered(lbs);
    }
  }, [lbs, search]);

  async function checkStatus() {
    try {
      const token = await getAccessToken();
      const { data } = await axios.get("/api/gcp/status", { headers: { Authorization: `Bearer ${token}` } });
      setConfigured(data.data.configured);
      setProjectId(data.data.projectId);
      if (data.data.configured) loadLbs();
    } catch { setConfigured(false); }
  }

  async function loadLbs() {
    setLoading(true); setError(null);
    try {
      const token = await getAccessToken();
      const { data } = await axios.get("/api/gcp/load-balancers", { headers: { Authorization: `Bearer ${token}` } });
      setLbs(data.data || []);
    } catch (e: any) { setError(e?.response?.data?.error || "Failed to load GCP load balancers"); }
    finally { setLoading(false); }
  }

  const commands: ICommandBarItemProps[] = [
    { key: "refresh", text: "Refresh", iconProps: { iconName: "Refresh" }, onClick: () => { loadLbs(); } },
  ];

  const schemeColors: Record<string, string> = {
    EXTERNAL: "#0078d4", EXTERNAL_MANAGED: "#0078d4",
    INTERNAL: "#5c2d91", INTERNAL_MANAGED: "#5c2d91",
  };

  if (!configured) {
    return (
      <div className="page-container">
        <div className="page-header">
          <Text variant="xxLarge" styles={{ root: { fontWeight: 600 } }}>GCP Cloud Load Balancers</Text>
        </div>
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <Text variant="xLarge" styles={{ root: { fontWeight: 600, display: "block", marginBottom: 16 } }}>GCP Not Configured</Text>
          <Text styles={{ root: { color: "#605e5c", marginBottom: 16, display: "block" } }}>
            To enable GCP Load Balancer visibility, set these environment variables on the container:
          </Text>
          <div style={{ background: "#1a1a2e", color: "#e0e0e0", padding: 20, borderRadius: 8, display: "inline-block", textAlign: "left", fontFamily: "monospace", fontSize: 13 }}>
            GCP_PROJECT_ID=your-project-id<br />
            GCP_CREDENTIALS_JSON={"{"}"...service account JSON..."{"}"}
          </div>
          <Text variant="small" styles={{ root: { color: "#605e5c", display: "block", marginTop: 12 } }}>
            The service account needs <code>roles/compute.viewer</code> permission.
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
          <Text variant="xxLarge" styles={{ root: { fontWeight: 600 } }}>GCP Cloud Load Balancers</Text>
          <span style={{ background: "#4285f4", color: "white", borderRadius: 4, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>{projectId}</span>
        </Stack>
      </div>
      <Stack tokens={{ childrenGap: 16 }}>
        <CommandBar items={commands} />
        <SearchBox placeholder="Search load balancers..." value={search} onChange={(_, v) => setSearch(v || "")} styles={{ root: { maxWidth: 400 } }} />
        {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError(null)}>{error}</MessageBar>}
        {loading ? <Spinner label="Loading GCP load balancers..." /> : filtered.length === 0 ? (
          <div className="empty-state"><h3>No load balancers found</h3><p>No Cloud Load Balancers in project {projectId}.</p></div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #edebe9", textAlign: "left" }}>
                  <th style={{ padding: "12px 16px" }}>Name</th>
                  <th style={{ padding: "12px 16px" }}>Type</th>
                  <th style={{ padding: "12px 16px" }}>Scheme</th>
                  <th style={{ padding: "12px 16px" }}>Region</th>
                  <th style={{ padding: "12px 16px" }}>IP Address</th>
                  <th style={{ padding: "12px 16px" }}>Port</th>
                  <th style={{ padding: "12px 16px" }}>Protocol</th>
                  <th style={{ padding: "12px 16px" }}>Backends</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(lb => (
                  <tr key={lb.id || lb.name} style={{ borderBottom: "1px solid #edebe9", cursor: "pointer" }} onClick={() => setSelected(lb)}>
                    <td style={{ padding: "10px 16px", color: "#0078d4", fontWeight: 500 }}>{lb.name}</td>
                    <td style={{ padding: "10px 16px", fontSize: 12 }}>{lb.type}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ background: schemeColors[lb.scheme] || "#605e5c", color: "white", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                        {lb.scheme.replace("_", " ")}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px" }}>{lb.region}</td>
                    <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 12 }}>{lb.ipAddress}</td>
                    <td style={{ padding: "10px 16px" }}>{lb.port}</td>
                    <td style={{ padding: "10px 16px" }}>{lb.protocol}</td>
                    <td style={{ padding: "10px 16px" }}>{lb.backendCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Stack>

      <Panel isOpen={!!selected} onDismiss={() => setSelected(null)} type={PanelType.medium} headerText={selected?.name || "Load Balancer"} isLightDismiss>
        {selected && (
          <Stack tokens={{ childrenGap: 12, padding: "16px 0" }}>
            <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Type</Text><br /><Text>{selected.type}</Text></div>
            <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Scheme</Text><br /><Text>{selected.scheme}</Text></div>
            <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Region</Text><br /><Text>{selected.region}</Text></div>
            <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>IP Address</Text><br /><Text style={{ fontFamily: "monospace" }}>{selected.ipAddress}</Text></div>
            <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Port Range</Text><br /><Text>{selected.port}</Text></div>
            <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Protocol</Text><br /><Text>{selected.protocol}</Text></div>
            <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Backends</Text><br /><Text>{selected.backendCount}</Text></div>
            <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Created</Text><br /><Text>{selected.creationTimestamp ? new Date(selected.creationTimestamp).toLocaleString() : "-"}</Text></div>
            {selected.description && <div><Text variant="small" styles={{ root: { color: "#605e5c" } }}>Description</Text><br /><Text>{selected.description}</Text></div>}
          </Stack>
        )}
      </Panel>
    </div>
  );
}
