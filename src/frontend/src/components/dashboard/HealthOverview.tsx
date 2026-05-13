import React, { useState } from "react";
import { Text, Spinner, PrimaryButton, Stack } from "@fluentui/react";
import { GatewayListItem } from "../../types";
import { getBackendHealth } from "../../services/api";

interface Props {
  gateways: GatewayListItem[];
  selectedSubscription: string;
}

interface GatewayHealth {
  name: string;
  loading: boolean;
  servers: { address: string; health: string }[];
}

export const HealthOverview: React.FC<Props> = ({ gateways, selectedSubscription }) => {
  const [healthMap, setHealthMap] = useState<Record<string, GatewayHealth>>({});
  const [checking, setChecking] = useState(false);

  const runningGateways = gateways.filter((g) => g.operationalState === "Running");

  const checkAll = async () => {
    setChecking(true);
    const results: Record<string, GatewayHealth> = {};

    for (const gw of runningGateways) {
      results[gw.name] = { name: gw.name, loading: true, servers: [] };
      setHealthMap({ ...results });

      try {
        const health = await getBackendHealth(selectedSubscription, gw.resourceGroup, gw.name);
        const servers: { address: string; health: string }[] = [];
        for (const pool of health?.backendAddressPools || []) {
          for (const settings of pool.backendHttpSettingsCollection || []) {
            for (const server of settings.servers || []) {
              servers.push({ address: server.address || "unknown", health: server.health || "Unknown" });
            }
          }
        }
        results[gw.name] = { name: gw.name, loading: false, servers };
      } catch {
        results[gw.name] = { name: gw.name, loading: false, servers: [] };
      }
      setHealthMap({ ...results });
    }
    setChecking(false);
  };

  if (runningGateways.length === 0) {
    return (
      <div className="card">
        <Text styles={{ root: { color: "#605e5c" } }}>No running gateways to check health</Text>
      </div>
    );
  }

  const hasData = Object.keys(healthMap).length > 0;

  return (
    <div>
      {!hasData && (
        <PrimaryButton
          text={checking ? "Checking..." : "Check Fleet Health"}
          iconProps={{ iconName: "Heart" }}
          disabled={checking}
          onClick={checkAll}
          styles={{ root: { borderRadius: 6, marginBottom: 12 } }}
        />
      )}

      <div className="health-grid">
        {runningGateways.map((gw) => {
          const gh = healthMap[gw.name];
          const unhealthyCount = gh?.servers.filter((s) => s.health !== "Healthy").length || 0;
          const healthyCount = gh?.servers.filter((s) => s.health === "Healthy").length || 0;
          const allHealthy = gh && !gh.loading && unhealthyCount === 0 && gh.servers.length > 0;

          return (
            <div key={gw.name} className={`health-card ${allHealthy ? "all-healthy" : gh && !gh.loading ? "has-unhealthy" : ""}`}>
              <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                <Text styles={{ root: { fontWeight: 600 } }}>{gw.name}</Text>
                {gw.wafEnabled && <span className="status-badge status-pass" style={{ fontSize: 10 }}>WAF</span>}
              </Stack>
              {!gh ? (
                <Text variant="small" styles={{ root: { color: "#a19f9d", marginTop: 8, display: "block" } }}>
                  Click "Check Fleet Health" to scan
                </Text>
              ) : gh.loading ? (
                <Spinner size={1} styles={{ root: { marginTop: 8 } }} />
              ) : gh.servers.length === 0 ? (
                <Text variant="small" styles={{ root: { color: "#a19f9d", marginTop: 8, display: "block" } }}>
                  No backend servers configured
                </Text>
              ) : (
                <Stack styles={{ root: { marginTop: 8 } }}>
                  <Stack horizontal tokens={{ childrenGap: 12 }}>
                    <Text variant="small" styles={{ root: { color: "#107c10", fontWeight: 600 } }}>
                      {healthyCount} healthy
                    </Text>
                    {unhealthyCount > 0 && (
                      <Text variant="small" styles={{ root: { color: "#d13438", fontWeight: 600 } }}>
                        {unhealthyCount} unhealthy
                      </Text>
                    )}
                  </Stack>
                  <Stack styles={{ root: { marginTop: 4 } }}>
                    {gh.servers.map((s, i) => (
                      <Stack key={i} horizontal verticalAlign="center" tokens={{ childrenGap: 6 }}>
                        <span className={`health-dot ${s.health === "Healthy" ? "healthy" : "unhealthy"}`} />
                        <Text variant="small">{s.address}</Text>
                      </Stack>
                    ))}
                  </Stack>
                </Stack>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
