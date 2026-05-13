import React, { useState } from "react";
import { Text, Dropdown, IDropdownOption, SearchBox, Stack } from "@fluentui/react";
import { ActivityLogEntry } from "../../types";

interface Props {
  logs: ActivityLogEntry[];
}

const actionIcons: Record<string, string> = {
  "gateway.create": "\uD83C\uDF10",
  "gateway.delete": "\uD83D\uDDD1\uFE0F",
  "gateway.start": "\u25B6\uFE0F",
  "gateway.stop": "\u23F9\uFE0F",
  "template.save": "\uD83D\uDCCB",
  "template.apply": "\uD83D\uDCE4",
  "template.delete": "\uD83D\uDDD1\uFE0F",
  "drift.baseline": "\uD83D\uDCF8",
  "drift.check": "\uD83D\uDD0D",
  "alert.create": "\uD83D\uDD14",
  "alert.evaluate": "\u26A1",
  "cert.generate": "\uD83D\uDD10",
};

const actionTypeOptions: IDropdownOption[] = [
  { key: "", text: "All Actions" },
  { key: "gateway", text: "Gateway" },
  { key: "template", text: "Template" },
  { key: "drift", text: "Drift" },
  { key: "alert", text: "Alert" },
  { key: "cert", text: "Certificate" },
];

export const ActivityLogSection: React.FC<Props> = ({ logs }) => {
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");

  const filtered = logs.filter((log) => {
    if (filter && !log.action.startsWith(filter)) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        log.action.toLowerCase().includes(s) ||
        log.resourceName.toLowerCase().includes(s) ||
        (log.details || "").toLowerCase().includes(s) ||
        log.user.toLowerCase().includes(s)
      );
    }
    return true;
  });

  if (logs.length === 0) {
    return (
      <div className="card">
        <div className="empty-state" style={{ padding: 30 }}>
          <h3>No activity recorded yet</h3>
          <p>Actions like gateway operations, template saves, and drift checks will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Stack horizontal tokens={{ childrenGap: 12 }} styles={{ root: { marginBottom: 12 } }}>
        <Dropdown
          options={actionTypeOptions}
          selectedKey={filter}
          onChange={(_, o) => setFilter(o?.key as string || "")}
          styles={{ root: { width: 160 } }}
          placeholder="Filter by type"
        />
        <SearchBox
          placeholder="Search logs..."
          value={search}
          onChange={(_, v) => setSearch(v || "")}
          styles={{ root: { width: 240 } }}
        />
      </Stack>

      <div className="activity-log">
        {filtered.slice(0, 50).map((log) => (
          <div key={log.id} className="activity-log-entry">
            <span className="activity-log-timestamp">
              {new Date(log.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
              {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>
              {actionIcons[log.action] || "\uD83D\uDCDD"}
            </span>
            <span className="activity-log-action">{log.action}</span>
            <span className="activity-log-resource">{log.resourceName}</span>
            {log.details && <span className="activity-log-details">{log.details}</span>}
            <span className="activity-log-user">{log.user}</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: "#a19f9d" }}>No matching entries</div>
        )}
      </div>
    </div>
  );
};
