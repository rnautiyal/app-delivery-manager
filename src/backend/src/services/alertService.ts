import crypto from "crypto";
import { StorageService } from "./storageService";
import { GatewayService } from "./gatewayService";
import { DriftService } from "./driftService";
import {
  AlertRule,
  AlertHistoryEntry,
  AlertConditionType,
  AlertSeverity,
} from "../models/types";
import { logger } from "../config/logger";
import { EmailService } from "./emailService";

export class AlertService {
  private ruleStorage = new StorageService<AlertRule>("alert-rules.json");
  private historyStorage = new StorageService<AlertHistoryEntry>("alert-history.json");
  private gatewayService = new GatewayService();
  private driftService = new DriftService();
  private emailService = new EmailService();

  // ==================== RULES CRUD ====================

  createRule(
    name: string,
    description: string,
    conditionType: AlertConditionType,
    severity: AlertSeverity,
    subscriptionId: string,
    createdBy: string,
    gatewayFilter?: string,
    conditionParams?: Record<string, any>
  ): AlertRule {
    const rule: AlertRule = {
      id: crypto.randomUUID(),
      name,
      description,
      enabled: true,
      conditionType,
      conditionParams: conditionParams || {},
      severity,
      subscriptionId,
      gatewayFilter,
      createdAt: new Date().toISOString(),
      createdBy,
    };

    this.ruleStorage.add(rule);
    logger.info("Alert rule created", { ruleId: rule.id, name, conditionType });
    return rule;
  }

  listRules(subscriptionId?: string): AlertRule[] {
    let rules = this.ruleStorage.readAll();
    if (subscriptionId) {
      rules = rules.filter((r) => r.subscriptionId === subscriptionId);
    }
    return rules;
  }

  getRule(id: string): AlertRule {
    const rule = this.ruleStorage.findById(id);
    if (!rule) throw new Error(`Alert rule not found: ${id}`);
    return rule;
  }

  updateRule(id: string, updates: Partial<AlertRule>): AlertRule {
    const rule = this.getRule(id);
    const updated = { ...rule, ...updates, id: rule.id, createdAt: rule.createdAt, createdBy: rule.createdBy };
    this.ruleStorage.update(id, updated);
    logger.info("Alert rule updated", { ruleId: id });
    return updated;
  }

  toggleRule(id: string, enabled: boolean): AlertRule {
    return this.updateRule(id, { enabled });
  }

  deleteRule(id: string): void {
    this.ruleStorage.remove(id);
    logger.info("Alert rule deleted", { ruleId: id });
  }

  // ==================== EVALUATION ====================

