import React, { useState } from "react";
import {
  Text,
  Stack,
  PrimaryButton,
  DefaultButton,
  Toggle,
  TextField,
  Spinner,
  MessageBar,
  MessageBarType,
} from "@fluentui/react";
import { AlertRule, AlertHistoryEntry } from "../../types";
import { evaluateAlerts, toggleAlertRule, updateAlertRule, acknowledgeAlert } from "../../services/api";

interface Props {
  rules: AlertRule[];
  history: AlertHistoryEntry[];
  selectedSubscription: string;
  onRefresh: () => void;
}

const conditionLabels: Record<string, string> = {
  drift_detected: "Config Drift",
  cert_expiring: "Cert Expiry",
  unhealthy_backends: "Unhealthy Backends",
  gateway_stopped: "Gateway Stopped",
  waf_detection_mode: "WAF Detection",
};

export const AlertsSection: React.FC<Props> = ({ rules, history, selectedSubscription, onRefresh }) => {
  const [evaluating, setEvaluating] = useState(false);
  const [newAlerts, setNewAlerts] = useState<AlertHistoryEntry[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeRules = rules.filter((r) => r.enabled).length;
  const criticalCount = history.filter((h) => h.severity === "critical" && !h.acknowledged).length;
  const unacknowledged = history.filter((h) => !h.acknowledged).length;

  const handleEvaluate = async () => {
    setEvaluating(true);
    setError("");
    setNewAlerts([]);
    try {
      const alerts = await evaluateAlerts(selectedSubscription);
      setNewAlerts(alerts);
      setSuccess(alerts.length > 0 ? `${alerts.length} alert(s) triggered` : "All clear!");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setEvaluating(false);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await toggleAlertRule(id, enabled);
    onRefresh();
  };

  const handleEmailToggle = async (rule: AlertRule, enabled: boolean) => {
    await updateAlertRule(rule.id, { emailEnabled: enabled });
    onRefresh();
  };

  const handleEmailChange = async (rule: AlertRule, email: string) => {
    await updateAlertRule(rule.id, { emailTo: email });
    onRefresh();
  };

  const handleAck = async (id: string) => {
    await acknowledgeAlert(id);
    onRefresh();
  };

  return (
    <div>
      {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError("")} styles={{ root: { marginBottom: 8 } }}>{error}</MessageBar>}
      {success && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSuccess("")} styles={{ root: { marginBottom: 8 } }}>{success}</MessageBar>}

      <Stack horizontal tokens={{ childrenGap: 16 }} styles={{ root: { marginBottom: 16 } }}>
        <div className="stat-card" style={{ padding: 12, minWidth: 100 }}>
          <div className="stat-value" style={{ fontSize: 20 }}>{activeRules}</div>
          <div className="stat-label" style={{ fontSize: 10 }}>Active Rules</div>
        </div>
        <div className="stat-card" style={{ padding: 12, minWidth: 100 }}>
          <div className="stat-value" style={{ fontSize: 20, color: criticalCount > 0 ? "#d13438" : "#107c10" }}>{criticalCount}</div>
          <div className="stat-label" style={{ fontSize: 10 }}>Critical</div>
        </div>
        <div className="stat-card" style={{ padding: 12, minWidth: 100 }}>
          <div className="stat-value" style={{ fontSize: 20, color: unacknowledged > 0 ? "#c19c00" : "#107c10" }}>{unacknowledged}</div>
          <div className="stat-label" style={{ fontSize: 10 }}>Unacknowledged</div>
        </div>
      </Stack>

      {/* Rules with email config */}
      {rules.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <Text variant="medium" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block" } }}>Alert Rules</Text>
          {rules.map((rule) => (
            <Stack
              key={rule.id}
              horizontal
              verticalAlign="center"
              tokens={{ childrenGap: 12 }}
              styles={{ root: { padding: "8px 0", borderBottom: "1px solid #f3f2f1" } }}
            >
              <Toggle checked={rule.enabled} onChange={(_, c) => handleToggle(rule.id, c || false)} styles={{ root: { margin: 0 } }} />
              <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>{rule.name}</Text>
              <span className="condition-badge">{conditionLabels[rule.conditionType]}</span>
              <span className={`severity-badge severity-${rule.severity}`}>{rule.severity}</span>
              <Toggle
                label="Email"
                inlineLabel
                checked={rule.emailEnabled || false}
                onChange={(_, c) => handleEmailToggle(rule, c || false)}
                styles={{ root: { margin: 0 } }}
              />
              {rule.emailEnabled && (
                <TextField
                  placeholder="alert@company.com"
                  value={rule.emailTo || ""}
                  onChange={(_, v) => handleEmailChange(rule, v || "")}
                  styles={{ root: { width: 180 } }}
                  borderless
                  underlined
                />
              )}
            </Stack>
          ))}
        </div>
      )}

      {/* Recent History */}
      {history.length > 0 && (
        <div className="card">
          <Text variant="medium" styles={{ root: { fontWeight: 600, marginBottom: 8, display: "block" } }}>
            Recent Alerts (Last 10)
          </Text>
          {history.slice(0, 10).map((alert) => (
            <Stack
              key={alert.id}
              horizontal
              verticalAlign="center"
              tokens={{ childrenGap: 10 }}
              styles={{ root: { padding: "6px 0", borderBottom: "1px solid #f3f2f1", fontSize: 13 } }}
              className={!alert.acknowledged ? `alert-row-${alert.severity}` : ""}
            >
              <span className={`severity-badge severity-${alert.severity}`} style={{ fontSize: 9 }}>{alert.severity}</span>
              <Text variant="small" styles={{ root: { fontWeight: 600, minWidth: 100 } }}>{alert.ruleName}</Text>
              <Text variant="small" styles={{ root: { color: "#605e5c", minWidth: 80 } }}>{alert.gatewayName}</Text>
              <Text variant="small" styles={{ root: { flex: 1 } }}>{alert.message}</Text>
              <Text variant="small" styles={{ root: { color: "#a19f9d", minWidth: 80 } }}>
                {new Date(alert.triggeredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
              {!alert.acknowledged ? (
                <DefaultButton
                  text="Ack"
                  styles={{ root: { borderRadius: 6, minWidth: 0, padding: "0 8px", height: 24, fontSize: 11 } }}
                  onClick={() => handleAck(alert.id)}
                />
              ) : (
                <span className="status-badge status-pass" style={{ fontSize: 10 }}>Acked</span>
              )}
            </Stack>
          ))}
        </div>
      )}

      {evaluating && <Spinner label="Evaluating alert rules..." styles={{ root: { marginTop: 8 } }} />}
    </div>
  );
};
