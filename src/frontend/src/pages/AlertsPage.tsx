import React, { useState, useEffect } from "react";
import {
  Stack,
  Text,
  Spinner,
  MessageBar,
  MessageBarType,
  PrimaryButton,
  DefaultButton,
  DetailsList,
  DetailsListLayoutMode,
  IColumn,
  SelectionMode,
  Dialog,
  DialogFooter,
  DialogType,
  TextField,
  Dropdown,
  IDropdownOption,
  Pivot,
  PivotItem,
  Toggle,
  Panel,
  PanelType,
  Checkbox,
} from "@fluentui/react";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { SubscriptionPicker } from "../components/SubscriptionPicker";
import {
  getAlertRules,
  createAlertRule,
  deleteAlertRule,
  toggleAlertRule,
  evaluateAlerts,
  getAlertHistory,
  acknowledgeAlert,
  clearAlertHistory,
  getGateways,
} from "../services/api";
import { AlertRule, AlertHistoryEntry, AlertConditionType, AlertSeverity, GatewayListItem } from "../types";

const conditionOptions: IDropdownOption[] = [
  { key: "drift_detected", text: "Configuration Drift Detected" },
  { key: "cert_expiring", text: "SSL Certificate Expiring" },
  { key: "unhealthy_backends", text: "Unhealthy Backend Hosts" },
  { key: "gateway_stopped", text: "Gateway Stopped" },
  { key: "waf_detection_mode", text: "WAF in Detection Mode" },
];

const severityOptions: IDropdownOption[] = [
  { key: "critical", text: "Critical" },
  { key: "high", text: "High" },
  { key: "medium", text: "Medium" },
  { key: "low", text: "Low" },
];

const conditionLabels: Record<string, string> = {
  drift_detected: "Config Drift",
  cert_expiring: "Cert Expiry",
  unhealthy_backends: "Unhealthy Backends",
  gateway_stopped: "Gateway Stopped",
  waf_detection_mode: "WAF Detection",
};

