import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Stack,
  Text,
  Spinner,
  MessageBar,
  MessageBarType,
  DefaultButton,
  PrimaryButton,
  ProgressIndicator,
} from "@fluentui/react";
import { runDiagnostics } from "../services/api";
import { DiagnosticResult } from "../types";

export function DiagnosticsPage() {
  const { subscriptionId, resourceGroup, name } = useParams<{
    subscriptionId: string;
    resourceGroup: string;
    name: string;
  }>();
  const navigate = useNavigate();
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runDiag() {
    if (!subscriptionId || !resourceGroup || !name) return;
    try {
      setLoading(true);
      setError(null);
      const data = await runDiagnostics(subscriptionId, resourceGroup, name);
      setResults(data.results);
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run diagnostics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runDiag();
  }, [subscriptionId, resourceGroup, name]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pass": return "✅";
      case "fail": return "❌";
      case "warn": return "⚠️";
      default: return "❔";
    }
  };

  return (
    <div className="page-container">
      <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 16 }}>
        <DefaultButton iconProps={{ iconName: "Back" }} onClick={() => navigate(-1)} text="Back" />
        <Text variant="xxLarge" styles={{ root: { fontWeight: 600 } }}>
          Diagnostics: {name}
        </Text>
      </Stack>

      <Stack horizontal tokens={{ childrenGap: 8 }} styles={{ root: { marginTop: 16, marginBottom: 24 } }}>
        <PrimaryButton text="Re-run Diagnostics" onClick={runDiag} disabled={loading} iconProps={{ iconName: "Refresh" }} />
      </Stack>

      {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}

      {loading ? (
        <Stack tokens={{ childrenGap: 16 }}>
          <Spinner label="Running diagnostics..." />
          <ProgressIndicator description="Checking gateway configuration, backend health, and more..." />
        </Stack>
      ) : (
        <Stack tokens={{ childrenGap: 16 }}>
          {/* Summary */}
          {summary && (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{summary.total}</div>
                <div className="stat-label">Total Checks</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: "#107c10" }}>{summary.passed}</div>
                <div className="stat-label">Passed</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: "#c19c00" }}>{summary.warnings}</div>
                <div className="stat-label">Warnings</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: "#d13438" }}>{summary.failed}</div>
                <div className="stat-label">Failed</div>
              </div>
            </div>
          )}

          {/* Results grouped by category */}
          {results.length > 0 && (
            <div className="card">
              <Text variant="large" styles={{ root: { fontWeight: 600, marginBottom: 16 } }}>
                Diagnostic Results
              </Text>

              {/* Show failures first, then warnings, then passes */}
              {["fail", "warn", "pass"].map((status) => {
                const filtered = results.filter((r) => r.status === status);
                if (filtered.length === 0) return null;
                return (
                  <div key={status}>
                    {filtered.map((result, idx) => (
                      <div key={idx} className="diagnostic-item">
                        <span className="diagnostic-icon">{getStatusIcon(result.status)}</span>
                        <div className="diagnostic-content">
                          <div className="diagnostic-message">
                            <span style={{ color: "#a19f9d", marginRight: 8 }}>[{result.category}]</span>
                            {result.message}
                          </div>
                          {result.details && (
                            <div style={{ fontSize: 12, color: "#a19f9d", marginTop: 4 }}>{result.details}</div>
                          )}
                          {result.recommendation && (
                            <div className="diagnostic-recommendation">
                              💡 {result.recommendation}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </Stack>
      )}
    </div>
  );
}
