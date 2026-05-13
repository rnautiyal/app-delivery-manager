import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Stack,
  Text,
  Spinner,
  MessageBar,
  MessageBarType,
  SearchBox,
  CommandBar,
  ICommandBarItemProps,
  Dialog,
  DialogType,
  DialogFooter,
  PrimaryButton,
  DefaultButton,
  TextField,
  Dropdown,
  IDropdownOption,
} from "@fluentui/react";
import { SubscriptionPicker } from "../components/SubscriptionPicker";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { getGateways, startGateway, stopGateway, deleteGateway, checkDdosProtection } from "../services/api";
import { GatewayListItem } from "../types";

const GROUP_BY_OPTIONS: IDropdownOption[] = [
  { key: "none", text: "No Grouping" },
  { key: "resourceGroup", text: "Resource Group" },
  { key: "tag:group", text: "Tag: group" },
  { key: "tag:environment", text: "Tag: environment" },
  { key: "tag:department", text: "Tag: department" },
  { key: "tag:team", text: "Tag: team" },
  { key: "location", text: "Location" },
  { key: "operationalState", text: "Status" },
];

const GROUP_COLORS: Record<string, string> = {
  Finance: "#0078d4",
  Marketing: "#00b294",
  Prod: "#d13438",
  Production: "#d13438",
  Dev: "#8764b8",
  Development: "#8764b8",
  Staging: "#ffaa44",
  QA: "#498205",
  Test: "#498205",
};

function getGroupColor(group: string): string {
  return GROUP_COLORS[group] || "#605e5c";
}

