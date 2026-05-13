import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Stack, Text, Spinner, MessageBar, MessageBarType, DefaultButton, Dropdown, IDropdownOption } from "@fluentui/react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { getGatewayMetrics } from "../services/api";
import { GatewayMetrics } from "../types";

export function MonitoringPage() {
  const { subscriptionId, resourceGroup, name } = useParams<{
    subscriptionId: string;
    resourceGroup: string;
    name: string;
  }>();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<GatewayMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState("PT1H");

  const timeOptions: IDropdownOption[] = [
    { key: "PT1H", text: "Last 1 hour" },
    { key: "PT6H", text: "Last 6 hours" },
    { key: "PT24H", text: "Last 24 hours" },
  ];

  useEffect(() => {
    if (!subscriptionId || !resourceGroup || !name) return;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const resourceId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/applicationGateways/${name}`;
        const data = await getGatewayMetrics(resourceId, timeRange);
        setMetrics(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load metrics");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [subscriptionId, resourceGroup, name, timeRange]);

  const chartData = metrics
    ? metrics.timestamps.map((ts, i) => ({
        time: new Date(ts).toLocaleTimeString(),
        throughput: metrics.throughput[i] || 0,
        totalRequests: metrics.totalRequests[i] || 0,
        failedRequests: metrics.failedRequests[i] || 0,
        healthyHosts: metrics.healthyHostCount[i] || 0,
        unhealthyHosts: metrics.unhealthyHostCount[i] || 0,
        connections: metrics.currentConnections[i] || 0,
      }))
    : [];

  return (
    <div className="page-container">
      <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 16 }}>
        <DefaultButton iconProps={{ iconName: "Back" }} onClick={() => navigate(-1)} text="Back" />
        <Text variant="xxLarge" styles={{ root: { fontWeight: 600 } }}>
          Monitoring: {name}
        </Text>
      </Stack>

      <Stack horizontal tokens={{ childrenGap: 16 }} styles={{ root: { marginTop: 16, marginBottom: 24 } }}>
        <Dropdown
          selectedKey={timeRange}
          options={timeOptions}
          onChange={(_, opt) => opt && setTimeRange(opt.key as string)}
          styles={{ root: { width: 200 } }}
        />
      </Stack>

      {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}

      {loading ? (
        <Spinner label="Loading metrics..." />
      ) : (
        <Stack tokens={{ childrenGap: 24 }}>
          {/* Throughput */}
          <div className="card">
            <Text variant="large" styles={{ root: { fontWeight: 600, marginBottom: 16 } }}>
              Throughput (bytes/sec)
            </Text>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="throughput" stroke="#0078d4" fill="#0078d4" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Requests */}
          <div className="card">
            <Text variant="large" styles={{ root: { fontWeight: 600, marginBottom: 16 } }}>
              Requests
            </Text>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="totalRequests" stroke="#0078d4" name="Total" />
                <Line type="monotone" dataKey="failedRequests" stroke="#d13438" name="Failed" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Backend Health */}
          <div className="card">
            <Text variant="large" styles={{ root: { fontWeight: 600, marginBottom: 16 } }}>
              Backend Host Health
            </Text>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="healthyHosts" stroke="#107c10" name="Healthy" />
                <Line type="monotone" dataKey="unhealthyHosts" stroke="#d13438" name="Unhealthy" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Connections */}
          <div className="card">
            <Text variant="large" styles={{ root: { fontWeight: 600, marginBottom: 16 } }}>
              Current Connections
            </Text>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="connections" stroke="#8764b8" fill="#8764b8" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Stack>
      )}
    </div>
  );
}