  async evaluateRules(subscriptionId: string): Promise<AlertHistoryEntry[]> {
    const rules = this.listRules(subscriptionId).filter((r) => r.enabled);
    const newAlerts: AlertHistoryEntry[] = [];

    for (const rule of rules) {
      try {
        const alerts = await this.evaluateRule(rule);
        newAlerts.push(...alerts);
      } catch (error) {
        logger.error("Failed to evaluate alert rule", {
          ruleId: rule.id,
          ruleName: rule.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Save all new alerts to history
    for (const alert of newAlerts) {
      this.historyStorage.add(alert);
    }

    // Send email notifications for rules with email enabled
    if (newAlerts.length > 0) {
      for (const rule of rules) {
        if (rule.emailEnabled && rule.emailTo) {
          const ruleAlerts = newAlerts.filter((a) => a.ruleId === rule.id);
          if (ruleAlerts.length > 0) {
            this.emailService.sendAlertEmail(rule.emailTo, ruleAlerts).catch((err) => {
              logger.error("Failed to send alert email", { ruleId: rule.id, error: err });
            });
          }
        }
      }
    }

    logger.info("Alert evaluation completed", {
      subscriptionId,
      rulesEvaluated: rules.length,
      alertsTriggered: newAlerts.length,
    });

    return newAlerts;
  }

  private async evaluateRule(rule: AlertRule): Promise<AlertHistoryEntry[]> {
    switch (rule.conditionType) {
      case "drift_detected":
        return await this.checkDriftAlerts(rule);
      case "cert_expiring":
        return await this.checkCertAlerts(rule);
      case "unhealthy_backends":
        return await this.checkUnhealthyBackends(rule);
      case "gateway_stopped":
        return await this.checkGatewayStopped(rule);
      case "waf_detection_mode":
        return await this.checkWafDetectionMode(rule);
      default:
        return [];
    }
  }

  private async checkDriftAlerts(rule: AlertRule): Promise<AlertHistoryEntry[]> {
    const alerts: AlertHistoryEntry[] = [];
    const baselines = this.driftService.listBaselines(rule.subscriptionId, rule.gatewayFilter);

    for (const baseline of baselines) {
      try {
        const report = await this.driftService.checkDrift(baseline.id);
        if (report.hasDrift) {
          alerts.push(this.createAlert(
            rule,
            baseline.gatewayName,
            baseline.resourceGroup,
            `Configuration drift detected: ${report.totalChanges} change(s) — ${report.additions} added, ${report.removals} removed, ${report.modifications} modified`,
            { driftReport: report }
          ));
        }
      } catch {
        // Gateway may have been deleted
      }
    }

    return alerts;
  }

  private async checkCertAlerts(rule: AlertRule): Promise<AlertHistoryEntry[]> {
    const alerts: AlertHistoryEntry[] = [];
    const days = rule.conditionParams.days || 30;

    try {
      const gateways = await this.gatewayService.listGateways(rule.subscriptionId);
      for (const gw of gateways) {
        if (rule.gatewayFilter && rule.gatewayFilter !== "*" && gw.name !== rule.gatewayFilter) continue;

        const fullGw = await this.gatewayService.getGateway(rule.subscriptionId, gw.resourceGroup, gw.name);
        for (const cert of fullGw.sslCertificates || []) {
          // Check if certificate is referenced in Key Vault with expiry info
          if (cert.keyVaultSecretId) {
            alerts.push(this.createAlert(
              rule,
              gw.name,
              gw.resourceGroup,
              `SSL certificate '${cert.name}' should be checked for expiry (threshold: ${days} days)`,
              { certificateName: cert.name, keyVaultSecretId: cert.keyVaultSecretId }
            ));
          }
        }
      }
    } catch (error) {
      logger.error("Failed to check cert alerts", { error });
    }

    return alerts;
  }

  private async checkUnhealthyBackends(rule: AlertRule): Promise<AlertHistoryEntry[]> {
    const alerts: AlertHistoryEntry[] = [];

    try {
      const gateways = await this.gatewayService.listGateways(rule.subscriptionId);
      for (const gw of gateways) {
        if (rule.gatewayFilter && rule.gatewayFilter !== "*" && gw.name !== rule.gatewayFilter) continue;
        if (gw.operationalState !== "Running") continue;

        try {
          const health = await this.gatewayService.getBackendHealth(rule.subscriptionId, gw.resourceGroup, gw.name);
          const unhealthy: string[] = [];

          for (const pool of health.backendAddressPools || []) {
            for (const server of pool.backendHttpSettingsCollection || []) {
              for (const s of server.servers || []) {
                if (s.health === "Unhealthy") {
                  unhealthy.push(s.address || "unknown");
                }
              }
            }
          }

          if (unhealthy.length > 0) {
            alerts.push(this.createAlert(
              rule,
              gw.name,
              gw.resourceGroup,
              `${unhealthy.length} unhealthy backend server(s): ${unhealthy.slice(0, 5).join(", ")}${unhealthy.length > 5 ? "..." : ""}`,
              { unhealthyServers: unhealthy }
            ));
          }
        } catch {
          // Backend health check may fail for stopped gateways
        }
      }
    } catch (error) {
      logger.error("Failed to check unhealthy backends", { error });
    }

    return alerts;
  }

  private async checkGatewayStopped(rule: AlertRule): Promise<AlertHistoryEntry[]> {
    const alerts: AlertHistoryEntry[] = [];

    try {
      const gateways = await this.gatewayService.listGateways(rule.subscriptionId);
      for (const gw of gateways) {
        if (rule.gatewayFilter && rule.gatewayFilter !== "*" && gw.name !== rule.gatewayFilter) continue;

        if (gw.operationalState === "Stopped") {
          alerts.push(this.createAlert(
            rule,
            gw.name,
            gw.resourceGroup,
            `Gateway '${gw.name}' is in Stopped state`,
            { operationalState: gw.operationalState }
          ));
        }
      }
    } catch (error) {
      logger.error("Failed to check gateway stopped", { error });
    }

    return alerts;
  }

  private async checkWafDetectionMode(rule: AlertRule): Promise<AlertHistoryEntry[]> {
    const alerts: AlertHistoryEntry[] = [];

    try {
      const gateways = await this.gatewayService.listGateways(rule.subscriptionId);
      for (const gw of gateways) {
        if (rule.gatewayFilter && rule.gatewayFilter !== "*" && gw.name !== rule.gatewayFilter) continue;

        const fullGw = await this.gatewayService.getGateway(rule.subscriptionId, gw.resourceGroup, gw.name);
        const waf = fullGw.webApplicationFirewallConfiguration;
        if (waf && waf.enabled && waf.firewallMode === "Detection") {
          alerts.push(this.createAlert(
            rule,
            gw.name,
            gw.resourceGroup,
            `WAF is in Detection mode (not Prevention) — attacks are logged but not blocked`,
            { firewallMode: waf.firewallMode }
          ));
        }
      }
    } catch (error) {
      logger.error("Failed to check WAF detection mode", { error });
    }

    return alerts;
  }

  private createAlert(
    rule: AlertRule,
    gatewayName: string,
    resourceGroup: string,
    message: string,
    details?: any
  ): AlertHistoryEntry {
    return {
      id: crypto.randomUUID(),
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      conditionType: rule.conditionType,
      gatewayName,
      resourceGroup,
      subscriptionId: rule.subscriptionId,
      message,
      details,
      triggeredAt: new Date().toISOString(),
      acknowledged: false,
    };
  }

  // ==================== HISTORY ====================

  getHistory(subscriptionId?: string, limit?: number): AlertHistoryEntry[] {
    let history = this.historyStorage.readAll();
    if (subscriptionId) {
      history = history.filter((h) => h.subscriptionId === subscriptionId);
    }
    history.sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime());
    if (limit) {
      history = history.slice(0, limit);
    }
    return history;
  }

  acknowledgeAlert(alertId: string, acknowledgedBy: string): void {
    const alert = this.historyStorage.findById(alertId);
    if (!alert) throw new Error(`Alert not found: ${alertId}`);
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
    alert.acknowledgedBy = acknowledgedBy;
    this.historyStorage.update(alertId, alert);
  }

  clearHistory(subscriptionId?: string): void {
    if (subscriptionId) {
      const history = this.historyStorage.readAll().filter((h) => h.subscriptionId !== subscriptionId);
      this.historyStorage.writeAll(history);
    } else {
      this.historyStorage.writeAll([]);
    }
    logger.info("Alert history cleared", { subscriptionId });
  }
}