export const AlertsPage: React.FC = () => {
  const { subscriptions, selectedSubscription, setSelectedSubscription, loading: subLoading } = useSubscriptions();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [history, setHistory] = useState<AlertHistoryEntry[]>([]);
  const [gateways, setGateways] = useState<GatewayListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create rule panel
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [ruleName, setRuleName] = useState("");
  const [ruleDescription, setRuleDescription] = useState("");
  const [ruleCondition, setRuleCondition] = useState<AlertConditionType>("drift_detected");
  const [ruleSeverity, setRuleSeverity] = useState<AlertSeverity>("medium");
  const [ruleGatewayFilter, setRuleGatewayFilter] = useState("");
  const [ruleCertDays, setRuleCertDays] = useState("30");
  const [ruleEmailEnabled, setRuleEmailEnabled] = useState(false);
  const [ruleEmailTo, setRuleEmailTo] = useState("");
  const [creating, setCreating] = useState(false);

  // Evaluate
  const [evaluating, setEvaluating] = useState(false);
  const [newAlerts, setNewAlerts] = useState<AlertHistoryEntry[]>([]);

  // Clear dialog
  const [showClearDialog, setShowClearDialog] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [r, h, g] = await Promise.all([
        getAlertRules(selectedSubscription || undefined),
        getAlertHistory(selectedSubscription || undefined, 100),
        selectedSubscription ? getGateways(selectedSubscription) : Promise.resolve([]),
      ]);
      setRules(r);
      setHistory(h);
      setGateways(g);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedSubscription]);

  const handleCreateRule = async () => {
    if (!ruleName || !selectedSubscription) return;
    setCreating(true);
    setError("");
    try {
      const conditionParams: Record<string, any> = {};
      if (ruleCondition === "cert_expiring") {
        conditionParams.days = parseInt(ruleCertDays, 10) || 30;
      }
      await createAlertRule({
        name: ruleName,
        description: ruleDescription,
        conditionType: ruleCondition,
        severity: ruleSeverity,
        subscriptionId: selectedSubscription,
        gatewayFilter: ruleGatewayFilter || undefined,
        conditionParams,
        emailEnabled: ruleEmailEnabled,
        emailTo: ruleEmailTo || undefined,
      });
      setSuccess(`Alert rule "${ruleName}" created`);
      setShowCreatePanel(false);
      setRuleName("");
      setRuleDescription("");
      setRuleGatewayFilter("");
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rule");
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await toggleAlertRule(id, enabled);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle rule");
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await deleteAlertRule(id);
      setSuccess("Rule deleted");
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete rule");
    }
  };

  const handleEvaluate = async () => {
    if (!selectedSubscription) return;
    setEvaluating(true);
    setError("");
    setNewAlerts([]);
    try {
      const alerts = await evaluateAlerts(selectedSubscription);
      setNewAlerts(alerts);
      if (alerts.length === 0) {
        setSuccess("All clear! No alerts triggered.");
      } else {
        setSuccess(`${alerts.length} alert(s) triggered`);
      }
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to evaluate alerts");
    } finally {
      setEvaluating(false);
    }
  };

  const handleAcknowledge = async (id: string) => {
    try {
      await acknowledgeAlert(id);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to acknowledge");
    }
  };

  const handleClearHistory = async () => {
    try {
      await clearAlertHistory(selectedSubscription || undefined);
      setSuccess("Alert history cleared");
      setShowClearDialog(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear history");
    }
  };

  const activeRules = rules.filter((r) => r.enabled).length;
  const last24h = history.filter(
    (h) => new Date(h.triggeredAt).getTime() > Date.now() - 24 * 60 * 60 * 1000
  ).length;
  const criticalCount = history.filter((h) => h.severity === "critical" && !h.acknowledged).length;
  const unacknowledged = history.filter((h) => !h.acknowledged).length;

  const ruleColumns: IColumn[] = [
    {
      key: "name",
      name: "Rule Name",
      minWidth: 160,
      maxWidth: 220,
      onRender: (item: AlertRule) => <Text styles={{ root: { fontWeight: 600 } }}>{item.name}</Text>,
    },
    {
      key: "condition",
      name: "Condition",
      minWidth: 140,
      maxWidth: 180,
      onRender: (item: AlertRule) => (
        <span className="condition-badge">{conditionLabels[item.conditionType] || item.conditionType}</span>
      ),
    },
    {
      key: "severity",
      name: "Severity",
      minWidth: 80,
      maxWidth: 100,
      onRender: (item: AlertRule) => (
        <span className={`severity-badge severity-${item.severity}`}>{item.severity}</span>
      ),
    },
    {
      key: "gateway",
      name: "Gateway Filter",
      minWidth: 120,
      maxWidth: 160,
      onRender: (item: AlertRule) => <Text variant="small">{item.gatewayFilter || "All gateways"}</Text>,
    },
    {
      key: "enabled",
      name: "Enabled",
      minWidth: 70,
      maxWidth: 90,
      onRender: (item: AlertRule) => (
        <Toggle
          checked={item.enabled}
          onChange={(_, checked) => handleToggle(item.id, checked || false)}
          styles={{ root: { margin: 0 } }}
        />
      ),
    },
    {
      key: "actions",
      name: "Actions",
      minWidth: 80,
      onRender: (item: AlertRule) => (
        <DefaultButton
          text="Delete"
          styles={{ root: { borderRadius: 6, minWidth: 0, padding: "0 12px", color: "#d13438", borderColor: "#d13438" } }}
          onClick={() => handleDeleteRule(item.id)}
        />
      ),
    },
  ];

  const historyColumns: IColumn[] = [
    {
      key: "severity",
      name: "Severity",
      minWidth: 80,
      maxWidth: 100,
      onRender: (item: AlertHistoryEntry) => (
        <span className={`severity-badge severity-${item.severity}`}>{item.severity}</span>
      ),
    },
    {
      key: "rule",
      name: "Rule",
      minWidth: 140,
      maxWidth: 180,
      onRender: (item: AlertHistoryEntry) => <Text styles={{ root: { fontWeight: 600 } }}>{item.ruleName}</Text>,
    },
    {
      key: "condition",
      name: "Type",
      minWidth: 120,
      maxWidth: 140,
      onRender: (item: AlertHistoryEntry) => (
        <span className="condition-badge">{conditionLabels[item.conditionType] || item.conditionType}</span>
      ),
    },
    {
      key: "gateway",
      name: "Gateway",
      minWidth: 120,
      maxWidth: 160,
      onRender: (item: AlertHistoryEntry) => <Text variant="small">{item.gatewayName}</Text>,
    },
    {
      key: "message",
      name: "Message",
      minWidth: 200,
      maxWidth: 350,
      isMultiline: true,
      onRender: (item: AlertHistoryEntry) => (
        <Text variant="small" styles={{ root: { lineHeight: 1.4 } }}>{item.message}</Text>
      ),
    },
    {
      key: "triggered",
      name: "Triggered",
      minWidth: 140,
      maxWidth: 170,
      onRender: (item: AlertHistoryEntry) => (
        <Text variant="small">
          {new Date(item.triggeredAt).toLocaleDateString("en-US", {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
          })}
        </Text>
      ),
    },
    {
      key: "ack",
      name: "Status",
      minWidth: 100,
      maxWidth: 130,
      onRender: (item: AlertHistoryEntry) =>
        item.acknowledged ? (
          <span className="status-badge status-pass">Acknowledged</span>
        ) : (
          <DefaultButton
            text="Acknowledge"
            styles={{ root: { borderRadius: 6, minWidth: 0, padding: "0 8px", fontSize: 12, height: 28 } }}
            onClick={() => handleAcknowledge(item.id)}
          />
        ),
    },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
          <Text variant="xxLarge" styles={{ root: { fontWeight: 700 } }}>
            Alerts
          </Text>
        </Stack>
        <Text variant="medium" styles={{ root: { color: "#605e5c", marginTop: 4 } }}>
          Monitor gateway health with configurable alert rules
        </Text>
      </div>

      <Stack horizontal tokens={{ childrenGap: 16 }} verticalAlign="end" styles={{ root: { marginBottom: 20 } }}>
        <SubscriptionPicker
          subscriptions={subscriptions}
          selectedSubscription={selectedSubscription}
          onChange={setSelectedSubscription}
          loading={subLoading}
        />
        <PrimaryButton
          text={evaluating ? "Evaluating..." : "Evaluate Now"}
          iconProps={{ iconName: "Play" }}
          disabled={evaluating || !selectedSubscription}
          onClick={handleEvaluate}
          styles={{ root: { borderRadius: 6 } }}
        />
      </Stack>

      {error && (
        <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError("")} styles={{ root: { marginBottom: 16 } }}>
          {error}
        </MessageBar>
      )}
      {success && (
        <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSuccess("")} styles={{ root: { marginBottom: 16 } }}>
          {success}
        </MessageBar>
      )}

      {newAlerts.length > 0 && (
        <MessageBar messageBarType={MessageBarType.severeWarning} styles={{ root: { marginBottom: 16 } }}>
          {newAlerts.length} new alert(s) triggered! Check the Alert History tab for details.
        </MessageBar>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{activeRules}</div>
          <div className="stat-label">Active Rules</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: last24h > 0 ? "#d83b01" : "#107c10" }}>{last24h}</div>
          <div className="stat-label">Triggered (24h)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: criticalCount > 0 ? "#d13438" : "#107c10" }}>{criticalCount}</div>
          <div className="stat-label">Critical</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: unacknowledged > 0 ? "#c19c00" : "#107c10" }}>{unacknowledged}</div>
          <div className="stat-label">Unacknowledged</div>
        </div>
      </div>

      {loading ? (
        <Spinner label="Loading alerts..." />
      ) : (
        <Pivot styles={{ root: { marginBottom: 16 } }}>
          <PivotItem headerText="Alert Rules" itemIcon="Shield">
            <div className="card" style={{ marginTop: 16 }}>
              <Stack horizontal horizontalAlign="end" styles={{ root: { marginBottom: 12 } }}>
                <PrimaryButton
                  text="Create Rule"
                  iconProps={{ iconName: "Add" }}
                  styles={{ root: { borderRadius: 6 } }}
                  onClick={() => setShowCreatePanel(true)}
                />
              </Stack>
              {rules.length === 0 ? (
                <div className="empty-state">
                  <h3>No alert rules configured</h3>
                  <p>Create your first rule to start monitoring your gateways</p>
                </div>
              ) : (
                <DetailsList
                  items={rules}
                  columns={ruleColumns}
                  layoutMode={DetailsListLayoutMode.justified}
                  selectionMode={SelectionMode.none}
                />
              )}
            </div>
          </PivotItem>

          <PivotItem headerText="Alert History" itemIcon="History">
            <div className="card" style={{ marginTop: 16 }}>
              <Stack horizontal horizontalAlign="end" styles={{ root: { marginBottom: 12 } }}>
                <DefaultButton
                  text="Clear History"
                  iconProps={{ iconName: "Delete" }}
                  styles={{ root: { borderRadius: 6, color: "#d13438", borderColor: "#d13438" } }}
                  onClick={() => setShowClearDialog(true)}
                  disabled={history.length === 0}
                />
              </Stack>
              {history.length === 0 ? (
                <div className="empty-state">
                  <h3>No alert history</h3>
                  <p>Triggered alerts will appear here after evaluation</p>
                </div>
              ) : (
                <DetailsList
                  items={history}
                  columns={historyColumns}
                  layoutMode={DetailsListLayoutMode.justified}
                  selectionMode={SelectionMode.none}
                  onRenderRow={(props, defaultRender) => {
                    if (!props || !defaultRender) return null;
                    const item = props.item as AlertHistoryEntry;
                    const className = !item.acknowledged ? `alert-row-${item.severity}` : "";
                    return (
                      <div className={className}>
                        {defaultRender(props)}
                      </div>
                    );
                  }}
                />
              )}
            </div>
          </PivotItem>
        </Pivot>
      )}

      {/* Create Rule Panel */}
      <Panel
        isOpen={showCreatePanel}
        onDismiss={() => setShowCreatePanel(false)}
        headerText="Create Alert Rule"
        type={PanelType.medium}
      >
        <Stack tokens={{ childrenGap: 16 }} styles={{ root: { marginTop: 20 } }}>
          <TextField
            label="Rule Name"
            placeholder="e.g., Production Gateway Health"
            value={ruleName}
            onChange={(_, v) => setRuleName(v || "")}
            required
          />
          <TextField
            label="Description"
            placeholder="What does this rule monitor?"
            value={ruleDescription}
            onChange={(_, v) => setRuleDescription(v || "")}
            multiline
            rows={2}
          />
          <Dropdown
            label="Condition Type"
            options={conditionOptions}
            selectedKey={ruleCondition}
            onChange={(_, opt) => setRuleCondition(opt?.key as AlertConditionType)}
            required
          />
          {ruleCondition === "cert_expiring" && (
            <TextField
              label="Days Before Expiry"
              type="number"
              value={ruleCertDays}
              onChange={(_, v) => setRuleCertDays(v || "30")}
              suffix="days"
            />
          )}
          <Dropdown
            label="Severity"
            options={severityOptions}
            selectedKey={ruleSeverity}
            onChange={(_, opt) => setRuleSeverity(opt?.key as AlertSeverity)}
            required
          />
          <Dropdown
            label="Application Gateway"
            placeholder="All gateways"
            options={[
              { key: "", text: "All Gateways" },
              ...gateways.map((g) => ({ key: g.name, text: `${g.name} (${g.resourceGroup})` })),
            ]}
            selectedKey={ruleGatewayFilter}
            onChange={(_, opt) => setRuleGatewayFilter(opt?.key as string || "")}
          />
          <Toggle
            label="Email Notifications"
            checked={ruleEmailEnabled}
            onChange={(_, c) => setRuleEmailEnabled(c || false)}
            inlineLabel
          />
          {ruleEmailEnabled && (
            <TextField
              label="Email Address"
              placeholder="alerts@company.com"
              value={ruleEmailTo}
              onChange={(_, v) => setRuleEmailTo(v || "")}
              type="email"
              required
            />
          )}
          <Stack horizontal tokens={{ childrenGap: 8 }} styles={{ root: { marginTop: 16 } }}>
            <PrimaryButton
              text={creating ? "Creating..." : "Create Rule"}
              disabled={!ruleName || creating}
              onClick={handleCreateRule}
              styles={{ root: { borderRadius: 6 } }}
            />
            <DefaultButton
              text="Cancel"
              onClick={() => setShowCreatePanel(false)}
              styles={{ root: { borderRadius: 6 } }}
            />
          </Stack>
        </Stack>
      </Panel>

      {/* Clear History Dialog */}
      <Dialog
        hidden={!showClearDialog}
        onDismiss={() => setShowClearDialog(false)}
        dialogContentProps={{
          type: DialogType.normal,
          title: "Clear Alert History",
          subText: "Are you sure you want to clear all alert history? This cannot be undone.",
        }}
      >
        <DialogFooter>
          <PrimaryButton text="Clear" onClick={handleClearHistory} styles={{ root: { background: "#d13438", borderColor: "#d13438" } }} />
          <DefaultButton text="Cancel" onClick={() => setShowClearDialog(false)} />
        </DialogFooter>
      </Dialog>
    </div>
  );
};
