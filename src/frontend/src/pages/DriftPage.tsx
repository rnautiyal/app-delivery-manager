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
  Dropdown,
  IDropdownOption,
  Pivot,
  PivotItem,
} from "@fluentui/react";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { SubscriptionPicker } from "../components/SubscriptionPicker";
import {
  getBaselines,
  saveBaseline,
  deleteBaseline,
  checkDrift,
  getGateways,
} from "../services/api";
import { BaselineSnapshot, DriftReport, DriftChange, GatewayListItem } from "../types";

export const DriftPage: React.FC = () => {
  const { subscriptions, selectedSubscription, setSelectedSubscription, loading: subLoading } = useSubscriptions();
  const [baselines, setBaselines] = useState<BaselineSnapshot[]>([]);
  const [gateways, setGateways] = useState<GatewayListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Drift report
  const [driftReport, setDriftReport] = useState<DriftReport | null>(null);
  const [checkingDrift, setCheckingDrift] = useState(false);

  // Save baseline dialog
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveGateway, setSaveGateway] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteId, setDeleteId] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [b, g] = await Promise.all([
        getBaselines(selectedSubscription || undefined),
        selectedSubscription ? getGateways(selectedSubscription) : Promise.resolve([]),
      ]);
      setBaselines(b);
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

  const handleSaveBaseline = async () => {
    if (!saveGateway || !selectedSubscription) return;
    const gw = gateways.find((g) => g.name === saveGateway);
    if (!gw) return;

    setSaving(true);
    setError("");
    try {
      await saveBaseline({
        subscriptionId: selectedSubscription,
        resourceGroup: gw.resourceGroup,
        gatewayName: gw.name,
      });
      setSuccess(`Baseline snapshot saved for "${gw.name}"`);
      setShowSaveDialog(false);
      setSaveGateway("");
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save baseline");
    } finally {
      setSaving(false);
    }
  };

  const handleCheckDrift = async (baselineId: string) => {
    setCheckingDrift(true);
    setError("");
    setDriftReport(null);
    try {
      const report = await checkDrift(baselineId);
      setDriftReport(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check drift");
    } finally {
      setCheckingDrift(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteBaseline(deleteId);
      setSuccess("Baseline deleted");
      setShowDeleteDialog(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete baseline");
    }
  };

  const gatewayOptions: IDropdownOption[] = gateways.map((g) => ({
    key: g.name,
    text: `${g.name} (${g.resourceGroup})`,
  }));

  const trackedGateways = new Set(baselines.map((b) => b.gatewayName)).size;
  const driftedCount = 0; // Updated after checks

  const baselineColumns: IColumn[] = [
    {
      key: "gateway",
      name: "Gateway",
      minWidth: 160,
      maxWidth: 220,
      onRender: (item: BaselineSnapshot) => (
        <Text styles={{ root: { fontWeight: 600 } }}>{item.gatewayName}</Text>
      ),
    },
    { key: "rg", name: "Resource Group", fieldName: "resourceGroup", minWidth: 140, maxWidth: 200 },
    {
      key: "createdAt",
      name: "Snapshot Date",
      minWidth: 160,
      maxWidth: 200,
      onRender: (item: BaselineSnapshot) => (
        <Text variant="small">
          {new Date(item.createdAt).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
          })}
        </Text>
      ),
    },
    { key: "createdBy", name: "Created By", fieldName: "createdBy", minWidth: 120, maxWidth: 160 },
    {
      key: "actions",
      name: "Actions",
      minWidth: 200,
      onRender: (item: BaselineSnapshot) => (
        <Stack horizontal tokens={{ childrenGap: 8 }}>
          <PrimaryButton
            text="Check Drift"
            styles={{ root: { borderRadius: 6, minWidth: 0, padding: "0 12px" } }}
            onClick={() => handleCheckDrift(item.id)}
          />
          <DefaultButton
            text="Delete"
            styles={{ root: { borderRadius: 6, minWidth: 0, padding: "0 12px", color: "#d13438", borderColor: "#d13438" } }}
            onClick={() => { setDeleteId(item.id); setShowDeleteDialog(true); }}
          />
        </Stack>
      ),
    },
  ];

  const renderDriftIcon = (changeType: string) => {
    switch (changeType) {
      case "added": return <div className="drift-icon-added">+</div>;
      case "removed": return <div className="drift-icon-removed">-</div>;
      case "modified": return <div className="drift-icon-modified">~</div>;
      default: return null;
    }
  };

  const renderDriftReport = () => {
    if (!driftReport) return null;

    return (
      <div className="card" style={{ marginTop: 16 }}>
        <Stack tokens={{ childrenGap: 12 }}>
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
            <Text variant="large" styles={{ root: { fontWeight: 700 } }}>
              Drift Report: {driftReport.gatewayName}
            </Text>
            <Text variant="small" styles={{ root: { color: "#605e5c" } }}>
              Baseline: {new Date(driftReport.baselineDate).toLocaleString()} | Checked: {new Date(driftReport.checkedAt).toLocaleString()}
            </Text>
          </Stack>

          {!driftReport.hasDrift ? (
            <MessageBar messageBarType={MessageBarType.success}>
              No drift detected. Configuration matches the baseline.
            </MessageBar>
          ) : (
            <>
              <div className="drift-summary-bar">
                <span className="drift-summary-count">
                  {driftReport.totalChanges} change{driftReport.totalChanges !== 1 ? "s" : ""} detected
                </span>
                <span className="drift-summary-count" style={{ color: "#107c10" }}>
                  +{driftReport.additions} added
                </span>
                <span className="drift-summary-count" style={{ color: "#d13438" }}>
                  -{driftReport.removals} removed
                </span>
                <span className="drift-summary-count" style={{ color: "#c19c00" }}>
                  ~{driftReport.modifications} modified
                </span>
              </div>

              <div style={{ border: "1px solid #edebe9", borderRadius: 4 }}>
                {driftReport.changes.map((change: DriftChange, idx: number) => (
                  <div key={idx} className="drift-change-item">
                    {renderDriftIcon(change.changeType)}
                    <div style={{ flex: 1 }}>
                      <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                        <span className="drift-component-badge">{change.component}</span>
                        <Text styles={{ root: { fontWeight: 600 } }}>{change.name}</Text>
                      </Stack>
                      {change.details && (
                        <Text variant="small" styles={{ root: { color: "#605e5c", marginTop: 4, display: "block" } }}>
                          {change.details}
                        </Text>
                      )}
                      {change.changeType === "modified" && change.baselineValue && change.currentValue && (
                        <div className="drift-value-compare" style={{ marginTop: 8 }}>
                          <div className="drift-value-baseline">
                            <Text variant="small" styles={{ root: { fontWeight: 600 } }}>Baseline:</Text>{" "}
                            {JSON.stringify(change.baselineValue, null, 1)}
                          </div>
                          <Text styles={{ root: { alignSelf: "center", color: "#605e5c" } }}>&rarr;</Text>
                          <div className="drift-value-current">
                            <Text variant="small" styles={{ root: { fontWeight: 600 } }}>Current:</Text>{" "}
                            {JSON.stringify(change.currentValue, null, 1)}
                          </div>
                        </div>
                      )}
                      {change.changeType === "added" && change.currentValue && (
                        <div style={{ marginTop: 4 }}>
                          <Text variant="small" styles={{ root: { color: "#107c10" } }}>
                            {JSON.stringify(change.currentValue)}
                          </Text>
                        </div>
                      )}
                      {change.changeType === "removed" && change.baselineValue && (
                        <div style={{ marginTop: 4 }}>
                          <Text variant="small" styles={{ root: { color: "#d13438", textDecoration: "line-through" } }}>
                            {JSON.stringify(change.baselineValue)}
                          </Text>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Stack>
      </div>
    );
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
          <Text variant="xxLarge" styles={{ root: { fontWeight: 700 } }}>
            Configuration Drift
          </Text>
        </Stack>
        <Text variant="medium" styles={{ root: { color: "#605e5c", marginTop: 4 } }}>
          Track and detect configuration changes against saved baselines
        </Text>
      </div>

      <Stack horizontal tokens={{ childrenGap: 16 }} styles={{ root: { marginBottom: 20 } }}>
        <SubscriptionPicker
          subscriptions={subscriptions}
          selectedSubscription={selectedSubscription}
          onChange={setSelectedSubscription}
          loading={subLoading}
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

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{baselines.length}</div>
          <div className="stat-label">Total Baselines</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "#0078d4" }}>{trackedGateways}</div>
          <div className="stat-label">Gateways Tracked</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 20, color: "#605e5c" }}>
            {baselines.length > 0
              ? new Date(baselines[0].createdAt).toLocaleDateString()
              : "—"}
          </div>
          <div className="stat-label">Latest Snapshot</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: driftReport?.hasDrift ? "#d13438" : "#107c10" }}>
            {driftReport ? (driftReport.hasDrift ? driftReport.totalChanges : 0) : "—"}
          </div>
          <div className="stat-label">Drift Changes</div>
        </div>
      </div>

      {loading ? (
        <Spinner label="Loading baselines..." />
      ) : (
        <Pivot styles={{ root: { marginBottom: 16 } }}>
          <PivotItem headerText="Baselines" itemIcon="Database">
            <div className="card" style={{ marginTop: 16 }}>
              <Stack horizontal horizontalAlign="end" styles={{ root: { marginBottom: 12 } }}>
                <PrimaryButton
                  text="Save New Baseline"
                  iconProps={{ iconName: "Camera" }}
                  styles={{ root: { borderRadius: 6 } }}
                  onClick={() => setShowSaveDialog(true)}
                />
              </Stack>
              {baselines.length === 0 ? (
                <div className="empty-state">
                  <h3>No baselines saved</h3>
                  <p>Save a baseline snapshot to start tracking configuration drift</p>
                </div>
              ) : (
                <DetailsList
                  items={baselines}
                  columns={baselineColumns}
                  layoutMode={DetailsListLayoutMode.justified}
                  selectionMode={SelectionMode.none}
                />
              )}
            </div>
          </PivotItem>

          <PivotItem headerText="Drift Report" itemIcon="BranchCompare">
            <div style={{ marginTop: 16 }}>
              {checkingDrift ? (
                <Spinner label="Comparing configurations..." />
              ) : driftReport ? (
                renderDriftReport()
              ) : (
                <div className="card">
                  <div className="empty-state">
                    <h3>No drift check performed</h3>
                    <p>Click "Check Drift" on a baseline to compare against the live configuration</p>
                  </div>
                </div>
              )}
            </div>
          </PivotItem>
        </Pivot>
      )}

      {/* Save Baseline Dialog */}
      <Dialog
        hidden={!showSaveDialog}
        onDismiss={() => setShowSaveDialog(false)}
        dialogContentProps={{
          type: DialogType.normal,
          title: "Save Baseline Snapshot",
          subText: "Capture the current configuration of a gateway as a baseline for drift detection.",
        }}
      >
        <Dropdown
          label="Gateway"
          placeholder="Select a gateway"
          options={gatewayOptions}
          selectedKey={saveGateway}
          onChange={(_, opt) => setSaveGateway(opt?.key as string || "")}
          required
        />
        <DialogFooter>
          <PrimaryButton text={saving ? "Saving..." : "Save Baseline"} disabled={!saveGateway || saving} onClick={handleSaveBaseline} />
          <DefaultButton text="Cancel" onClick={() => setShowSaveDialog(false)} />
        </DialogFooter>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        hidden={!showDeleteDialog}
        onDismiss={() => setShowDeleteDialog(false)}
        dialogContentProps={{
          type: DialogType.normal,
          title: "Delete Baseline",
          subText: "Are you sure you want to delete this baseline? This cannot be undone.",
        }}
      >
        <DialogFooter>
          <PrimaryButton text="Delete" onClick={handleDelete} styles={{ root: { background: "#d13438", borderColor: "#d13438" } }} />
          <DefaultButton text="Cancel" onClick={() => setShowDeleteDialog(false)} />
        </DialogFooter>
      </Dialog>
    </div>
  );
};
