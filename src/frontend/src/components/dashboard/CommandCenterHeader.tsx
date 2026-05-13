import React from "react";
import { Stack, Text } from "@fluentui/react";
import { SubscriptionPicker } from "../SubscriptionPicker";
import { Subscription } from "../../types";

interface HeaderProps {
  subscriptions: Subscription[];
  selectedSubscription: string;
  onSubscriptionChange: (id: string) => void;
  subLoading: boolean;
  stats: {
    total: number;
    running: number;
    stopped: number;
    wafEnabled: number;
    wafDisabled: number;
    alerts: number;
    driftChanges: number;
    expiringCerts: number;
    afdCount: number;
    tmCount: number;
  };
}

export const CommandCenterHeader: React.FC<HeaderProps> = ({
  subscriptions,
  selectedSubscription,
  onSubscriptionChange,
  subLoading,
  stats,
}) => (
  <div style={{ marginBottom: 24 }}>
    {/* Enterprise header banner */}
    <div style={{
      background: "linear-gradient(135deg, #0078d4 0%, #005a9e 60%, #003b6f 100%)",
      borderRadius: 12,
      padding: "28px 32px",
      marginBottom: 20,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Decorative circles */}
      <div style={{ position: "absolute", right: -40, top: -40, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
      <div style={{ position: "absolute", right: 80, bottom: -60, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />

      <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 16 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: "rgba(255,255,255,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, backdropFilter: "blur(8px)",
        }}>
          🎯
        </div>
        <div style={{ flex: 1 }}>
          <Text styles={{ root: { fontWeight: 700, color: "white", fontSize: 26, letterSpacing: "-0.5px" } }}>
            Command Center
          </Text>
          <Text styles={{ root: { color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 2 } }}>
            Unified control plane for your Application Gateway infrastructure
          </Text>
        </div>
        <div style={{ minWidth: 280 }}>
          <SubscriptionPicker
            subscriptions={subscriptions}
            selectedSubscription={selectedSubscription}
            onChange={onSubscriptionChange}
            loading={subLoading}
          />
        </div>
      </Stack>
    </div>

    {/* Stats bar — enterprise KPI strip */}
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(9, 1fr)",
      gap: 1,
      background: "#edebe9",
      borderRadius: 10,
      overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      {[
        { value: stats.total, label: "App Gateways", color: "#0078d4", icon: "🌐" },
        { value: stats.running, label: "Running", color: "#107c10", icon: "▲" },
        { value: stats.stopped, label: "Stopped", color: stats.stopped > 0 ? "#d13438" : "#107c10", icon: "▼" },
        { value: stats.wafEnabled, label: "WAF On", color: "#107c10", icon: "🛡️" },
        { value: stats.wafDisabled, label: "WAF Off", color: stats.wafDisabled > 0 ? "#d83b01" : "#107c10", icon: "⚠" },
        { value: stats.afdCount, label: "Front Door", color: "#008272", icon: "🌍" },
        { value: stats.tmCount, label: "Traffic Mgr", color: "#5c2d91", icon: "🚦" },
        { value: stats.alerts, label: "Alerts", color: stats.alerts > 0 ? "#d83b01" : "#107c10", icon: "🔔" },
        { value: stats.expiringCerts, label: "Expiring Certs", color: stats.expiringCerts > 0 ? "#d83b01" : "#107c10", icon: "🔐" },
      ].map((s, i) => (
        <div key={i} style={{
          background: "white",
          padding: "14px 12px",
          textAlign: "center",
          transition: "background 0.15s",
        }}>
          <div style={{ fontSize: 11, marginBottom: 4 }}>{s.icon}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1.1 }}>{s.value}</div>
          <div style={{ fontSize: 10, color: "#605e5c", marginTop: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{s.label}</div>
        </div>
      ))}
    </div>
  </div>
);
