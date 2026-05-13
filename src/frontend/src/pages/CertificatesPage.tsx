import { useState, useEffect } from "react";
import {
  Stack,
  Text,
  Spinner,
  MessageBar,
  MessageBarType,
  DetailsList,
  DetailsListLayoutMode,
  SelectionMode,
  IColumn,
  Toggle,
  PrimaryButton,
  DefaultButton,
  Dialog,
  DialogType,
  DialogFooter,
  Dropdown,
  IDropdownOption,
  TextField,
} from "@fluentui/react";
import { SubscriptionPicker } from "../components/SubscriptionPicker";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { getCertificates, getGateways } from "../services/api";
import { CertificateInfo, GatewayListItem } from "../types";
import axios from "axios";
import { getAccessToken } from "../services/api";

export function CertificatesPage() {
  const { subscriptions, selectedSubscription, setSelectedSubscription, loading: subsLoading } = useSubscriptions();
  const [certificates, setCertificates] = useState<CertificateInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExpiringOnly, setShowExpiringOnly] = useState(false);
  const [gateways, setGateways] = useState<GatewayListItem[]>([]);
  const [attachDialog, setAttachDialog] = useState(false);
  const [selectedCert, setSelectedCert] = useState<CertificateInfo | null>(null);
  const [attachGw, setAttachGw] = useState("");
  const [attachListenerName, setAttachListenerName] = useState("httpsListener");
  const [attachPort, setAttachPort] = useState("443");
  const [attachHostName, setAttachHostName] = useState("");
  const [attachLoading, setAttachLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSubscription) return;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [certs, gws] = await Promise.all([
          getCertificates(selectedSubscription),
          getGateways(selectedSubscription),
        ]);
        setCertificates(certs);
        setGateways(gws);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load certificates");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [selectedSubscription]);

  const displayedCerts = showExpiringOnly
    ? certificates.filter((c) => c.daysUntilExpiry !== undefined && c.daysUntilExpiry <= 30)
    : certificates;

  const columns: IColumn[] = [
    { key: "name", name: "Certificate Name", fieldName: "name", minWidth: 150 },
    { key: "gateway", name: "Gateway", fieldName: "gatewayName", minWidth: 150 },
    { key: "rg", name: "Resource Group", fieldName: "resourceGroup", minWidth: 150 },
    { key: "subject", name: "Subject", fieldName: "subject", minWidth: 200 },
    {
      key: "expiry",
      name: "Expiry Date",
      minWidth: 120,
      onRender: (item: CertificateInfo) =>
        item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : "N/A",
    },
    {
      key: "daysLeft",
      name: "Days Until Expiry",
      minWidth: 120,
      onRender: (item: CertificateInfo) => {
        if (item.daysUntilExpiry === undefined) return "N/A";
        const color = item.daysUntilExpiry <= 7 ? "#d13438" : item.daysUntilExpiry <= 30 ? "#c19c00" : "#107c10";
        return <span style={{ color, fontWeight: 600 }}>{item.daysUntilExpiry} days</span>;
      },
    },
    {
      key: "keyVault",
      name: "Key Vault",
      minWidth: 100,
      onRender: (item: CertificateInfo) => (
        <span className={`status-badge ${item.keyVaultSecretId ? "status-running" : "status-warning"}`}>
          {item.keyVaultSecretId ? "Linked" : "Manual"}
        </span>
      ),
    },
    {
      key: "actions",
      name: "Actions",
      minWidth: 150,
      onRender: (item: CertificateInfo) => (
        <DefaultButton
          text="Create Listener"
          iconProps={{ iconName: "Add" }}
          onClick={() => {
            setSelectedCert(item);
            setAttachGw(item.gatewayName);
            setAttachDialog(true);
          }}
          styles={{ root: { borderRadius: 4, fontSize: 12, height: 28 } }}
        />
      ),
    },
  ];

  const gwOptions: IDropdownOption[] = gateways.map((g) => ({
    key: `${g.resourceGroup}/${g.name}`,
    text: `${g.name} (${g.resourceGroup})`,
  }));

  const handleCreateListener = async () => {
    if (!selectedCert || !attachGw || !selectedSubscription) return;
    setAttachLoading(true);
    setError(null);
    try {
      const [rg, gwName] = attachGw.includes("/") ? attachGw.split("/") : [selectedCert.resourceGroup, attachGw];
      const token = await getAccessToken();
      await axios.post(
        `/api/chat`,
        {
          message: `Add an HTTPS listener to gateway "${gwName}" in resource group "${rg}". Use the existing SSL cert named "${selectedCert.name}" that is already on the gateway. Listener name: "${attachListenerName}", port: ${attachPort}${attachHostName ? `, hostname: "${attachHostName}"` : ""}. Subscription: ${selectedSubscription}`,
          conversationId: `cert-attach-${Date.now()}`,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(`HTTPS listener "${attachListenerName}" creation started on ${gwName}`);
      setAttachDialog(false);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to create listener");
    } finally {
      setAttachLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <Text variant="xxLarge" styles={{ root: { fontWeight: 600 } }}>
          SSL/TLS Certificates
        </Text>
      </div>

      <Stack tokens={{ childrenGap: 16 }}>
        <SubscriptionPicker
          subscriptions={subscriptions}
          selectedSubscription={selectedSubscription}
          onChange={setSelectedSubscription}
          loading={subsLoading}
        />

        <Toggle
          label="Show expiring only (< 30 days)"
          checked={showExpiringOnly}
          onChange={(_, checked) => setShowExpiringOnly(!!checked)}
        />

        {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError(null)}>{error}</MessageBar>}
        {success && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSuccess(null)}>{success}</MessageBar>}

        {loading ? (
          <Spinner label="Loading certificates..." />
        ) : displayedCerts.length === 0 ? (
          <div className="empty-state">
            <h3>No certificates found</h3>
            <p>{showExpiringOnly ? "No expiring certificates." : "No SSL certificates found."}</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #edebe9", textAlign: "left" }}>
                  <th style={{ padding: "12px 16px" }}>Certificate Name</th>
                  <th style={{ padding: "12px 16px" }}>Gateway</th>
                  <th style={{ padding: "12px 16px" }}>Resource Group</th>
                  <th style={{ padding: "12px 16px" }}>Subject</th>
                  <th style={{ padding: "12px 16px" }}>Expiry Date</th>
                  <th style={{ padding: "12px 16px" }}>Days Left</th>
                  <th style={{ padding: "12px 16px" }}>Key Vault</th>
                  <th style={{ padding: "12px 16px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedCerts.map((cert) => {
                  const isExpiring = cert.daysUntilExpiry !== undefined && cert.daysUntilExpiry <= 30;
                  const isExpired = cert.daysUntilExpiry !== undefined && cert.daysUntilExpiry <= 0;
                  const isCritical = cert.daysUntilExpiry !== undefined && cert.daysUntilExpiry <= 7;
                  const rowBg = isExpired ? "#fde7e9" : isCritical ? "#fed9cc" : isExpiring ? "#fff4ce" : "transparent";
                  return (
                    <tr key={cert.id} style={{ borderBottom: "1px solid #edebe9", background: rowBg }}>
                      <td style={{ padding: "10px 16px", fontWeight: 600 }}>{cert.name}</td>
                      <td style={{ padding: "10px 16px" }}>{cert.gatewayName}</td>
                      <td style={{ padding: "10px 16px" }}>{cert.resourceGroup}</td>
                      <td style={{ padding: "10px 16px", fontSize: 12 }}>{cert.subject || "N/A"}</td>
                      <td style={{ padding: "10px 16px" }}>
                        {cert.expiryDate ? (
                          <span style={{ color: isExpiring ? "#d13438" : "#323130", fontWeight: isExpiring ? 700 : 400 }}>
                            {new Date(cert.expiryDate).toLocaleDateString()}
                          </span>
                        ) : "N/A"}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        {cert.daysUntilExpiry !== undefined ? (
                          <span style={{
                            color: isExpired ? "#d13438" : isCritical ? "#d13438" : isExpiring ? "#c19c00" : "#107c10",
                            fontWeight: 700,
                            fontSize: 14,
                          }}>
                            {isExpired ? "EXPIRED" : `${cert.daysUntilExpiry} days`}
                          </span>
                        ) : "N/A"}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <span className={`status-badge ${cert.keyVaultSecretId ? "status-running" : "status-warning"}`}>
                          {cert.keyVaultSecretId ? "Linked" : "Manual"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <DefaultButton
                          text="Create Listener"
                          iconProps={{ iconName: "Add" }}
                          onClick={() => { setSelectedCert(cert); setAttachGw(cert.gatewayName); setAttachDialog(true); }}
                          styles={{ root: { borderRadius: 4, fontSize: 11, height: 28, minWidth: 0 } }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Stack>

      {/* Create HTTPS Listener Dialog */}
      <Dialog
        hidden={!attachDialog}
        onDismiss={() => setAttachDialog(false)}
        dialogContentProps={{
          type: DialogType.normal,
          title: "Create HTTPS Listener",
          subText: selectedCert ? `Using certificate "${selectedCert.name}" from ${selectedCert.gatewayName}` : "",
        }}
        minWidth={500}
      >
        <Stack tokens={{ childrenGap: 12 }}>
          <Dropdown
            label="Application Gateway"
            selectedKey={attachGw.includes("/") ? attachGw : undefined}
            options={gwOptions}
            onChange={(_, opt) => setAttachGw(opt?.key as string || "")}
            placeholder="Select gateway"
          />
          <TextField
            label="Listener Name"
            value={attachListenerName}
            onChange={(_, v) => setAttachListenerName(v || "")}
            required
          />
          <TextField
            label="Port"
            value={attachPort}
            onChange={(_, v) => setAttachPort(v || "443")}
            type="number"
          />
          <TextField
            label="Host Name (optional, for multi-site)"
            value={attachHostName}
            onChange={(_, v) => setAttachHostName(v || "")}
            placeholder="e.g., app.contoso.com"
          />
        </Stack>
        <DialogFooter>
          <PrimaryButton
            text={attachLoading ? "Creating..." : "Create Listener"}
            onClick={handleCreateListener}
            disabled={attachLoading || !attachGw}
          />
          <DefaultButton text="Cancel" onClick={() => setAttachDialog(false)} />
        </DialogFooter>
      </Dialog>
    </div>
  );
}