export function GatewayListPage() {
  const navigate = useNavigate();
  const { subscriptions, selectedSubscription, setSelectedSubscription, loading: subsLoading } = useSubscriptions();
  const [gateways, setGateways] = useState<GatewayListItem[]>([]);
  const [filteredGateways, setFilteredGateways] = useState<GatewayListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [selectedGateway, setSelectedGateway] = useState<GatewayListItem | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [groupBy, setGroupBy] = useState<string>("none");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [ddosStatus, setDdosStatus] = useState<Record<string, boolean | null>>({});

  // Security score: 0-100 based on WAF, TLS capability, SKU tier, probe config
  function getSecurityScore(gw: GatewayListItem): { score: number; grade: string; color: string; details: string[] } {
    let score = 0;
    const details: string[] = [];

    // WAF enabled (30 pts)
    if (gw.wafEnabled) { score += 30; details.push("WAF: Enabled"); }
    else details.push("WAF: Disabled (-30)");

    // SKU v2 (15 pts) — v2 supports better security features
    if (gw.tier?.includes("v2") || gw.sku?.includes("v2")) { score += 15; details.push("SKU v2: Yes"); }
    else details.push("SKU v2: No (-15)");

    // Has HTTPS listeners (20 pts) — indicates TLS termination
    if (gw.listenerCount > 0) { score += 10; details.push("Listeners configured"); }
    if (gw.ruleCount > 0) { score += 10; details.push("Routing rules configured"); }

    // DDoS protection (15 pts)
    if (ddosStatus[gw.id] === true) { score += 15; details.push("DDoS Standard: Enabled"); }
    else if (ddosStatus[gw.id] === false) details.push("DDoS Standard: Disabled (-15)");
    else details.push("DDoS: Checking...");

    // Has health probes (10 pts) — implies backend monitoring
    if (gw.backendPoolCount > 0) { score += 10; details.push("Backend pools: Configured"); }
    else details.push("Backend pools: None (-10)");

    const grade = score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : score >= 20 ? "D" : "F";
    const color = score >= 80 ? "#107c10" : score >= 60 ? "#0078d4" : score >= 40 ? "#ca5010" : "#d13438";
    return { score, grade, color, details };
  }

  // Load DDoS status for gateways (sequential to avoid 429 rate limiting)
  useEffect(() => {
    let cancelled = false;
    async function loadDdos() {
      for (const gw of gateways) {
        if (cancelled) break;
        if (ddosStatus[gw.id] !== undefined || !selectedSubscription) continue;
        try {
          const result = await checkDdosProtection(selectedSubscription, gw.resourceGroup, gw.name);
          if (!cancelled) setDdosStatus((prev) => ({ ...prev, [gw.id]: result?.enabled ?? false }));
        } catch {
          if (!cancelled) setDdosStatus((prev) => ({ ...prev, [gw.id]: null }));
        }
      }
    }
    loadDdos();
    return () => { cancelled = true; };
  }, [gateways, selectedSubscription]);

  useEffect(() => {
    if (!selectedSubscription) return;
    loadGateways();
  }, [selectedSubscription]);

  useEffect(() => {
    if (searchText) {
      setFilteredGateways(
        gateways.filter(
          (g) =>
            g.name.toLowerCase().includes(searchText.toLowerCase()) ||
            g.resourceGroup.toLowerCase().includes(searchText.toLowerCase()) ||
            g.location.toLowerCase().includes(searchText.toLowerCase())
        )
      );
    } else {
      setFilteredGateways(gateways);
    }
  }, [gateways, searchText]);

  async function loadGateways() {
    try {
      setLoading(true);
      setError(null);
      const gws = await getGateways(selectedSubscription);
      setGateways(gws);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load gateways");
    } finally {
      setLoading(false);
    }
  }

  async function handleStart(gw: GatewayListItem) {
    try {
      setActionLoading(true);
      await startGateway(gw.subscriptionId, gw.resourceGroup, gw.name);
      await loadGateways();
      // Auto-refresh every 15s to pick up state changes
      const interval = setInterval(async () => { await loadGateways(); }, 15000);
      setTimeout(() => clearInterval(interval), 300000); // stop after 5 min
    } catch (err) {
      setError(`Failed to start ${gw.name}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStop(gw: GatewayListItem) {
    try {
      setActionLoading(true);
      await stopGateway(gw.subscriptionId, gw.resourceGroup, gw.name);
      await loadGateways();
      const interval = setInterval(async () => { await loadGateways(); }, 15000);
      setTimeout(() => clearInterval(interval), 300000);
    } catch (err) {
      setError(`Failed to stop ${gw.name}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (!selectedGateway) return;
    try {
      setActionLoading(true);
      await deleteGateway(selectedGateway.subscriptionId, selectedGateway.resourceGroup, selectedGateway.name);
      setShowDeleteDialog(false);
      setSelectedGateway(null);
      await loadGateways();
    } catch (err) {
      setError(`Failed to delete ${selectedGateway.name}`);
    } finally {
      setActionLoading(false);
    }
  }

  const commandItems: ICommandBarItemProps[] = [
    {
      key: "refresh",
      text: "Refresh",
      iconProps: { iconName: "Refresh" },
      onClick: () => { loadGateways(); },
    },
  ];

  function getGroupKey(gw: GatewayListItem): string {
    if (groupBy === "none") return "";
    if (groupBy === "resourceGroup") return gw.resourceGroup;
    if (groupBy === "location") return gw.location;
    if (groupBy === "operationalState") return gw.operationalState || "Unknown";
    if (groupBy.startsWith("tag:")) {
      const tagKey = groupBy.replace("tag:", "");
      return gw.tags?.[tagKey] || "Untagged";
    }
    return "";
  }

  function getGroupedGateways(): Map<string, GatewayListItem[]> {
    const groups = new Map<string, GatewayListItem[]>();
    for (const gw of filteredGateways) {
      const key = getGroupKey(gw);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(gw);
    }
    return groups;
  }

  function toggleGroup(group: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function renderGatewayRows(items: GatewayListItem[]) {
    return items.map((gw) => {
      const sec = getSecurityScore(gw);
      const isDdosOn = ddosStatus[gw.id] === true;
      const isDdosOff = ddosStatus[gw.id] === false;
      return (
      <tr key={gw.id} style={{ borderBottom: "1px solid #edebe9" }}>
        <td
          style={{ padding: "10px 16px", color: "#0078d4", fontWeight: 500, cursor: "pointer" }}
          onClick={() => navigate(`/gateways/${gw.subscriptionId}/${gw.resourceGroup}/${gw.name}`)}
        >
          {gw.name}
        </td>
        <td style={{ padding: "10px 16px" }}>{gw.resourceGroup}</td>
        <td style={{ padding: "10px 16px" }}>{gw.location}</td>
        <td style={{ padding: "10px 16px" }}>{gw.sku} / {gw.tier}</td>
        <td style={{ padding: "10px 16px" }}>
          <span className={`status-badge status-${gw.operationalState?.toLowerCase()}`}>
            {gw.operationalState}
          </span>
        </td>
        <td style={{ padding: "10px 16px" }}>
          <span className={`status-badge ${gw.wafEnabled ? "status-running" : "status-warning"}`}>
            {gw.wafEnabled ? "On" : "Off"}
          </span>
        </td>
        <td style={{ padding: "10px 16px" }}>
          <span className={`status-badge ${isDdosOn ? "status-pass" : isDdosOff ? "status-warning" : ""}`}>
            {isDdosOn ? "Standard" : isDdosOff ? "Basic" : "..."}
          </span>
        </td>
        <td style={{ padding: "10px 16px" }}>
          <span title={sec.details.join("\n")} style={{
            display: "inline-flex", alignItems: "center", gap: 6, cursor: "help",
          }}>
            <span style={{
              width: 28, height: 28, borderRadius: "50%", display: "inline-flex",
              alignItems: "center", justifyContent: "center",
              background: sec.color, color: "white", fontWeight: 800, fontSize: 12,
            }}>{sec.grade}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: sec.color }}>{sec.score}/100</span>
          </span>
        </td>
        <td style={{ padding: "10px 16px" }}>
          <Stack horizontal tokens={{ childrenGap: 4 }}>
            {(gw.operationalState === "Stopped" || gw.provisioningState === "Updating") && gw.operationalState !== "Running" && (
              <PrimaryButton text={gw.provisioningState === "Updating" ? "Starting..." : "Start"} onClick={() => handleStart(gw)} disabled={actionLoading || gw.provisioningState === "Updating"} styles={{ root: { minWidth: 0, padding: "0 8px", height: 28 } }} />
            )}
            {gw.operationalState === "Running" && (
              <DefaultButton text="Stop" onClick={() => handleStop(gw)} disabled={actionLoading} styles={{ root: { minWidth: 0, padding: "0 8px", height: 28 } }} />
            )}
            <DefaultButton
              text="Details"
              onClick={() => navigate(`/gateways/${gw.subscriptionId}/${gw.resourceGroup}/${gw.name}`)}
              styles={{ root: { minWidth: 0, padding: "0 8px", height: 28 } }}
            />
            <DefaultButton
              text="Delete"
              onClick={() => { setSelectedGateway(gw); setShowDeleteDialog(true); }}
              styles={{ root: { minWidth: 0, padding: "0 8px", height: 28, color: "#d13438" } }}
            />
          </Stack>
        </td>
      </tr>
      );
    });
  }

  function renderTableHeader() {
    return (
      <thead>
        <tr style={{ borderBottom: "2px solid #edebe9", textAlign: "left" }}>
          <th style={{ padding: "12px 16px" }}>Name</th>
          <th style={{ padding: "12px 16px" }}>Resource Group</th>
          <th style={{ padding: "12px 16px" }}>Location</th>
          <th style={{ padding: "12px 16px" }}>SKU / Tier</th>
          <th style={{ padding: "12px 16px" }}>Status</th>
          <th style={{ padding: "12px 16px" }}>WAF</th>
          <th style={{ padding: "12px 16px" }}>DDoS</th>
          <th style={{ padding: "12px 16px" }}>Security Score</th>
          <th style={{ padding: "12px 16px" }}>Actions</th>
        </tr>
      </thead>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <Text variant="xxLarge" styles={{ root: { fontWeight: 600 } }}>
          Application Gateways
        </Text>
      </div>

      <Stack tokens={{ childrenGap: 16 }}>
        <SubscriptionPicker
          subscriptions={subscriptions}
          selectedSubscription={selectedSubscription}
          onChange={setSelectedSubscription}
          loading={subsLoading}
        />

        <CommandBar items={commandItems} />

        <Stack horizontal tokens={{ childrenGap: 16 }} verticalAlign="end">
          <SearchBox
            placeholder="Search gateways..."
            value={searchText}
            onChange={(_, value) => setSearchText(value || "")}
            styles={{ root: { maxWidth: 400 } }}
          />
          <Dropdown
            label="Group by"
            selectedKey={groupBy}
            options={GROUP_BY_OPTIONS}
            onChange={(_, opt) => { setGroupBy(opt?.key as string || "none"); setCollapsedGroups(new Set()); }}
            styles={{ root: { minWidth: 180 }, label: { fontWeight: 400, fontSize: 12 } }}
          />
        </Stack>

        {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}

        {loading ? (
          <Spinner label="Loading gateways..." />
        ) : filteredGateways.length === 0 ? (
          <div className="empty-state">
            <h3>No gateways found</h3>
            <p>No Application Gateways match your criteria.</p>
          </div>
        ) : groupBy === "none" ? (
          <div className="card" style={{ padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              {renderTableHeader()}
              <tbody>
                {renderGatewayRows(filteredGateways)}
              </tbody>
            </table>
          </div>
        ) : (
          <Stack tokens={{ childrenGap: 12 }}>
            {Array.from(getGroupedGateways().entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([group, items]) => {
                const isCollapsed = collapsedGroups.has(group);
                const color = getGroupColor(group);
                return (
                  <div key={group} className="card" style={{ padding: 0, overflow: "hidden" }}>
                    <div
                      onClick={() => toggleGroup(group)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 16px",
                        cursor: "pointer",
                        background: "#faf9f8",
                        borderBottom: isCollapsed ? "none" : "2px solid #edebe9",
                        userSelect: "none",
                      }}
                    >
                      <span style={{ fontSize: 12, color: "#605e5c", transition: "transform 0.2s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>
                        ▼
                      </span>
                      <span
                        style={{
                          display: "inline-block",
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: color,
                          flexShrink: 0,
                        }}
                      />
                      <Text variant="mediumPlus" styles={{ root: { fontWeight: 600 } }}>
                        {group}
                      </Text>
                      <span style={{
                        background: color,
                        color: "white",
                        borderRadius: 10,
                        padding: "2px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                      }}>
                        {items.length}
                      </span>
                    </div>
                    {!isCollapsed && (
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        {renderTableHeader()}
                        <tbody>
                          {renderGatewayRows(items)}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
          </Stack>
        )}
      </Stack>

      {/* Delete confirmation dialog */}
      <Dialog
        hidden={!showDeleteDialog}
        onDismiss={() => setShowDeleteDialog(false)}
        dialogContentProps={{
          type: DialogType.normal,
          title: "Delete Application Gateway",
          subText: `Are you sure you want to delete "${selectedGateway?.name}"? This action cannot be undone.`,
        }}
      >
        <DialogFooter>
          <PrimaryButton text="Delete" onClick={handleDelete} disabled={actionLoading} styles={{ root: { background: "#d13438" } }} />
          <DefaultButton text="Cancel" onClick={() => setShowDeleteDialog(false)} />
        </DialogFooter>
      </Dialog>
    </div>
  );
}
