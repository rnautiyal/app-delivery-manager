import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import {
  Stack,
  Text,
  Persona,
  PersonaSize,
  IconButton,
  Panel,
} from "@fluentui/react";
import "../styles/global.css";
import { AZURE_ICONS } from "./AzureIcons";

interface LayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  name: string;
  url: string;
  icon: string;
  color: string;
  emoji: string;
  badge?: string;
}

const navSections = [
  {
    title: "AI",
    items: [
      { name: "AppDelivery Genie", url: "/", icon: "Chat", color: "#8764b8", emoji: "\uD83E\uDDDE" },
      { name: "Command Palette", url: "/command-palette", icon: "CommandPrompt", color: "#0078d4", emoji: "\u2318" },
    ] as NavItem[],
  },
  {
    title: "MANAGE",
    items: [
      { name: "Command Center", url: "/dashboard", icon: "ViewDashboard", color: "#0078d4", emoji: "\uD83C\uDFAF" },
      { name: "Application Gateway", url: "/gateways", icon: "ServerProcesses", color: "#00a4ef", emoji: "\uD83C\uDF10" },
      { name: "Front Door", url: "/afd", icon: "Globe", color: "#008272", emoji: "\uD83C\uDF0D" },
      { name: "Traffic Manager", url: "/traffic-manager", icon: "BranchFork2", color: "#5c2d91", emoji: "\uD83D\uDEA6" },
      { name: "Firewall Manager", url: "/firewall", icon: "Firewall", color: "#d83b01", emoji: "\uD83D\uDD25" },
      { name: "Certificates", url: "/certificates", icon: "Certificate", color: "#107c10", emoji: "\uD83D\uDD10" },
      { name: "WAF Policies", url: "/waf", icon: "Shield", color: "#d83b01", emoji: "\uD83D\uDEE1\uFE0F" },
    ] as NavItem[],
  },
  {
    title: "OPS",
    items: [
      { name: "Log Analytics", url: "/log-analytics", icon: "AnalyticsView", color: "#00a4ef", emoji: "\uD83D\uDCCA" },
      { name: "Traffic Analytics", url: "/traffic-analytics", icon: "FlowChart", color: "#005b70", emoji: "\uD83D\uDEF0\uFE0F" },
      { name: "Templates", url: "/templates", icon: "Copy", color: "#8764b8", emoji: "\uD83D\uDCCB" },
      { name: "Drift Tracking", url: "/drift", icon: "BranchCompare", color: "#0078d4", emoji: "\uD83D\uDD0D" },
      { name: "Alerts", url: "/alerts", icon: "Ringer", color: "#d83b01", emoji: "\uD83D\uDD14" },
      { name: "Maintenance", url: "/maintenance", icon: "DeveloperTools", color: "#107c10", emoji: "\uD83D\uDD27" },
      { name: "Autoscale", url: "/autoscale", icon: "Stopwatch", color: "#0078d4", emoji: "\u23F0" },
    ] as NavItem[],
  },
  {
    title: "SECURITY",
    items: [
      { name: "Security Scan", url: "/security-scan", icon: "SecurityGroup", color: "#e3008c", emoji: "\uD83D\uDD0D" },
    ] as NavItem[],
  },
  {
    title: "MULTI-CLOUD",
    items: [
      { name: "AWS ALBs", url: "/aws/albs", icon: "Cloud", color: "#ff9900", emoji: "\u2601\uFE0F" },
      { name: "GCP Load Balancers", url: "/gcp/lbs", icon: "Cloud", color: "#4285f4", emoji: "\uD83C\uDF10" },
    ] as NavItem[],
  },
  {
    title: "BILLING",
    items: [
      { name: "Billing & Usage", url: "/billing", icon: "Money", color: "#107c10", emoji: "\uD83D\uDCB3" },
    ] as NavItem[],
  },
];

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const demoMode = !!localStorage.getItem("demo_token");
  let instance: any = null;
  let accounts: any[] = [];
  try {
    const msal = useMsal();
    instance = msal.instance;
    accounts = msal.accounts;
  } catch {
    // Demo mode — no MSAL provider
  }
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const account = demoMode ? { name: "Rajesh Nautiyal", username: "rnautiyal@microsoft.com" } : accounts[0];

  const handleLogout = () => {
    if (demoMode) {
      localStorage.removeItem("demo_token");
      window.location.href = "/";
      return;
    }
    instance?.logoutRedirect();
  };

  return (
    <Stack horizontal styles={{ root: { height: "100vh" } }}>
      {/* Sidebar */}
      <Stack
        styles={{
          root: {
            width: 260,
            background: "#ffffff",
            padding: "0",
            borderRight: "1px solid #e1dfdd",
            boxShadow: "1px 0 4px rgba(0,0,0,0.05)",
          },
        }}
      >
        {/* Logo */}
        <Stack
          horizontal
          verticalAlign="center"
          tokens={{ padding: "20px 20px", childrenGap: 10 }}
          styles={{ root: { borderBottom: "1px solid #e1dfdd" } }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #0078d4, #50e6ff)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>
            {"\u26A1"}
          </div>
          <Stack>
            <Text styles={{ root: { fontWeight: 700, color: "#323130", fontSize: 16 } }}>
              App Delivery Manager
            </Text>
            <Text styles={{ root: { color: "#a19f9d", fontSize: 10 } }}>
              Powered by AI
            </Text>
          </Stack>
        </Stack>

        {/* Nav sections */}
        <Stack styles={{ root: { flex: 1, padding: "12px 0", overflow: "auto" } }}>
          {navSections.map((section) => (
            <Stack key={section.title} styles={{ root: { marginBottom: 8 } }}>
              <Text styles={{
                root: {
                  color: "#a19f9d",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "1.5px",
                  padding: "8px 20px 4px",
                },
              }}>
                {section.title}
              </Text>
              {section.items.map((item) => {
                const isActive = location.pathname === item.url ||
                  (item.url === "/" && location.pathname === "/chat");
                return (
                  <Stack
                    key={item.url}
                    horizontal
                    verticalAlign="center"
                    onClick={() => navigate(item.url)}
                    styles={{
                      root: {
                        padding: "10px 20px",
                        cursor: "pointer",
                        background: isActive
                          ? "#e8f4fd"
                          : "transparent",
                        borderLeft: isActive
                          ? `3px solid ${item.color}`
                          : "3px solid transparent",
                        transition: "all 0.15s ease",
                        selectors: {
                          ":hover": {
                            background: "#f3f2f1",
                          },
                        },
                      },
                    }}
                  >
                    <span style={{ fontSize: 18, marginRight: 12, width: 24, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {AZURE_ICONS[item.url] || item.emoji}
                    </span>
                    <Text styles={{
                      root: {
                        color: isActive ? "#0078d4" : "#323130",
                        fontWeight: isActive ? 600 : 400,
                        fontSize: 14,
                        flex: 1,
                      },
                    }}>
                      {item.name}
                    </Text>
                    {item.badge && (
                      <span style={{
                        background: item.color,
                        color: "white",
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 10,
                        letterSpacing: "0.5px",
                      }}>
                        {item.badge}
                      </span>
                    )}
                  </Stack>
                );
              })}
            </Stack>
          ))}
        </Stack>

        {/* User section */}
        <Stack
          styles={{
            root: {
              borderTop: "1px solid #e1dfdd",
              padding: "12px 16px",
            },
          }}
        >
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
            <Persona
              text={account?.name || "User"}
              size={PersonaSize.size32}
              hidePersonaDetails
              styles={{ root: { cursor: "pointer" } }}
              onClick={() => setIsPanelOpen(true)}
            />
            <Stack styles={{ root: { flex: 1 } }}>
              <Text styles={{ root: { color: "#323130", fontSize: 13, fontWeight: 500 } }}>
                {account?.name || "User"}
              </Text>
              <Text styles={{ root: { color: "#a19f9d", fontSize: 11 } }}>
                {account?.username?.split("@")[0]}
              </Text>
            </Stack>
            <IconButton
              iconProps={{ iconName: "SignOut" }}
              title="Sign out"
              onClick={handleLogout}
              styles={{
                root: { color: "#a19f9d" },
                rootHovered: { color: "#323130", background: "#f3f2f1" },
              }}
            />
          </Stack>
        </Stack>
      </Stack>

      {/* Main content */}
      <Stack styles={{ root: { flex: 1, overflow: "auto", background: "#faf9f8" } }}>
        {children}
      </Stack>

      {/* User panel */}
      <Panel isOpen={isPanelOpen} onDismiss={() => setIsPanelOpen(false)} headerText="Account">
        <Stack tokens={{ childrenGap: 12, padding: 16 }}>
          <Persona text={account?.name} secondaryText={account?.username} size={PersonaSize.size72} />
          <Text variant="small">Tenant: {account?.tenantId}</Text>
        </Stack>
      </Panel>
    </Stack>
  );
}
