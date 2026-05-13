import React, { useState, useEffect } from "react";
import {
  Stack,
  Text,
  PrimaryButton,
  DefaultButton,
  Spinner,
  MessageBar,
  MessageBarType,
  Dialog,
  DialogFooter,
  DialogType,
  DatePicker,
  TextField,
} from "@fluentui/react";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { SubscriptionPicker } from "../components/SubscriptionPicker";
import { getAvailableUpgrades, scheduleMaintenance, cancelMaintenance } from "../services/api";

export const MaintenancePage: React.FC = () => {
  const { subscriptions, selectedSubscription, setSelectedSubscription, loading: subLoading } = useSubscriptions();
  const [upgrades, setUpgrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Schedule dialog
  const [showSchedule, setShowSchedule] = useState(false);
  const [selectedUpgrade, setSelectedUpgrade] = useState<any>(null);
  const [scheduledDate, setScheduledDate] = useState<Date>(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const [scheduledTime, setScheduledTime] = useState("02:00");
  const [estimatedDuration, setEstimatedDuration] = useState("30");
  const [blackoutStart, setBlackoutStart] = useState("00:00");
  const [blackoutEnd, setBlackoutEnd] = useState("06:00");
  const [notes, setNotes] = useState("");
  const [scheduling, setScheduling] = useState(false);

  const loadUpgrades = async () => {
    if (!selectedSubscription) return;
    setLoading(true);
    setError("");
    try {
      const data = await getAvailableUpgrades(selectedSubscription);
      setUpgrades(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load upgrades");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUpgrades();
  }, [selectedSubscription]);

  const handleSchedule = async () => {
    if (!selectedUpgrade) return;
    setScheduling(true);
    try {
      await scheduleMaintenance({
        subscriptionId: selectedUpgrade.subscriptionId,
        resourceGroup: selectedUpgrade.resourceGroup,
        gatewayName: selectedUpgrade.gatewayName,
        upgradeType: selectedUpgrade.upgradeType,
        upgradeVersion: selectedUpgrade.upgradeVersion,
        upgradeDescription: selectedUpgrade.upgradeDescription,
        scheduledAt: scheduledDate.toISOString(),
        notes,
        scheduledTime,
        estimatedDurationMinutes: parseInt(estimatedDuration) || 30,
        blackoutStart,
        blackoutEnd,
      });
      setSuccess(`Maintenance scheduled for ${selectedUpgrade.gatewayName} on ${scheduledDate.toLocaleDateString()}`);
      setShowSchedule(false);
      setNotes("");
      loadUpgrades();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule");
    } finally {
      setScheduling(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelMaintenance(id);
      setSuccess("Maintenance window cancelled");
      loadUpgrades();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
    }
  };

  const openScheduleDialog = (upgrade: any) => {
    setSelectedUpgrade(upgrade);
    setScheduledDate(new Date(upgrade.deadlineAt || Date.now() + 30 * 24 * 60 * 60 * 1000));
    setShowSchedule(true);
  };

  const totalUpgrades = upgrades.length;
  const scheduledCount = upgrades.filter((u) => u.hasWindow).length;
  const pendingCount = upgrades.filter((u) => !u.hasWindow).length;
  const criticalCount = upgrades.filter((u) => u.upgradeType?.includes("Security") || u.upgradeType?.includes("Critical")).length;

  return (
    <div className="page-container command-center">
      <div style={{ marginBottom: 24 }}>
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
          <Text variant="xxLarge" styles={{ root: { fontWeight: 700 } }}>Maintenance & Upgrades</Text>
        </Stack>
        <Text variant="medium" styles={{ root: { color: "#605e5c", marginTop: 4 } }}>
          Schedule platform upgrades and security patches with a 30-day window
        </Text>
      </div>

      <Stack horizontal tokens={{ childrenGap: 16 }} styles={{ root: { marginBottom: 20 } }}>
        <SubscriptionPicker
          subscriptions={subscriptions}
          selectedSubscription={selectedSubscription || ""}
          onChange={setSelectedSubscription}
          loading={subLoading}
        />
      </Stack>

      {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError("")} styles={{ root: { marginBottom: 16 } }}>{error}</MessageBar>}
      {success && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSuccess("")} styles={{ root: { marginBottom: 16 } }}>{success}</MessageBar>}

      {/* Stats */}
      <Stack horizontal tokens={{ childrenGap: 16 }} styles={{ root: { marginBottom: 24 } }}>
        <div className="stat-card" style={{ minWidth: 140 }}>
          <div className="stat-value">{totalUpgrades}</div>
          <div className="stat-label">Available Upgrades</div>
        </div>
        <div className="stat-card" style={{ minWidth: 140 }}>
          <div className="stat-value" style={{ color: "#107c10" }}>{scheduledCount}</div>
          <div className="stat-label">Scheduled</div>
        </div>
        <div className="stat-card" style={{ minWidth: 140 }}>
          <div className="stat-value" style={{ color: pendingCount > 0 ? "#c19c00" : "#107c10" }}>{pendingCount}</div>
          <div className="stat-label">Pending Action</div>
        </div>
        <div className="stat-card" style={{ minWidth: 140 }}>
          <div className="stat-value" style={{ color: criticalCount > 0 ? "#d13438" : "#107c10" }}>{criticalCount}</div>
          <div className="stat-label">Critical/Security</div>
        </div>
      </Stack>

      {loading ? (
        <Spinner label="Loading available upgrades..." />
      ) : upgrades.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: 30 }}>
            <h3>All gateways up to date</h3>
            <p>No upgrades available at this time</p>
          </div>
        </div>
      ) : (
        <Stack tokens={{ childrenGap: 12 }}>
          {upgrades.map((u, idx) => {
            const deadlineDate = new Date(u.deadlineAt);
            const scheduledDate = new Date(u.scheduledAt);
            const daysLeft = Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const isCritical = u.upgradeType?.includes("Security") || u.upgradeType?.includes("Critical");
            const borderColor = isCritical ? "#d13438" : u.hasWindow ? "#107c10" : "#c19c00";

            return (
              <div key={idx} style={{
                background: "white",
                border: `1px solid ${borderColor}`,
                borderLeft: `4px solid ${borderColor}`,
                borderRadius: 8,
                padding: 20,
                boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
              }}>
                <Stack horizontal verticalAlign="start" horizontalAlign="space-between">
                  <Stack tokens={{ childrenGap: 6 }} styles={{ root: { flex: 1 } }}>
                    <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
                      <Text styles={{ root: { fontWeight: 700, fontSize: 16 } }}>{u.gatewayName}</Text>
                      <span className={`status-badge ${isCritical ? "status-fail" : "status-warning"}`}>
                        {u.upgradeType}
                      </span>
                      <span className="template-component-count">{u.upgradeVersion}</span>
                      {u.hasWindow && <span className="status-badge status-pass">Scheduled</span>}
                    </Stack>
                    <Text variant="small" styles={{ root: { color: "#605e5c" } }}>
                      {u.upgradeDescription}
                    </Text>
                    <Stack horizontal tokens={{ childrenGap: 16 }} styles={{ root: { marginTop: 8 } }}>
                      <Text variant="small">
                        <strong>Detected:</strong> {new Date(u.detectedAt).toLocaleDateString()}
                      </Text>
                      <Text variant="small">
                        <strong>Scheduled:</strong>{" "}
                        <span style={{ color: u.hasWindow ? "#107c10" : "#c19c00", fontWeight: 600 }}>
                          {scheduledDate.toLocaleDateString()}{u.scheduledTime ? ` at ${u.scheduledTime}` : ""}
                        </span>
                      </Text>
                      <Text variant="small">
                        <strong>Deadline:</strong>{" "}
                        <span style={{ color: daysLeft <= 7 ? "#d13438" : daysLeft <= 14 ? "#c19c00" : "#107c10", fontWeight: 600 }}>
                          {deadlineDate.toLocaleDateString()} ({daysLeft} days left)
                        </span>
                      </Text>
                      {u.estimatedDurationMinutes && (
                        <Text variant="small">
                          <strong>Duration:</strong> ~{u.estimatedDurationMinutes} min
                        </Text>
                      )}
                      {u.blackoutStart && u.blackoutEnd && (
                        <Text variant="small">
                          <strong>Blackout:</strong>{" "}
                          <span style={{ color: "#8764b8", fontWeight: 600 }}>{u.blackoutStart} — {u.blackoutEnd}</span>
                        </Text>
                      )}
                    </Stack>
                    {!u.hasWindow && (
                      <Text variant="small" styles={{ root: { color: "#c19c00", marginTop: 4 } }}>
                        ⚠️ Auto-applies on day 30 if not scheduled
                      </Text>
                    )}
                  </Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }}>
                    <PrimaryButton
                      text={u.hasWindow ? "Reschedule" : "Schedule"}
                      iconProps={{ iconName: "Calendar" }}
                      onClick={() => openScheduleDialog(u)}
                      styles={{ root: { borderRadius: 6 } }}
                    />
                    {u.hasWindow && (
                      <DefaultButton
                        text="Cancel"
                        styles={{ root: { borderRadius: 6, color: "#d13438", borderColor: "#d13438" } }}
                        onClick={() => handleCancel(u.id)}
                      />
                    )}
                  </Stack>
                </Stack>
              </div>
            );
          })}
        </Stack>
      )}

      {/* Schedule Dialog */}
      <Dialog hidden={!showSchedule} onDismiss={() => setShowSchedule(false)}
        dialogContentProps={{
          type: DialogType.normal,
          title: "Schedule Maintenance",
          subText: selectedUpgrade ? `${selectedUpgrade.gatewayName} — ${selectedUpgrade.upgradeVersion}` : "",
        }}
        modalProps={{ isBlocking: false }}
      >
        <Stack tokens={{ childrenGap: 12 }}>
          <Text variant="small" styles={{ root: { color: "#605e5c" } }}>
            Select a date within the 30-day maintenance window. If not scheduled, the upgrade will auto-apply on day 30.
          </Text>
          <DatePicker
            label="Maintenance Date"
            value={scheduledDate}
            onSelectDate={(d) => d && setScheduledDate(d)}
            minDate={new Date()}
            maxDate={selectedUpgrade ? new Date(selectedUpgrade.deadlineAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)}
            isRequired
          />
          <Stack horizontal tokens={{ childrenGap: 12 }}>
            <TextField
              label="Start Time"
              value={scheduledTime}
              onChange={(_, v) => setScheduledTime(v || "02:00")}
              placeholder="02:00"
              styles={{ root: { width: 100 } }}
              description="24h format"
            />
            <TextField
              label="Est. Duration (min)"
              type="number"
              value={estimatedDuration}
              onChange={(_, v) => setEstimatedDuration(v || "30")}
              styles={{ root: { width: 130 } }}
            />
          </Stack>
          <Stack horizontal tokens={{ childrenGap: 12 }}>
            <TextField
              label="Blackout Start"
              value={blackoutStart}
              onChange={(_, v) => setBlackoutStart(v || "00:00")}
              placeholder="00:00"
              styles={{ root: { width: 100 } }}
              description="No changes before"
            />
            <TextField
              label="Blackout End"
              value={blackoutEnd}
              onChange={(_, v) => setBlackoutEnd(v || "06:00")}
              placeholder="06:00"
              styles={{ root: { width: 100 } }}
              description="No changes after"
            />
          </Stack>
          <TextField
            label="Notes (optional)"
            value={notes}
            onChange={(_, v) => setNotes(v || "")}
            multiline
            rows={3}
            placeholder="e.g., Schedule during maintenance window, notify stakeholders..."
          />
        </Stack>
        <DialogFooter>
          <PrimaryButton text={scheduling ? "Scheduling..." : "Schedule"} disabled={scheduling} onClick={handleSchedule} />
          <DefaultButton text="Cancel" onClick={() => setShowSchedule(false)} />
        </DialogFooter>
      </Dialog>
    </div>
  );
};
