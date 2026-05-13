import React, { useState, useEffect } from "react";
import {
  Stack,
  Text,
  TextField,
  PrimaryButton,
  DefaultButton,
  Dropdown,
  IDropdownOption,
  MessageBar,
  MessageBarType,
  Spinner,
  Panel,
  PanelType,
} from "@fluentui/react";
import { GatewayListItem, CertificateInfo } from "../../types";
import { generateCertificate, getAccessToken, getCertificates } from "../../services/api";
import axios from "axios";

interface Props {
  gateways: GatewayListItem[];
  selectedSubscription: string;
}

interface CertResult {
  pfxBase64: string;
  password: string;
  commonName: string;
  daysValid: number;
}

export const CertificateSection: React.FC<Props> = ({ gateways, selectedSubscription }) => {
  const [showGenerator, setShowGenerator] = useState(false);

  // Cert generation form
  const [commonName, setCommonName] = useState("");
  const [domain, setDomain] = useState("");
  const [subject, setSubject] = useState("");
  const [organization, setOrganization] = useState("Contoso");
  const [country, setCountry] = useState("US");
  const [daysValid, setDaysValid] = useState("365");
  const [generating, setGenerating] = useState(false);
  const [certResult, setCertResult] = useState<CertResult | null>(null);

  // Existing certs
  const [existingCerts, setExistingCerts] = useState<CertificateInfo[]>([]);
  const [loadingCerts, setLoadingCerts] = useState(false);
  const [selectedCert, setSelectedCert] = useState<CertificateInfo | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Assign to listener
  const [assignGateway, setAssignGateway] = useState("");
  const [listenerName, setListenerName] = useState("httpsListener");
  const [listenerPort, setListenerPort] = useState("443");
  const [hostName, setHostName] = useState("");
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!selectedSubscription) return;
    loadCerts();
  }, [selectedSubscription]);

  const loadCerts = async () => {
    setLoadingCerts(true);
    try {
      const certs = await getCertificates(selectedSubscription);
      setExistingCerts(certs);
    } catch {} finally {
      setLoadingCerts(false);
    }
  };

  const handleGenerate = async () => {
    if (!commonName) return;
    setGenerating(true);
    setError("");
    setCertResult(null);
    try {
      // Build CN with domain if provided
      const fullCn = domain ? `${commonName}.${domain}` : commonName;
      const result = await generateCertificate(fullCn, parseInt(daysValid, 10) || 365);
      setCertResult(result);
      setSuccess(`Certificate generated for ${fullCn}`);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Failed to generate certificate");
    } finally {
      setGenerating(false);
    }
  };

  const handleAssign = async () => {
    if (!certResult || !assignGateway || !selectedSubscription) return;
    const gw = gateways.find((g) => g.name === assignGateway);
    if (!gw) return;

    setAssigning(true);
    setError("");
    try {
      const token = await getAccessToken();
      await axios.post(
        `/api/gateways/${selectedSubscription}/${gw.resourceGroup}/${gw.name}/https-listener`,
        {
          certData: certResult.pfxBase64,
          certPassword: certResult.password,
          certName: `ssl-${commonName}-${Date.now()}`,
          listenerName,
          port: parseInt(listenerPort, 10) || 443,
          hostName: hostName || undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(`HTTPS listener "${listenerName}" added to ${gw.name} — gateway updating (2-5 min)`);
      setCertResult(null);
      setCommonName("");
      setShowGenerator(false);
      setTimeout(loadCerts, 5000);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Failed to assign certificate");
    } finally {
      setAssigning(false);
    }
  };

  const gatewayOptions: IDropdownOption[] = gateways
    .filter((g) => g.operationalState === "Running")
    .map((g) => ({ key: g.name, text: `${g.name} (${g.resourceGroup})` }));

  return (
    <div className="card">
      {error && <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError("")} styles={{ root: { marginBottom: 12 } }}>{error}</MessageBar>}
      {success && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSuccess("")} styles={{ root: { marginBottom: 12 } }}>{success}</MessageBar>}

      {/* Existing Certificates Table */}
      <Stack horizontal horizontalAlign="space-between" verticalAlign="center" styles={{ root: { marginBottom: 12 } }}>
        <Text variant="medium" styles={{ root: { fontWeight: 700 } }}>SSL Certificates ({existingCerts.length})</Text>
        <PrimaryButton
          text={showGenerator ? "Hide Generator" : "Generate New Certificate"}
          iconProps={{ iconName: showGenerator ? "ChevronUp" : "Add" }}
          onClick={() => setShowGenerator(!showGenerator)}
          styles={{ root: { borderRadius: 6 } }}
        />
      </Stack>

      {loadingCerts ? (
        <Spinner label="Loading certificates..." />
      ) : existingCerts.length === 0 ? (
        <Text variant="small" styles={{ root: { color: "#605e5c", fontStyle: "italic" } }}>
          No certificates installed on any gateway. Generate one above.
        </Text>
      ) : (
        <div style={{ border: "1px solid #edebe9", borderRadius: 6, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "#f3f2f1" }}>
              <tr>
                <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 12, color: "#605e5c", fontWeight: 600 }}>Name</th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 12, color: "#605e5c", fontWeight: 600 }}>Subject</th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 12, color: "#605e5c", fontWeight: 600 }}>Gateway</th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 12, color: "#605e5c", fontWeight: 600 }}>Expiry</th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 12, color: "#605e5c", fontWeight: 600 }}>Days Left</th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 12, color: "#605e5c", fontWeight: 600 }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {existingCerts.map((cert) => {
                const days = cert.daysUntilExpiry ?? 999;
                const expiryColor = days <= 7 ? "#d13438" : days <= 30 ? "#c19c00" : "#107c10";
                return (
                  <tr key={cert.id}
                    style={{ borderBottom: "1px solid #f3f2f1", cursor: "pointer", transition: "background 0.1s" }}
                    onClick={() => setSelectedCert(cert)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#faf9f8")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
                  >
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: "#0078d4" }}>{cert.name}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: "#605e5c" }}>{cert.subject || "—"}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13 }}>{cert.gatewayName}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13 }}>
                      {cert.expiryDate ? new Date(cert.expiryDate).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontWeight: 600, color: expiryColor }}>
                        {cert.daysUntilExpiry !== undefined ? `${cert.daysUntilExpiry} days` : "—"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span className={`status-badge ${cert.keyVaultSecretId ? "status-pass" : "status-warning"}`}>
                        {cert.keyVaultSecretId ? "Key Vault" : "Uploaded"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Generator Form (collapsed by default) */}
      {showGenerator && (
        <div style={{ marginTop: 16, padding: 16, border: "1px solid #0078d4", borderRadius: 8, background: "#f8fcff" }}>
          <Text variant="medium" styles={{ root: { fontWeight: 700, display: "block", marginBottom: 12 } }}>
            Generate Self-Signed Certificate
          </Text>

          {/* Subject details */}
          <Stack horizontal wrap tokens={{ childrenGap: 12 }} verticalAlign="end">
            <TextField
              label="Common Name (CN)"
              placeholder="e.g., myapp"
              value={commonName}
              onChange={(_, v) => setCommonName(v || "")}
              required
              styles={{ root: { minWidth: 200 } }}
            />
            <TextField
              label="Domain"
              placeholder="contoso.com"
              value={domain}
              onChange={(_, v) => setDomain(v || "")}
              styles={{ root: { minWidth: 200 } }}
              description="Will be appended to CN"
            />
            <TextField
              label="Days Valid"
              type="number"
              value={daysValid}
              onChange={(_, v) => setDaysValid(v || "365")}
              styles={{ root: { width: 100 } }}
            />
          </Stack>

          <Stack horizontal wrap tokens={{ childrenGap: 12 }} verticalAlign="end" styles={{ root: { marginTop: 12 } }}>
            <TextField
              label="Subject (Organization)"
              value={subject}
              onChange={(_, v) => setSubject(v || "")}
              placeholder="Organization details"
              styles={{ root: { minWidth: 240 } }}
            />
            <TextField
              label="Organization (O)"
              value={organization}
              onChange={(_, v) => setOrganization(v || "")}
              styles={{ root: { minWidth: 180 } }}
            />
            <TextField
              label="Country (C)"
              value={country}
              onChange={(_, v) => setCountry(v || "")}
              styles={{ root: { width: 100 } }}
            />
          </Stack>

          {commonName && (
            <Text variant="small" styles={{ root: { color: "#605e5c", marginTop: 8, display: "block" } }}>
              Final CN: <code style={{ background: "#f3f2f1", padding: "2px 6px", borderRadius: 3 }}>{domain ? `${commonName}.${domain}` : commonName}</code>
            </Text>
          )}

          <Stack horizontal tokens={{ childrenGap: 8 }} styles={{ root: { marginTop: 12 } }}>
            <PrimaryButton
              text={generating ? "Generating..." : "Generate Certificate"}
              disabled={!commonName || generating}
              onClick={handleGenerate}
              styles={{ root: { borderRadius: 6 } }}
            />
            <DefaultButton
              text="Cancel"
              onClick={() => { setShowGenerator(false); setCertResult(null); }}
              styles={{ root: { borderRadius: 6 } }}
            />
          </Stack>

          {generating && <Spinner label="Generating certificate..." styles={{ root: { marginTop: 12 } }} />}

          {certResult && (
            <div style={{ marginTop: 16, padding: 16, background: "white", border: "1px solid #107c10", borderRadius: 8 }}>
              <Text variant="medium" styles={{ root: { fontWeight: 700, color: "#107c10", display: "block", marginBottom: 8 } }}>
                ✅ Certificate Generated
              </Text>
              <Stack tokens={{ childrenGap: 4 }}>
                <Text variant="small"><strong>Common Name:</strong> {certResult.commonName}</Text>
                <Text variant="small"><strong>Valid for:</strong> {certResult.daysValid} days</Text>
                <Text variant="small"><strong>Password:</strong> <code style={{ background: "#f3f2f1", padding: "2px 6px", borderRadius: 3 }}>{certResult.password}</code></Text>
                <Text variant="small" styles={{ root: { color: "#605e5c" } }}>PFX data ready ({(certResult.pfxBase64.length / 1024).toFixed(1)} KB)</Text>
              </Stack>

              <Text variant="medium" styles={{ root: { fontWeight: 700, display: "block", marginTop: 16, marginBottom: 8 } }}>
                Assign to Application Gateway
              </Text>

              <Stack horizontal wrap tokens={{ childrenGap: 12 }} verticalAlign="end">
                <Dropdown
                  label="Application Gateway"
                  placeholder="Select gateway"
                  options={gatewayOptions}
                  selectedKey={assignGateway}
                  onChange={(_, opt) => setAssignGateway(opt?.key as string || "")}
                  styles={{ root: { minWidth: 250 } }}
                  required
                />
                <TextField
                  label="HTTPS Listener Name"
                  value={listenerName}
                  onChange={(_, v) => setListenerName(v || "")}
                  styles={{ root: { width: 180 } }}
                  required
                />
                <TextField
                  label="Port"
                  type="number"
                  value={listenerPort}
                  onChange={(_, v) => setListenerPort(v || "443")}
                  styles={{ root: { width: 80 } }}
                />
                <TextField
                  label="Host Name (optional)"
                  placeholder="leave blank for any"
                  value={hostName}
                  onChange={(_, v) => setHostName(v || "")}
                  styles={{ root: { minWidth: 180 } }}
                />
              </Stack>
              <Stack horizontal tokens={{ childrenGap: 8 }} styles={{ root: { marginTop: 12 } }}>
                <PrimaryButton
                  text={assigning ? "Assigning..." : "Assign to Gateway"}
                  disabled={!assignGateway || assigning}
                  onClick={handleAssign}
                  styles={{ root: { borderRadius: 6 } }}
                />
                <DefaultButton
                  text="Discard Cert"
                  onClick={() => setCertResult(null)}
                  styles={{ root: { borderRadius: 6 } }}
                />
              </Stack>
            </div>
          )}
        </div>
      )}

      {/* Cert Detail Panel */}
      <Panel
        isOpen={!!selectedCert}
        onDismiss={() => setSelectedCert(null)}
        headerText={`Certificate: ${selectedCert?.name}`}
        type={PanelType.medium}
      >
        {selectedCert && (
          <Stack tokens={{ childrenGap: 16 }} styles={{ root: { marginTop: 16 } }}>
            <div className="card">
              <Text variant="medium" styles={{ root: { fontWeight: 700, display: "block", marginBottom: 12 } }}>Certificate Details</Text>
              <Stack tokens={{ childrenGap: 8 }}>
                <Stack horizontal tokens={{ childrenGap: 8 }}>
                  <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Name:</Text>
                  <Text>{selectedCert.name}</Text>
                </Stack>
                <Stack horizontal tokens={{ childrenGap: 8 }}>
                  <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Subject:</Text>
                  <Text variant="small">{selectedCert.subject || "Not available"}</Text>
                </Stack>
                <Stack horizontal tokens={{ childrenGap: 8 }}>
                  <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Gateway:</Text>
                  <Text>{selectedCert.gatewayName}</Text>
                </Stack>
                <Stack horizontal tokens={{ childrenGap: 8 }}>
                  <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Resource Group:</Text>
                  <Text>{selectedCert.resourceGroup}</Text>
                </Stack>
                <Stack horizontal tokens={{ childrenGap: 8 }}>
                  <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Expiry Date:</Text>
                  <Text>{selectedCert.expiryDate ? new Date(selectedCert.expiryDate).toLocaleString() : "Not available"}</Text>
                </Stack>
                <Stack horizontal tokens={{ childrenGap: 8 }}>
                  <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Days Until Expiry:</Text>
                  <Text styles={{ root: { color: (selectedCert.daysUntilExpiry ?? 999) <= 30 ? "#d13438" : "#107c10", fontWeight: 600 } }}>
                    {selectedCert.daysUntilExpiry !== undefined ? `${selectedCert.daysUntilExpiry} days` : "—"}
                  </Text>
                </Stack>
                <Stack horizontal tokens={{ childrenGap: 8 }}>
                  <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Source:</Text>
                  <span className={`status-badge ${selectedCert.keyVaultSecretId ? "status-pass" : "status-warning"}`}>
                    {selectedCert.keyVaultSecretId ? "Azure Key Vault" : "Uploaded directly"}
                  </span>
                </Stack>
                {selectedCert.keyVaultSecretId && (
                  <Stack horizontal tokens={{ childrenGap: 8 }}>
                    <Text styles={{ root: { fontWeight: 600, minWidth: 140 } }}>Key Vault Secret:</Text>
                    <Text variant="small" styles={{ root: { color: "#605e5c", wordBreak: "break-all" } }}>{selectedCert.keyVaultSecretId}</Text>
                  </Stack>
                )}
              </Stack>
            </div>
          </Stack>
        )}
      </Panel>
    </div>
  );
};
