import { useState, useEffect } from "react";
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate } from "@azure/msal-react";
import { PublicClientApplication } from "@azure/msal-browser";
import { ThemeProvider, initializeIcons } from "@fluentui/react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { GatewayListPage } from "./pages/GatewayListPage";
import { GatewayDetailPage } from "./pages/GatewayDetailPage";
import { CertificatesPage } from "./pages/CertificatesPage";
import { WafPage } from "./pages/WafPage";
import { DiagnosticsPage } from "./pages/DiagnosticsPage";
import { MonitoringPage } from "./pages/MonitoringPage";
import { ChatPage } from "./pages/ChatPage";
import { SecurityScanPage } from "./pages/SecurityScanPage";
import { TemplatesPage } from "./pages/TemplatesPage";
import { DriftPage } from "./pages/DriftPage";
import { AlertsPage } from "./pages/AlertsPage";
import { MaintenancePage } from "./pages/MaintenancePage";
import { AutoscalePage } from "./pages/AutoscalePage";
import { AwsAlbPage } from "./pages/AwsAlbPage";
import { AfdPage } from "./pages/AfdPage";
import { TrafficManagerPage } from "./pages/TrafficManagerPage";
import { GcpLbPage } from "./pages/GcpLbPage";
import { BillingPage } from "./pages/BillingPage";
import { CommandPalettePage } from "./pages/CommandPalettePage";
import { LogAnalyticsPage } from "./pages/LogAnalyticsPage";
import { TrafficAnalyticsPage } from "./pages/TrafficAnalyticsPage";
import { FirewallPage } from "./pages/FirewallPage";

initializeIcons();

// Check for demo mode via URL param or localStorage
function isDemoMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  const demoParam = params.get("demo");
  if (demoParam) {
    localStorage.setItem("demo_token", demoParam);
    // Clean URL
    window.history.replaceState({}, "", window.location.pathname);
    return true;
  }
  return !!localStorage.getItem("demo_token");
}

export function getDemoToken(): string | null {
  return localStorage.getItem("demo_token");
}

interface AppProps {
  msalInstance: PublicClientApplication;
}

function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/gateways" element={<GatewayListPage />} />
        <Route path="/gateways/:subscriptionId/:resourceGroup/:name" element={<GatewayDetailPage />} />
        <Route path="/certificates" element={<CertificatesPage />} />
        <Route path="/waf" element={<WafPage />} />
        <Route path="/afd" element={<AfdPage />} />
        <Route path="/traffic-manager" element={<TrafficManagerPage />} />
        <Route path="/firewall" element={<FirewallPage />} />
        <Route path="/monitoring/:subscriptionId/:resourceGroup/:name" element={<MonitoringPage />} />
        <Route path="/diagnostics/:subscriptionId/:resourceGroup/:name" element={<DiagnosticsPage />} />
        <Route path="/security-scan" element={<SecurityScanPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/drift" element={<DriftPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/autoscale" element={<AutoscalePage />} />
        <Route path="/aws/albs" element={<AwsAlbPage />} />
        <Route path="/gcp/lbs" element={<GcpLbPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/command-palette" element={<CommandPalettePage />} />
        <Route path="/log-analytics" element={<LogAnalyticsPage />} />
        <Route path="/traffic-analytics" element={<TrafficAnalyticsPage />} />
      </Routes>
    </Layout>
  );
}

export default function App({ msalInstance }: AppProps) {
  const [demoMode] = useState(isDemoMode);

  if (demoMode) {
    // Skip MSAL entirely — use demo token for API calls
    return (
      <ThemeProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ThemeProvider>
    );
  }

  return (
    <MsalProvider instance={msalInstance}>
      <ThemeProvider>
        <BrowserRouter>
          <UnauthenticatedTemplate>
            <LoginPage />
          </UnauthenticatedTemplate>
          <AuthenticatedTemplate>
            <AppRoutes />
          </AuthenticatedTemplate>
        </BrowserRouter>
      </ThemeProvider>
    </MsalProvider>
  );
}
