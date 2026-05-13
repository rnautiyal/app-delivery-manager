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
  TextField,
  Toggle,
  Dropdown,
  IDropdownOption,
} from "@fluentui/react";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { SubscriptionPicker } from "../components/SubscriptionPicker";
import {
  getAutoscaleSchedules,
  createAutoscaleSchedule,
  toggleAutoscaleSchedule,
  deleteAutoscaleSchedule,
  getGateways,
} from "../services/api";
import { GatewayListItem } from "../types";

const dayOptions: IDropdownOption[] = [
  { key: "Mon", text: "Monday" },
  { key: "Tue", text: "Tuesday" },
  { key: "Wed", text: "Wednesday" },
  { key: "Thu", text: "Thursday" },
  { key: "Fri", text: "Friday" },
  { key: "Sat", text: "Saturday" },
  { key: "Sun", text: "Sunday" },
];

export const AutoscalePage: React.FC = () => {
  const { subscriptions, selectedSubscription, setSelectedSubscription, loading: subLoading } = useSubscriptions();
  const [schedules, setSchedules] = useState<any[]>([]);
  const [gateways, setGateways] = useState<GatewayListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("Business Hours Scale-Up");
  const [selectedGateways, setSelectedGateways] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("09:00");
  const [startMin, setStartMin] = useState(4);
  const [startMax, setStartMax] = useState(10);
  const [endTime, setEndTime] = useState("18:00");
  const [endMin, setEndMin] = useState(2);
  const [endMax, setEndMax] = useState(4);
  const [selectedDays, setSelectedDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [creating, setCreating] = useState(false);

  const loadData = async () => {
    if (!selectedSubscription) return;
    setLoading(true);
    try {
      const [s, g] = await Promise.all([
        getAutoscaleSchedules(selectedSubscription),
        getGateways(selectedSubscription),
      ]);
      setSchedules(s);
      setGateways(g);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedSubscription]);

  const handleCreate = async () => {
    if (!name || selectedGateways.length === 0) return;
    setCreating(true);
    try {
      await createAutoscaleSchedule({
        name,
        subscriptionId: selectedSubscription,
        gatewayNames: selectedGateways,
        startTime,
        startMinInstances: startMin,
        startMaxInstances: startMax,
        endTime,
        endMinInstances: endMin,
        endMaxInstances: endMax,
        daysOfWeek: selectedDays,
        enabled: true,
      });
      setSuccess(`Schedule "${name}" created for ${selectedGateways.length} gateway(s)`);
      setShowCreate(false);
      setName("Business Hours Scale-Up");
      setSelectedGateways([]);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await toggleAutoscaleSchedule(id, enabled);
      loadData();
    } catch {}
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAutoscaleSchedule(id);
      setSuccess("Schedule deleted");
      loadData();
    } catch {}
  };

  const gatewayOptions: IDropdownOption[] = gateways
    .filter((g) => g.operationalState === "Running")
    .map((g) => ({ key: g.name, text: `${g.name} (${g.location})` }));

  return (
    <div className="page-container command-center">
      <div style={{ marginBottom: 24 }}>
        <Text variant="xxLarge" styles={{ root: { fontWeight: 700 } }}>Scheduled Autoscaling</Text>
        <Text variant="medium" styles={{ root: { color: "#605e5c", marginTop: 4 } }}>
          Schedule instance count changes by time of day. Apply to multiple gateways at once.
        </Text>
      </div>

      <Stack horizontal tokens={{ childrenGap: 16 }} verticalAlign="end" styles={{ root: { marginBottom: 20 } }}>
        <SubscriptionPicker
          subscriptions={subscriptions}
          selectedSubscription={selectedSubscription || ""}
          onChange={setSelectedSubscription}
          loading={subLoading}
        />
        <PrimaryButton
          text="New Schedule"
          iconProps={{ iconName: "Add" }}
          onClick={() => setShowCreate(true)}
          styles={{ root: { borderRadius: 6 } }}
        />
      </Stack>

      {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError("")} styles={{ root: { marginBottom: 16 } }}>{error}</MessageBar>}
      {success && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSuccess("")} styles={{ root: { marginBottom: 16 } }}>{success}</MessageBar>}

      {/* Stats */}
      <Stack horizontal tokens={{ childrenGap: 16 }} styles={{ root: { marginBottom: 24 } }}>
        <div className="stat-card" style={{ minWidth: 140 }}>
          <div className="stat-value">{schedules.length}</div>
          <div className="stat-label">Total Schedules</div>
        </div>
        <div className="stat-card" style={{ minWidth: 140 }}>
          <div className="stat-value" style={{ color: "#107c10" }}>{schedules.filter((s) => s.enabled).length}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-card" style={{ minWidth: 140 }}>
          <div className="stat-value" style={{ color: "#0078d4" }}>
            {new Set(schedules.flatMap((s) => s.gatewayNames || [])).size}
          </div>
          <div className="stat-label">Gateways Covered</div>
        </div>
      </Stack>

      {loading ? (
        <Spinner label="Loading schedules..." />
      ) : schedules.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: 30 }}>
            <h3>No autoscale schedules configured</h3>
            <p>Create a schedule to scale gateways up during peak hours and down at night</p>
            <PrimaryButton text="Create First Schedule" onClick={() => setShowCreate(true)}
              styles={{ root: { borderRadius: 6, marginTop: 8 } }} />
          </div>
        </div>
      ) : (
        <Stack tokens={{ childrenGap: 12 }}>
          {schedules.map((s) => (
            <div key={s.id} style={{
              background: "white",
              border: "1px solid #edebe9",
              borderLeft: `4px solid ${s.enabled ? "#107c10" : "#a19f9d"}`,
              borderRadius: 8,
              padding: 20,
              boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
            }}>
              <Stack horizontal verticalAlign="start" horizontalAlign="space-between">
                <Stack tokens={{ childrenGap: 8 }} styles={{ root: { flex: 1 } }}>
                  <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
                    <Text styles={{ root: { fontWeight: 700, fontSize: 16 } }}>{s.name}</Text>
                    <Toggle checked={s.enabled} onChange={(_, c) => handleToggle(s.id, c || false)}
                      styles={{ root: { margin: 0 } }} />
                    <Text variant="small" styles={{ root: { color: "#605e5c" } }}>
                      {s.daysOfWeek?.join(", ")}
                    </Text>
                  </Stack>

                  <Stack horizontal tokens={{ childrenGap: 24 }} styles={{ root: { marginTop: 8 } }}>
                    <div style={{ padding: 12, background: "#dff6dd", borderRadius: 6, minWidth: 200 }}>
                      <Text variant="small" styles={{ root: { fontWeight: 600, color: "#107c10" } }}>SCALE UP @ {s.startTime}</Text>
                      <Text variant="medium" styles={{ root: { fontWeight: 600, display: "block", marginTop: 4 } }}>
                        Min: {s.startMinInstances} | Max: {s.startMaxInstances}
                      </Text>
                    </div>
                    <div style={{ padding: 12, background: "#fff4ce", borderRadius: 6, minWidth: 200 }}>
                      <Text variant="small" styles={{ root: { fontWeight: 600, color: "#c19c00" } }}>SCALE DOWN @ {s.endTime}</Text>
                      <Text variant="medium" styles={{ root: { fontWeight: 600, display: "block", marginTop: 4 } }}>
                        Min: {s.endMinInstances} | Max: {s.endMaxInstances}
                      </Text>
                    </div>
                  </Stack>

                  <Stack horizontal wrap tokens={{ childrenGap: 6 }} styles={{ root: { marginTop: 8 } }}>
                    <Text variant="small" styles={{ root: { color: "#605e5c", marginRight: 6 } }}>
                      Gateways ({s.gatewayNames?.length || 0}):
                    </Text>
                    {(s.gatewayNames || []).map((gn: string) => (
                      <span key={gn} className="template-component-count">{gn}</span>
                    ))}
                  </Stack>
                </Stack>
                <DefaultButton
                  text="Delete"
                  styles={{ root: { borderRadius: 6, color: "#d13438", borderColor: "#d13438" } }}
                  onClick={() => handleDelete(s.id)}
                />
              </Stack>
            </div>
          ))}
        </Stack>
      )}

      {/* Create Dialog */}
      <Dialog hidden={!showCreate} onDismiss={() => setShowCreate(false)}
        dialogContentProps={{ type: DialogType.normal, title: "Create Autoscale Schedule" }}
        modalProps={{ isBlocking: false }}
        minWidth={500}
      >
        <Stack tokens={{ childrenGap: 12 }}>
          <TextField label="Schedule Name" value={name} onChange={(_, v) => setName(v || "")} required />
          <Dropdown
            label="Apply to Gateways (multi-select)"
            multiSelect
            options={gatewayOptions}
            selectedKeys={selectedGateways}
            onChange={(_, opt) => {
              if (opt) {
                setSelectedGateways((prev) =>
                  opt.selected ? [...prev, opt.key as string] : prev.filter((k) => k !== opt.key)
                );
              }
            }}
            required
          />
          <Dropdown
            label="Days of Week"
            multiSelect
            options={dayOptions}
            selectedKeys={selectedDays}
            onChange={(_, opt) => {
              if (opt) {
                setSelectedDays((prev) =>
                  opt.selected ? [...prev, opt.key as string] : prev.filter((k) => k !== opt.key)
                );
              }
            }}
          />

          <Text styles={{ root: { fontWeight: 700, marginTop: 8 } }}>Scale Up (Start of Day)</Text>
          <Stack horizontal tokens={{ childrenGap: 8 }}>
            <TextField label="Start Time" type="time" value={startTime} onChange={(_, v) => setStartTime(v || "09:00")} styles={{ root: { width: 140 } }} />
            <TextField label="Min Instances" type="number" value={String(startMin)} onChange={(_, v) => setStartMin(parseInt(v || "1"))} styles={{ root: { width: 120 } }} />
            <TextField label="Max Instances" type="number" value={String(startMax)} onChange={(_, v) => setStartMax(parseInt(v || "10"))} styles={{ root: { width: 120 } }} />
          </Stack>

          <Text styles={{ root: { fontWeight: 700, marginTop: 8 } }}>Scale Down (End of Day)</Text>
          <Stack horizontal tokens={{ childrenGap: 8 }}>
            <TextField label="End Time" type="time" value={endTime} onChange={(_, v) => setEndTime(v || "18:00")} styles={{ root: { width: 140 } }} />
            <TextField label="Min Instances" type="number" value={String(endMin)} onChange={(_, v) => setEndMin(parseInt(v || "1"))} styles={{ root: { width: 120 } }} />
            <TextField label="Max Instances" type="number" value={String(endMax)} onChange={(_, v) => setEndMax(parseInt(v || "4"))} styles={{ root: { width: 120 } }} />
          </Stack>
        </Stack>
        <DialogFooter>
          <PrimaryButton text={creating ? "Creating..." : "Create Schedule"} disabled={!name || selectedGateways.length === 0 || creating} onClick={handleCreate} />
          <DefaultButton text="Cancel" onClick={() => setShowCreate(false)} />
        </DialogFooter>
      </Dialog>
    </div>
  );
};
