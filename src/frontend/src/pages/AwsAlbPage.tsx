import React, { useState, useEffect } from "react";
import {
  Stack,
  Text,
  Spinner,
  MessageBar,
  MessageBarType,
  Panel,
  PanelType,
  Pivot,
  PivotItem,
  DefaultButton,
} from "@fluentui/react";
import { getAwsStatus, getAwsAlbs, getAwsAlbDetails } from "../services/api";

export const AwsAlbPage: React.FC = () => {
  const [albs, setAlbs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [regions, setRegions] = useState<string[]>([]);

  const [selectedAlb, setSelectedAlb] = useState<any>(null);
  const [albDetail, setAlbDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const status = await getAwsStatus();
      setConfigured(status.configured);
      setRegions(status.regions);
      if (status.configured) {
        loadAlbs();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check AWS status");
    }
  };

  const loadAlbs = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAwsAlbs();
      setAlbs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ALBs");
    } finally {
      setLoading(false);
    }
  };

  const handleAlbClick = async (alb: any) => {
    setSelectedAlb(alb);
    setDetailLoading(true);
    setAlbDetail(null);
    try {
      const detail = await getAwsAlbDetails(alb.region, alb.arn);
      setAlbDetail(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load details");
    } finally {
      setDetailLoading(false);
    }
  };

  // Group ALBs by region for display
  const albsByRegion = new Map<string, any[]>();
  for (const alb of albs) {
    const list = albsByRegion.get(alb.region) || [];
    list.push(alb);
    albsByRegion.set(alb.region, list);
  }

  return (
    <div className="page-container command-center">
      <div style={{ marginBottom: 24 }}>
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
          <Text variant="xxLarge" styles={{ root: { fontWeight: 700 } }}>AWS Application Load Balancers</Text>
          <span style={{
            padding: "4px 10px", background: "#ff9900", color: "white",
            borderRadius: 12, fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
          }}>AWS</span>
        </Stack>
        <Text variant="medium" styles={{ root: { color: "#605e5c", marginTop: 4 } }}>
          Read-only view of AWS ALBs across all regions — extends multi-cloud visibility
        </Text>
      </div>

      {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError("")} styles={{ root: { marginBottom: 16 } }}>{error}</MessageBar>}

      {configured === false ? (
        <div className="card">
          <Stack tokens={{ childrenGap: 12 }} horizontalAlign="center" styles={{ root: { padding: 40 } }}>
            <span style={{ fontSize: 48 }}>☁️</span>
            <Text variant="xLarge" styles={{ root: { fontWeight: 700 } }}>AWS Not Configured</Text>
            <Text styles={{ root: { color: "#605e5c", textAlign: "center", maxWidth: 500 } }}>
              To enable AWS ALB visibility, set these environment variables on the container:
            </Text>
            <div style={{ background: "#1a1a2e", color: "#e0e0e0", padding: 16, borderRadius: 6, fontFamily: "monospace", fontSize: 13 }}>
              AWS_ACCESS_KEY_ID=...<br/>
              AWS_SECRET_ACCESS_KEY=...<br/>
              AWS_REGIONS=us-east-1,us-west-2 (optional)
            </div>
            <Text variant="small" styles={{ root: { color: "#605e5c" } }}>
              The IAM user needs <code>elasticloadbalancing:Describe*</code> permissions.
            </Text>
          </Stack>
        </div>
      ) : configured === null ? (
        <Spinner label="Checking AWS configuration..." />
      ) : (
        <>
          {/* Stats */}
          <Stack horizontal tokens={{ childrenGap: 16 }} styles={{ root: { marginBottom: 24 } }}>
            <div className="stat-card" style={{ minWidth: 140 }}>
              <div className="stat-value">{albs.length}</div>
              <div className="stat-label">Total ALBs</div>
            </div>
            <div className="stat-card" style={{ minWidth: 140 }}>
              <div className="stat-value" style={{ color: "#107c10" }}>{albs.filter((a) => a.state === "active").length}</div>
              <div className="stat-label">Active</div>
            </div>
            <div className="stat-card" style={{ minWidth: 140 }}>
              <div className="stat-value" style={{ color: "#0078d4" }}>{albsByRegion.size}</div>
              <div className="stat-label">Regions</div>
            </div>
            <div className="stat-card" style={{ minWidth: 140 }}>
              <div className="stat-value">{albs.filter((a) => a.scheme === "internet-facing").length}</div>
              <div className="stat-label">Internet-Facing</div>
            </div>
          </Stack>

          <Stack horizontal tokens={{ childrenGap: 8 }} styles={{ root: { marginBottom: 16 } }}>
            <DefaultButton
              text="Refresh"
              iconProps={{ iconName: "Refresh" }}
              onClick={loadAlbs}
              styles={{ root: { borderRadius: 6 } }}
              disabled={loading}
            />
            <Text variant="small" styles={{ root: { color: "#a19f9d", alignSelf: "center" } }}>
              Scanning {regions.length} regions
            </Text>
          </Stack>

          {loading ? (
            <Spinner label="Loading ALBs across all regions..." />
          ) : albs.length === 0 ? (
            <div className="card">
              <div className="empty-state" style={{ padding: 30 }}>
                <h3>No ALBs found</h3>
                <p>No Application Load Balancers found in the configured regions</p>
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ background: "#f3f2f1" }}>
                  <tr>
                    <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 12, color: "#605e5c", fontWeight: 600 }}>Name</th>
                    <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 12, color: "#605e5c", fontWeight: 600 }}>Region</th>
                    <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 12, color: "#605e5c", fontWeight: 600 }}>Scheme</th>
                    <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 12, color: "#605e5c", fontWeight: 600 }}>State</th>
                    <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 12, color: "#605e5c", fontWeight: 600 }}>VPC</th>
                    <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 12, color: "#605e5c", fontWeight: 600 }}>AZs</th>
                    <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 12, color: "#605e5c", fontWeight: 600 }}>DNS Name</th>
                  </tr>
                </thead>
                <tbody>
                  {albs.map((alb) => (
                    <tr key={alb.arn}
                      style={{ borderBottom: "1px solid #f3f2f1", cursor: "pointer", transition: "background 0.1s" }}
                      onClick={() => handleAlbClick(alb)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#fff8e1")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
                    >
                      <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0078d4" }}>{alb.name}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span className="template-component-count" style={{ background: "#fff3e0", color: "#ff9900" }}>{alb.region}</span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span className={`status-badge ${alb.scheme === "internet-facing" ? "status-warning" : "status-pass"}`}>
                          {alb.scheme}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span className={`status-badge ${alb.state === "active" ? "status-running" : "status-warning"}`}>
                          {alb.state}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#605e5c", fontFamily: "monospace" }}>{alb.vpcId}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12 }}>{alb.availabilityZones.length}</td>
                      <td style={{ padding: "12px 16px", fontSize: 11, color: "#605e5c", fontFamily: "monospace", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {alb.dnsName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ALB Detail Panel */}
      <Panel
        isOpen={!!selectedAlb}
        onDismiss={() => { setSelectedAlb(null); setAlbDetail(null); }}
        headerText={`ALB: ${selectedAlb?.name}`}
        type={PanelType.large}
      >
        {detailLoading ? (
          <Spinner label="Loading ALB details..." styles={{ root: { marginTop: 20 } }} />
        ) : albDetail ? (
          <Stack tokens={{ childrenGap: 16 }} styles={{ root: { marginTop: 16 } }}>
            <Pivot>
              <PivotItem headerText="Overview">
                <Stack tokens={{ childrenGap: 8 }} styles={{ root: { marginTop: 12 } }}>
                  <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 160 } }}>Name:</Text><Text>{albDetail.name}</Text></Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 160 } }}>Region:</Text><Text>{albDetail.region}</Text></Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 160 } }}>Scheme:</Text><Text>{albDetail.scheme}</Text></Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 160 } }}>State:</Text><span className={`status-badge ${albDetail.state === "active" ? "status-pass" : "status-warning"}`}>{albDetail.state}</span></Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 160 } }}>VPC:</Text><Text>{albDetail.vpcId}</Text></Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 160 } }}>Created:</Text><Text>{new Date(albDetail.createdTime).toLocaleString()}</Text></Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 160 } }}>DNS Name:</Text><Text variant="small" styles={{ root: { fontFamily: "monospace" } }}>{albDetail.dnsName}</Text></Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 160 } }}>Availability Zones:</Text><Text>{albDetail.availabilityZones.join(", ")}</Text></Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}><Text styles={{ root: { fontWeight: 600, minWidth: 160 } }}>Security Groups:</Text><Text variant="small" styles={{ root: { fontFamily: "monospace" } }}>{(albDetail.securityGroups || []).join(", ") || "None"}</Text></Stack>
                </Stack>
              </PivotItem>

              <PivotItem headerText={`Listeners (${(albDetail.listeners || []).length})`}>
                <Stack tokens={{ childrenGap: 12 }} styles={{ root: { marginTop: 12 } }}>
                  {(albDetail.listeners || []).map((l: any, i: number) => (
                    <div key={i} className="card" style={{ margin: 0, borderLeft: `4px solid ${l.protocol === "HTTPS" ? "#107c10" : "#0078d4"}` }}>
                      <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
                        <span className={`status-badge ${l.protocol === "HTTPS" ? "status-pass" : "status-warning"}`}>{l.protocol}</span>
                        <Text styles={{ root: { fontWeight: 700, fontSize: 16 } }}>Port {l.port}</Text>
                        <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{l.rulesCount} rule(s)</Text>
                      </Stack>
                      {l.sslPolicy && (
                        <Text variant="small" styles={{ root: { color: "#605e5c", marginTop: 4, display: "block" } }}>
                          SSL Policy: {l.sslPolicy}
                        </Text>
                      )}
                      {(l.certificates || []).length > 0 && (
                        <Text variant="small" styles={{ root: { color: "#605e5c", marginTop: 4, display: "block", fontFamily: "monospace" } }}>
                          Cert: {l.certificates[0].split("/").pop()}
                        </Text>
                      )}
                    </div>
                  ))}
                </Stack>
              </PivotItem>

              <PivotItem headerText={`Target Groups (${(albDetail.targetGroups || []).length})`}>
                <Stack tokens={{ childrenGap: 12 }} styles={{ root: { marginTop: 12 } }}>
                  {(albDetail.targetGroups || []).map((tg: any, i: number) => {
                    const healthyCount = (tg.targets || []).filter((t: any) => t.health === "healthy").length;
                    const unhealthyCount = (tg.targets || []).filter((t: any) => t.health === "unhealthy").length;
                    return (
                      <div key={i} className="card" style={{ margin: 0, borderLeft: `4px solid ${unhealthyCount > 0 ? "#d13438" : "#107c10"}` }}>
                        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
                          <Text styles={{ root: { fontWeight: 700, fontSize: 14 } }}>{tg.name}</Text>
                          <span className="template-component-count">{tg.protocol}:{tg.port}</span>
                          <span className="template-component-count">{tg.targetType}</span>
                          <Text variant="small" styles={{ root: { color: "#107c10", fontWeight: 600 } }}>{healthyCount} healthy</Text>
                          {unhealthyCount > 0 && (
                            <Text variant="small" styles={{ root: { color: "#d13438", fontWeight: 600 } }}>{unhealthyCount} unhealthy</Text>
                          )}
                        </Stack>
                        <Text variant="small" styles={{ root: { color: "#605e5c", marginTop: 4, display: "block" } }}>
                          Health Check: {tg.healthCheckProtocol} {tg.healthCheckPath} every {tg.healthCheckInterval}s
                        </Text>
                        <Stack tokens={{ childrenGap: 4 }} styles={{ root: { marginTop: 8 } }}>
                          {(tg.targets || []).map((t: any, ti: number) => (
                            <Stack key={ti} horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                              <span className={`health-dot ${t.health === "healthy" ? "healthy" : "unhealthy"}`} />
                              <Text variant="small" styles={{ root: { fontFamily: "monospace" } }}>{t.id}:{t.port}</Text>
                              <span className={`status-badge ${t.health === "healthy" ? "status-pass" : "status-fail"}`} style={{ fontSize: 10 }}>
                                {t.health}
                              </span>
                              {t.reason && <Text variant="small" styles={{ root: { color: "#605e5c" } }}>{t.reason}</Text>}
                            </Stack>
                          ))}
                        </Stack>
                      </div>
                    );
                  })}
                </Stack>
              </PivotItem>
            </Pivot>
          </Stack>
        ) : null}
      </Panel>
    </div>
  );
};
