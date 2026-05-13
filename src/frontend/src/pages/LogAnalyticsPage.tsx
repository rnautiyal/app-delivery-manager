import { useState, useEffect } from "react";
import {
  Stack, Text, Spinner, MessageBar, MessageBarType, PrimaryButton, DefaultButton,
  TextField, Dropdown, IDropdownOption, Pivot, PivotItem, CommandBar, ICommandBarItemProps
} from "@fluentui/react";
import { runLogAnalyticsQuery, getLogAnalyticsQueryTemplates, getLogAnalyticsWorkspaces } from "../services/api";
import { useSubscriptions } from "../hooks/useSubscriptions";

interface QueryTemplate {
  id: string;
  name: string;
  category: string;
  query: string;
}

export function LogAnalyticsPage() {
  const { selectedSubscription } = useSubscriptions();
  const [workspaceId, setWorkspaceId] = useState(localStorage.getItem("la_workspace_id") || "");
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [hoursBack, setHoursBack] = useState(24);
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<QueryTemplate[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (selectedSubscription) loadWorkspaces();
  }, [selectedSubscription]);

  async function loadWorkspaces() {
    setWorkspacesLoading(true);
    try {
      const ws = await getLogAnalyticsWorkspaces(selectedSubscription);
      setWorkspaces(ws);
      // Auto-select first workspace if none selected
      if (!workspaceId && ws.length > 0) {
        setWorkspaceId(ws[0].id);
        localStorage.setItem("la_workspace_id", ws[0].id);
      }
    } catch {
      // Fallback to manual entry
    } finally {
      setWorkspacesLoading(false);
    }
  }

  async function loadTemplates() {
    try {
      const data = await getLogAnalyticsQueryTemplates();
      setTemplates(data);
    } catch {
      // Templates are optional
    }
  }

  async function runQuery() {
    if (!workspaceId || !query) {
      setError("Workspace ID and query are required");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      localStorage.setItem("la_workspace_id", workspaceId);
      const data = await runLogAnalyticsQuery(workspaceId, query, hoursBack);
      setResults(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Query failed");
    } finally {
      setLoading(false);
    }
  }

  function loadTemplate(t: QueryTemplate) {
    setQuery(t.query);
  }

  const categories = ["All", ...Array.from(new Set(templates.map(t => t.category)))];
  const filteredTemplates = selectedCategory === "All" ? templates : templates.filter(t => t.category === selectedCategory);

  const hourOptions: IDropdownOption[] = [
    { key: 1, text: "Last 1 hour" },
    { key: 6, text: "Last 6 hours" },
    { key: 12, text: "Last 12 hours" },
    { key: 24, text: "Last 24 hours" },
    { key: 48, text: "Last 48 hours" },
    { key: 168, text: "Last 7 days" },
  ];

  const commands: ICommandBarItemProps[] = [
    { key: "run", text: "Run Query", iconProps: { iconName: "Play" }, onClick: () => { runQuery(); }, disabled: !workspaceId || !query || loading },
    { key: "clear", text: "Clear", iconProps: { iconName: "Delete" }, onClick: () => { setQuery(""); setResults(null); } },
  ];

  const categoryColors: Record<string, string> = {
    "Application Gateway": "#0078d4",
    "Front Door": "#008272",
    "Traffic Manager": "#5c2d91",
    "Virtual Machines": "#d83b01",
    "Cross-Resource": "#8764b8",
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <Text variant="xxLarge" styles={{ root: { fontWeight: 600 } }}>Log Analytics</Text>
        <Text variant="medium" styles={{ root: { color: "#605e5c", marginTop: 4, display: "block" } }}>
          Query logs across Application Gateway, Traffic Manager, Front Door, and VMs
        </Text>
      </div>

      <Stack tokens={{ childrenGap: 16 }}>
        {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError(null)}>{error}</MessageBar>}

        {/* Workspace config */}
        <div className="card">
          <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="end">
            <Dropdown
              label="Log Analytics Workspace"
              selectedKey={workspaceId}
              options={[
                ...workspaces.map(ws => ({ key: ws.id, text: `${ws.name} (${ws.resourceGroup})` })),
                ...(workspaceId && !workspaces.find(ws => ws.id === workspaceId) ? [{ key: workspaceId, text: workspaceId }] : []),
              ]}
              onChange={(_, opt) => { const id = opt?.key as string; setWorkspaceId(id); localStorage.setItem("la_workspace_id", id); }}
              placeholder={workspacesLoading ? "Loading workspaces..." : "Select a workspace"}
              styles={{ root: { flex: 1 } }}
            />
            <Dropdown
              label="Time Range"
              selectedKey={hoursBack}
              options={hourOptions}
              onChange={(_, opt) => setHoursBack(opt?.key as number)}
              styles={{ root: { width: 180 } }}
            />
          </Stack>
        </div>

        <Pivot>
          <PivotItem headerText="Query Editor" itemIcon="Code">
            <Stack tokens={{ childrenGap: 12 }} styles={{ root: { marginTop: 12 } }}>
              <CommandBar items={commands} />
              <TextField
                multiline
                rows={8}
                value={query}
                onChange={(_, v) => setQuery(v || "")}
                placeholder="Enter your KQL query here..."
                styles={{
                  root: { fontFamily: "'Cascadia Code', 'Consolas', monospace" },
                  field: { fontFamily: "'Cascadia Code', 'Consolas', monospace", fontSize: 13, lineHeight: "1.5" },
                }}
              />
              {loading && <Spinner label="Running query..." />}
              {results && <QueryResults data={results} />}
            </Stack>
          </PivotItem>

          <PivotItem headerText="Query Templates" itemIcon="Library">
            <Stack tokens={{ childrenGap: 12 }} styles={{ root: { marginTop: 12 } }}>
              <Stack horizontal tokens={{ childrenGap: 8 }} wrap>
                {categories.map(cat => (
                  <DefaultButton
                    key={cat}
                    text={cat}
                    onClick={() => setSelectedCategory(cat)}
                    styles={{
                      root: {
                        background: selectedCategory === cat ? "#0078d4" : undefined,
                        color: selectedCategory === cat ? "white" : undefined,
                        borderColor: selectedCategory === cat ? "#0078d4" : undefined,
                        minWidth: 0,
                      },
                    }}
                  />
                ))}
              </Stack>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
                {filteredTemplates.map(t => (
                  <div key={t.id} className="card" style={{ cursor: "pointer", padding: 16 }} onClick={() => loadTemplate(t)}>
                    <Stack tokens={{ childrenGap: 8 }}>
                      <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                        <span style={{
                          background: categoryColors[t.category] || "#605e5c",
                          color: "white", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 600,
                        }}>
                          {t.category}
                        </span>
                        <Text styles={{ root: { fontWeight: 600 } }}>{t.name}</Text>
                      </Stack>
                      <pre style={{
                        background: "#f5f5f5", padding: 8, borderRadius: 4, fontSize: 11,
                        fontFamily: "'Cascadia Code', 'Consolas', monospace",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "pre-wrap",
                        maxHeight: 100, color: "#323130",
                      }}>
                        {t.query}
                      </pre>
                      <PrimaryButton text="Use this query" styles={{ root: { alignSelf: "flex-start", height: 28, fontSize: 12 } }} />
                    </Stack>
                  </div>
                ))}
              </div>
            </Stack>
          </PivotItem>
        </Pivot>
      </Stack>
    </div>
  );
}

function QueryResults({ data }: { data: any }) {
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <Text styles={{ root: { color: "#605e5c" } }}>No results returned</Text>
      </div>
    );
  }

  // Handle table results
  if (Array.isArray(data) && data[0]?.columns) {
    return (
      <div>
        {data.map((table: any, i: number) => (
          <div key={i} className="card" style={{ padding: 0, overflow: "auto" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #edebe9", background: "#faf9f8" }}>
              <Text styles={{ root: { fontWeight: 600 } }}>
                {table.name || "Results"} — {table.totalRows || table.rows?.length || 0} rows
              </Text>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #edebe9", textAlign: "left" }}>
                  {table.columns.map((col: string, j: number) => (
                    <th key={j} style={{ padding: "8px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(table.rows || []).map((row: any[], ri: number) => (
                  <tr key={ri} style={{ borderBottom: "1px solid #f3f2f1" }}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ padding: "6px 12px", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cell?.toString() || "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  }

  // Fallback: JSON
  return (
    <div className="card">
      <pre style={{ fontSize: 12, fontFamily: "'Cascadia Code', 'Consolas', monospace", overflow: "auto", maxHeight: 400 }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
