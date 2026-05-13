import { useState } from "react";
import {
  Stack,
  Text,
  Spinner,
  PrimaryButton,
  DefaultButton,
  MessageBar,
  MessageBarType,
  ProgressIndicator,
  Pivot,
  PivotItem,
  Checkbox,
  Dropdown,
  IDropdownOption,
} from "@fluentui/react";
import { SubscriptionPicker } from "../components/SubscriptionPicker";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { getGateways, getGatewayDetail, getWafPolicies } from "../services/api";
import { GatewayListItem, WafPolicy } from "../types";

interface ScanCheck {
  category: string;
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  remediation?: string;
  reference?: string;
}

interface GatewayScanResult {
  gateway: string;
  resourceGroup: string;
  location: string;
  sku: string;
  score: number;
  grade: string;
  gradeColor: string;
  checks: ScanCheck[];
  wafPolicy?: WafPolicy;
}

interface ScanSummary {
  totalGateways: number;
  avgScore: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  passCount: number;
  scanDate: string;
}

function getGrade(score: number): { grade: string; color: string } {
  if (score >= 95) return { grade: "A+", color: "#107c10" };
  if (score >= 85) return { grade: "A", color: "#107c10" };
  if (score >= 75) return { grade: "B", color: "#0078d4" };
  if (score >= 65) return { grade: "C", color: "#c19c00" };
  if (score >= 50) return { grade: "D", color: "#d83b01" };
  return { grade: "F", color: "#d13438" };
}

function runSecurityChecks(gateway: any, wafPolicies: WafPolicy[]): { checks: ScanCheck[]; wafPolicy?: WafPolicy } {
  const checks: ScanCheck[] = [];
  const parsed = gateway._parsed || {};
  const listeners = parsed.listeners || [];
  const httpsListeners = listeners.filter((l: any) => l.protocol === "Https");
  const httpListeners = listeners.filter((l: any) => l.protocol === "Http");
  const probes = parsed.healthProbes || [];
  const pools = parsed.backendPools || [];
  const httpSettings = parsed.httpSettings || [];
  const rules = parsed.routingRules || [];

  // Find associated WAF policy
  const associatedWaf = wafPolicies.find(p =>
    p.associatedGateways?.some(g => g.includes(gateway.name))
  );

  // ========== HTTPS / TLS ==========
  if (httpsListeners.length === 0) {
    checks.push({
      category: "TLS/SSL", name: "HTTPS Listener", status: "fail", severity: "critical",
      message: "No HTTPS listeners. All traffic is transmitted in plaintext — credentials, tokens, and data are exposed.",
      remediation: "Add an HTTPS listener with a valid SSL certificate on port 443.",
      reference: "OWASP A02:2021 - Cryptographic Failures",
    });
  } else {
    checks.push({
      category: "TLS/SSL", name: "HTTPS Listener", status: "pass", severity: "critical",
      message: `${httpsListeners.length} HTTPS listener(s) active. Traffic is encrypted.`,
    });
  }

  if (httpListeners.length > 0 && httpsListeners.length > 0) {
    checks.push({
      category: "TLS/SSL", name: "HTTP to HTTPS Redirect", status: "warn", severity: "high",
      message: "HTTP listeners exist alongside HTTPS. Users may access the site over unencrypted HTTP.",
      remediation: "Add redirect rules to force all HTTP traffic to HTTPS.",
      reference: "OWASP A02:2021 - Cryptographic Failures",
    });
  } else if (httpListeners.length > 0 && httpsListeners.length === 0) {
    checks.push({
      category: "TLS/SSL", name: "Encryption", status: "fail", severity: "critical",
      message: "Only HTTP listeners configured. Zero encryption on any traffic.",
      remediation: "Create an SSL certificate and configure HTTPS listener immediately.",
      reference: "OWASP A02:2021 - Cryptographic Failures",
    });
  } else if (httpListeners.length === 0 && httpsListeners.length > 0) {
    checks.push({
      category: "TLS/SSL", name: "HTTPS Only", status: "pass", severity: "high",
      message: "All listeners use HTTPS. No unencrypted HTTP endpoints exposed.",
    });
  }

  // SSL Policy / Cipher Checks
  const sslPolicy = gateway.sslPolicy;
  if (sslPolicy) {
    const policyType = sslPolicy.policyType;
    const policyName = sslPolicy.policyName;
    const minProtocol = sslPolicy.minProtocolVersion;

    if (minProtocol && (minProtocol === "TLSv1_0" || minProtocol === "TLSv1_1")) {
      checks.push({
        category: "TLS/SSL", name: "TLS Minimum Version", status: "fail", severity: "critical",
        message: `Minimum TLS version is ${minProtocol}. TLS 1.0 and 1.1 are deprecated and vulnerable to BEAST, POODLE attacks.`,
        remediation: "Set minimum TLS version to TLSv1_2 or TLSv1_3.",
        reference: "OWASP A02:2021 - Cryptographic Failures / PCI DSS 3.2.1",
      });
    } else if (minProtocol === "TLSv1_2") {
      checks.push({
        category: "TLS/SSL", name: "TLS Minimum Version", status: "pass", severity: "critical",
        message: "Minimum TLS version is TLS 1.2. Older insecure protocols are blocked.",
      });
    } else if (minProtocol === "TLSv1_3") {
      checks.push({
        category: "TLS/SSL", name: "TLS Minimum Version", status: "pass", severity: "critical",
        message: "Minimum TLS version is TLS 1.3. Maximum security with modern cipher suites only.",
      });
    }

    // Check for weak ciphers
    const weakCiphers = [
      "TLS_RSA_WITH_AES_128_CBC_SHA", "TLS_RSA_WITH_AES_256_CBC_SHA",
      "TLS_RSA_WITH_AES_128_CBC_SHA256", "TLS_RSA_WITH_AES_256_CBC_SHA256",
      "TLS_RSA_WITH_3DES_EDE_CBC_SHA",
    ];
    const configuredCiphers = sslPolicy.cipherSuites || [];
    const foundWeakCiphers = configuredCiphers.filter((c: string) => weakCiphers.includes(c));

    if (foundWeakCiphers.length > 0) {
      checks.push({
        category: "TLS/SSL", name: "Weak Cipher Suites", status: "fail", severity: "high",
        message: `${foundWeakCiphers.length} weak cipher(s) enabled: ${foundWeakCiphers.join(", ")}. RSA key exchange and CBC mode ciphers are vulnerable.`,
        remediation: "Remove weak ciphers. Use only ECDHE key exchange with GCM mode (e.g., TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384).",
        reference: "NIST SP 800-52 Rev 2",
      });
    } else if (configuredCiphers.length > 0) {
      checks.push({
        category: "TLS/SSL", name: "Cipher Suites", status: "pass", severity: "high",
        message: `${configuredCiphers.length} cipher suite(s) configured. No known weak ciphers detected.`,
      });
    }

    // SSL Policy preset check
    if (policyType === "Predefined") {
      const securePolicies = ["AppGwSslPolicy20220101", "AppGwSslPolicy20220101S"];
      if (policyName && securePolicies.includes(policyName)) {
        checks.push({
          category: "TLS/SSL", name: "SSL Policy Preset", status: "pass", severity: "high",
          message: `Using secure SSL policy preset: ${policyName}.`,
        });
      } else if (policyName) {
        checks.push({
          category: "TLS/SSL", name: "SSL Policy Preset", status: "warn", severity: "high",
          message: `Using older SSL policy preset: ${policyName}. Newer presets enforce TLS 1.2+ with stronger ciphers.`,
          remediation: "Switch to AppGwSslPolicy20220101 or AppGwSslPolicy20220101S for maximum security.",
        });
      }
    } else if (policyType === "Custom" || policyType === "CustomV2") {
      checks.push({
        category: "TLS/SSL", name: "SSL Policy", status: "pass", severity: "high",
        message: `Custom SSL policy configured (${policyType}). Verify cipher suite selection meets your compliance requirements.`,
      });
    }
  } else if (httpsListeners.length > 0) {
    checks.push({
      category: "TLS/SSL", name: "SSL Policy", status: "warn", severity: "high",
      message: "Using default SSL policy. Default may allow TLS 1.0/1.1 and weak ciphers depending on SKU version.",
      remediation: "Explicitly set an SSL policy with minimum TLS 1.2 and strong cipher suites.",
      reference: "Azure App Gateway SSL Policy Documentation",
    });
  }

  // SSL Certificate checks
  const sslCerts = gateway.sslCertificates || [];
  if (httpsListeners.length > 0 && sslCerts.length === 0) {
    checks.push({
      category: "TLS/SSL", name: "SSL Certificates", status: "fail", severity: "critical",
      message: "HTTPS listeners configured but no SSL certificates found.",
      remediation: "Upload SSL certificates or link to Azure Key Vault certificates.",
    });
  } else if (sslCerts.length > 0) {
    const kvCerts = sslCerts.filter((c: any) => c.keyVaultSecretId);
    const manualCerts = sslCerts.length - kvCerts.length;
    if (manualCerts > 0) {
      checks.push({
        category: "TLS/SSL", name: "Certificate Management", status: "warn", severity: "medium",
        message: `${manualCerts} certificate(s) manually uploaded (not Key Vault linked). Manual certs don't auto-renew.`,
        remediation: "Store certificates in Azure Key Vault for automatic renewal and centralized management.",
      });
    } else {
      checks.push({
        category: "TLS/SSL", name: "Certificate Management", status: "pass", severity: "medium",
        message: `All ${sslCerts.length} certificate(s) linked to Azure Key Vault. Auto-renewal supported.`,
      });
    }
  }

  // Check for end-to-end SSL
  const httpBackendSettings = httpSettings.filter((s: any) => s.protocol === "Http");
  if (httpsListeners.length > 0 && httpBackendSettings.length > 0) {
    checks.push({
      category: "TLS/SSL", name: "End-to-End SSL", status: "warn", severity: "medium",
      message: "Frontend uses HTTPS but backend connections use HTTP. Traffic between gateway and backend is unencrypted.",
      remediation: "Configure backend HTTP settings to use HTTPS (port 443) for end-to-end encryption.",
      reference: "OWASP A02:2021 - Cryptographic Failures",
    });
  }

  // ========== WAF / OWASP ==========
  const wafEnabled = gateway.webApplicationFirewallConfiguration?.enabled || gateway.firewallPolicy;

  if (!wafEnabled) {
    checks.push({
      category: "WAF", name: "Web Application Firewall", status: "fail", severity: "critical",
      message: "WAF is NOT enabled. Gateway is vulnerable to SQL injection, XSS, CSRF, and all OWASP Top 10 attacks.",
      remediation: "Enable WAF with OWASP 3.2 rule set in Prevention mode.",
      reference: "OWASP Top 10:2021 - All Categories",
    });
  } else {
    const wafMode = gateway.webApplicationFirewallConfiguration?.firewallMode;
    const ruleSetVersion = gateway.webApplicationFirewallConfiguration?.ruleSetVersion;

    if (wafMode === "Detection") {
      checks.push({
        category: "WAF", name: "WAF Mode - DETECTION ONLY", status: "fail", severity: "critical",
        message: "WAF is in Detection mode. Attacks are LOGGED but NOT BLOCKED. Your application is still vulnerable.",
        remediation: "Switch WAF to Prevention mode to actively block malicious requests.",
        reference: "OWASP Top 10:2021 - A01 Broken Access Control",
      });
    } else {
      checks.push({
        category: "WAF", name: "WAF Prevention Mode", status: "pass", severity: "critical",
        message: "WAF is in Prevention mode. Actively blocking malicious requests.",
      });
    }

    // Check rule set version
    if (ruleSetVersion && parseFloat(ruleSetVersion) < 3.2) {
      checks.push({
        category: "WAF", name: "OWASP Rule Set Version", status: "warn", severity: "high",
        message: `Using OWASP rule set ${ruleSetVersion}. Version 3.2+ includes protections against newer attack vectors.`,
        remediation: "Upgrade to OWASP rule set 3.2 for the latest protections.",
        reference: "CRS 3.2 Release Notes",
      });
    } else if (ruleSetVersion) {
      checks.push({
        category: "WAF", name: "OWASP Rule Set Version", status: "pass", severity: "high",
        message: `Using OWASP CRS ${ruleSetVersion} — current and up to date.`,
      });
    }
  }

  // WAF Policy details from policy list
  if (associatedWaf) {
    if (associatedWaf.policyMode === "Detection") {
      checks.push({
        category: "WAF", name: "WAF Policy Mode", status: "fail", severity: "critical",
        message: `WAF Policy "${associatedWaf.name}" is in Detection mode. Threats are only logged, not blocked.`,
        remediation: "Change the WAF policy mode from Detection to Prevention.",
      });
    }
    if (associatedWaf.customRulesCount === 0) {
      checks.push({
        category: "WAF", name: "Custom WAF Rules", status: "warn", severity: "medium",
        message: "No custom WAF rules configured. Consider adding rate limiting and geo-blocking rules.",
        remediation: "Add custom rules for rate limiting, IP blocking, and geo-filtering.",
        reference: "OWASP A07:2021 - Identification and Authentication Failures",
      });
    } else {
      checks.push({
        category: "WAF", name: "Custom WAF Rules", status: "pass", severity: "medium",
        message: `${associatedWaf.customRulesCount} custom WAF rule(s) configured.`,
      });
    }
  }

  // ========== OWASP Specific Checks ==========
  checks.push({
    category: "OWASP", name: "A01 - Broken Access Control", status: wafEnabled ? "pass" : "fail", severity: "critical",
    message: wafEnabled
      ? "WAF provides basic access control protection via managed rules."
      : "No WAF means no protection against path traversal, IDOR, or forced browsing attacks.",
    reference: "OWASP A01:2021",
  });

  checks.push({
    category: "OWASP", name: "A03 - Injection (SQLi/XSS)", status: wafEnabled ? "pass" : "fail", severity: "critical",
    message: wafEnabled
      ? "WAF OWASP rules protect against SQL injection and Cross-Site Scripting."
      : "No SQL injection or XSS protection. Applications behind this gateway are at risk.",
    reference: "OWASP A03:2021",
  });

  checks.push({
    category: "OWASP", name: "A05 - Security Misconfiguration", status: "info" as any, severity: "medium",
    message: "Review: Ensure backend apps don't expose stack traces, default credentials, or unnecessary HTTP methods.",
    reference: "OWASP A05:2021",
  });

  checks.push({
    category: "OWASP", name: "A06 - Vulnerable Components", status: "info" as any, severity: "medium",
    message: `Gateway SKU: ${gateway.sku?.name}. Ensure all backend applications are patched and using current frameworks.`,
    reference: "OWASP A06:2021",
  });

  checks.push({
    category: "OWASP", name: "A09 - Security Logging", status: gateway.diagnosticSettings ? "pass" : "warn", severity: "high",
    message: gateway.diagnosticSettings
      ? "Diagnostic logging is enabled."
      : "Diagnostic settings not verified. Ensure access logs and WAF logs are sent to Log Analytics.",
    remediation: "Enable diagnostic settings to capture access logs, performance logs, and WAF logs.",
    reference: "OWASP A09:2021 - Security Logging and Monitoring Failures",
  });

  // ========== Infrastructure ==========
  const skuTier = gateway.sku?.tier;
  if (!skuTier?.includes("v2")) {
    checks.push({
      category: "Infrastructure", name: "SKU Generation", status: "warn", severity: "medium",
      message: `Legacy SKU (${skuTier}). Missing autoscaling, zone redundancy, and improved performance.`,
      remediation: "Migrate to Standard_v2 or WAF_v2 SKU.",
    });
  } else {
    checks.push({
      category: "Infrastructure", name: "SKU Generation", status: "pass", severity: "medium",
      message: `${skuTier} — latest generation with autoscaling and zone redundancy support.`,
    });
  }

  // Autoscale check
  if (gateway.autoscaleConfiguration) {
    checks.push({
      category: "Infrastructure", name: "Autoscaling", status: "pass", severity: "medium",
      message: `Autoscale: min=${gateway.autoscaleConfiguration.minCapacity}, max=${gateway.autoscaleConfiguration.maxCapacity}`,
    });
  } else if (skuTier?.includes("v2")) {
    checks.push({
      category: "Infrastructure", name: "Autoscaling", status: "warn", severity: "low",
      message: "Fixed capacity — not using autoscale. May over-provision or under-provision during traffic spikes.",
      remediation: "Enable autoscaling with appropriate min/max capacity units.",
    });
  }

  // ========== Reliability ==========
  if (probes.length === 0) {
    checks.push({
      category: "Reliability", name: "Custom Health Probes", status: "warn", severity: "high",
      message: "No custom health probes. Default probes may not detect application-level failures.",
      remediation: "Configure custom health probes with application-specific health check paths (e.g., /health).",
    });
  } else {
    checks.push({
      category: "Reliability", name: "Custom Health Probes", status: "pass", severity: "high",
      message: `${probes.length} custom health probe(s) configured.`,
    });

    const longIntervalProbes = probes.filter((p: any) => p.interval > 60);
    if (longIntervalProbes.length > 0) {
      checks.push({
        category: "Reliability", name: "Probe Frequency", status: "warn", severity: "medium",
        message: `${longIntervalProbes.length} probe(s) have interval > 60s. Slow failure detection.`,
        remediation: "Reduce health probe interval to 30 seconds or less.",
      });
    }
  }

  const emptyPools = pools.filter((p: any) => !p.addresses || p.addresses.length === 0);
  if (emptyPools.length > 0) {
    checks.push({
      category: "Reliability", name: "Empty Backend Pools", status: "fail", severity: "high",
      message: `${emptyPools.length} backend pool(s) have zero servers. Requests will fail with 502.`,
      remediation: "Add backend server addresses to all pools or remove unused pools.",
    });
  }

  const singleServerPools = pools.filter((p: any) => p.addresses?.length === 1);
  if (singleServerPools.length > 0) {
    checks.push({
      category: "Reliability", name: "Backend Redundancy", status: "warn", severity: "medium",
      message: `${singleServerPools.length} pool(s) have only 1 backend server — single point of failure.`,
      remediation: "Add at least 2 backend servers per pool for high availability.",
    });
  } else if (pools.length > 0 && emptyPools.length === 0) {
    checks.push({
      category: "Reliability", name: "Backend Redundancy", status: "pass", severity: "medium",
      message: "All backend pools have multiple servers for redundancy.",
    });
  }

  if (rules.length === 0) {
    checks.push({
      category: "Configuration", name: "Routing Rules", status: "fail", severity: "critical",
      message: "No routing rules configured. Traffic cannot be routed to backends.",
      remediation: "Create at least one routing rule linking a listener to a backend pool.",
    });
  }

  // Request timeout
  const longTimeouts = httpSettings.filter((s: any) => s.requestTimeout > 120);
  if (longTimeouts.length > 0) {
    checks.push({
      category: "Performance", name: "Request Timeout", status: "warn", severity: "low",
      message: `${longTimeouts.length} HTTP setting(s) have timeout > 120s. Can cause resource exhaustion under load.`,
      remediation: "Set request timeout to 60-120 seconds unless long-running operations require more.",
    });
  }

  return { checks, wafPolicy: associatedWaf };
}

export function SecurityScanPage() {
  const { subscriptions, selectedSubscription, setSelectedSubscription, loading: subsLoading } = useSubscriptions();
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ percent: 0, label: "" });
  const [results, setResults] = useState<GatewayScanResult[]>([]);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allGateways, setAllGateways] = useState<GatewayListItem[]>([]);
  const [selectedGateways, setSelectedGateways] = useState<Set<string>>(new Set());
  const [gatewaysLoaded, setGatewaysLoaded] = useState(false);
  const [loadingGateways, setLoadingGateways] = useState(false);

  async function loadGatewayList() {
    if (!selectedSubscription) return;
    setLoadingGateways(true);
    setGatewaysLoaded(false);
    try {
      const gws = await getGateways(selectedSubscription);
      setAllGateways(gws);
      setSelectedGateways(new Set(gws.map(g => g.id)));
      setGatewaysLoaded(true);
    } catch (err) {
      setError("Failed to load gateways");
    } finally {
      setLoadingGateways(false);
    }
  }

  function handleSubscriptionChange(subId: string) {
    setSelectedSubscription(subId);
    setResults([]);
    setSummary(null);
    setAllGateways([]);
    setGatewaysLoaded(false);
    setSelectedGateways(new Set());
  }

  function toggleGateway(id: string) {
    setSelectedGateways(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() { setSelectedGateways(new Set(allGateways.map(g => g.id))); }
  function selectNone() { setSelectedGateways(new Set()); }

  async function runScan() {
    if (!selectedSubscription) return;
    setScanning(true);
    setResults([]);
    setSummary(null);
    setError(null);

    try {
      setScanProgress({ percent: 5, label: "Loading WAF policies..." });
      const wafPolicies = await getWafPolicies(selectedSubscription);

      const gateways = allGateways.filter(g => selectedGateways.has(g.id));

      if (gateways.length === 0) {
        setError("No gateways selected. Select at least one gateway to scan.");
        setScanning(false);
        return;
      }

      const scanResults: GatewayScanResult[] = [];

      for (let i = 0; i < gateways.length; i++) {
        const gw = gateways[i];
        setScanProgress({
          percent: 10 + ((i + 1) / gateways.length) * 85,
          label: `Scanning ${gw.name} (${i + 1}/${gateways.length})...`,
        });

        try {
          const detail = await getGatewayDetail(gw.subscriptionId, gw.resourceGroup, gw.name);
          const { checks, wafPolicy } = runSecurityChecks(detail, wafPolicies);

          // Score: weighted by severity
          const weights: Record<string, number> = { critical: 15, high: 10, medium: 5, low: 2, info: 0 };
          let totalWeight = 0;
          let earnedWeight = 0;
          for (const check of checks) {
            if (check.severity === "info") continue;
            const w = weights[check.severity] || 5;
            totalWeight += w;
            if (check.status === "pass") earnedWeight += w;
            else if (check.status === "warn") earnedWeight += w * 0.5;
          }
          const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
          const { grade, color } = getGrade(score);

          scanResults.push({
            gateway: gw.name,
            resourceGroup: gw.resourceGroup,
            location: gw.location,
            sku: `${gw.sku} / ${gw.tier}`,
            score,
            grade,
            gradeColor: color,
            checks,
            wafPolicy,
          });
        } catch (err) {
          scanResults.push({
            gateway: gw.name, resourceGroup: gw.resourceGroup, location: gw.location,
            sku: gw.sku, score: 0, grade: "?", gradeColor: "#a19f9d",
            checks: [{
              category: "Error", name: "Scan Failed", status: "fail", severity: "critical",
              message: `Could not scan: ${err instanceof Error ? err.message : "Unknown error"}`,
            }],
          });
        }
      }

      // Summary
      const allChecks = scanResults.flatMap(r => r.checks);
      setSummary({
        totalGateways: scanResults.length,
        avgScore: Math.round(scanResults.reduce((s, r) => s + r.score, 0) / scanResults.length),
        criticalCount: allChecks.filter(c => c.status === "fail" && c.severity === "critical").length,
        highCount: allChecks.filter(c => (c.status === "fail" || c.status === "warn") && c.severity === "high").length,
        mediumCount: allChecks.filter(c => c.status === "warn" && c.severity === "medium").length,
        lowCount: allChecks.filter(c => c.status === "warn" && c.severity === "low").length,
        passCount: allChecks.filter(c => c.status === "pass").length,
        scanDate: new Date().toLocaleString(),
      });

      setResults(scanResults);
      setScanProgress({ percent: 100, label: "Scan complete!" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  const statusIcon = (s: string) => s === "pass" ? "\u2705" : s === "fail" ? "\u274C" : s === "info" ? "\u2139\uFE0F" : "\u26A0\uFE0F";

  const sevColors: Record<string, { bg: string; fg: string }> = {
    critical: { bg: "#d134381a", fg: "#d13438" },
    high: { bg: "#d83b011a", fg: "#d83b01" },
    medium: { bg: "#c19c001a", fg: "#8a6d00" },
    low: { bg: "#0078d41a", fg: "#0078d4" },
    info: { bg: "#605e5c1a", fg: "#605e5c" },
  };

  const categories = ["TLS/SSL", "WAF", "OWASP", "Reliability", "Infrastructure", "Configuration", "Performance"];

  return (
    <div className="page-container">
      {/* Header */}
      <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: "linear-gradient(135deg, #e3008c, #8764b8)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
        }}>
          {"\uD83D\uDD0D"}
        </div>
        <div>
          <Text variant="xxLarge" styles={{ root: { fontWeight: 700 } }}>
            Security Assessment
          </Text>
          <Text styles={{ root: { color: "#605e5c", fontSize: 13 } }}>
            OWASP Top 10 + Azure Best Practices + WAF Policy Analysis
          </Text>
        </div>
      </Stack>

      {/* Step 1: Select Subscription */}
      <Stack tokens={{ childrenGap: 12 }} styles={{ root: { marginTop: 20 } }}>
        <Stack horizontal verticalAlign="end" tokens={{ childrenGap: 16 }}>
          <SubscriptionPicker
            subscriptions={subscriptions}
            selectedSubscription={selectedSubscription}
            onChange={handleSubscriptionChange}
            loading={subsLoading}
          />
          {selectedSubscription && !gatewaysLoaded && (
            <PrimaryButton text={loadingGateways ? "Loading..." : "Load Gateways"}
              onClick={loadGatewayList} disabled={loadingGateways}
              styles={{ root: { height: 36, borderRadius: 6 } }} />
          )}
        </Stack>

        {/* Step 2: Select Gateways */}
        {gatewaysLoaded && allGateways.length > 0 && (
          <div style={{
            background: "white", border: "1px solid #edebe9", borderRadius: 8, padding: 16,
          }}>
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
              <Text styles={{ root: { fontWeight: 600 } }}>Select Gateways to Scan</Text>
              <DefaultButton text="All" onClick={selectAll}
                styles={{ root: { minWidth: 0, height: 26, padding: "0 8px", borderRadius: 4 } }} />
              <DefaultButton text="None" onClick={selectNone}
                styles={{ root: { minWidth: 0, height: 26, padding: "0 8px", borderRadius: 4 } }} />
              <Text styles={{ root: { color: "#605e5c", fontSize: 12 } }}>
                {selectedGateways.size} of {allGateways.length} selected
              </Text>
            </Stack>
            <Stack horizontal wrap tokens={{ childrenGap: 12 }} styles={{ root: { marginTop: 12 } }}>
              {allGateways.map(gw => (
                <Stack key={gw.id} horizontal verticalAlign="center"
                  styles={{
                    root: {
                      padding: "6px 12px", borderRadius: 6, cursor: "pointer",
                      background: selectedGateways.has(gw.id) ? "#e8f0fe" : "#f8f8f8",
                      border: selectedGateways.has(gw.id) ? "1px solid #0078d4" : "1px solid #edebe9",
                    },
                  }}
                  onClick={() => toggleGateway(gw.id)}
                >
                  <Checkbox checked={selectedGateways.has(gw.id)}
                    onChange={() => toggleGateway(gw.id)}
                    styles={{ root: { marginRight: 6 } }} />
                  <Stack>
                    <Text styles={{ root: { fontSize: 13, fontWeight: 500 } }}>{gw.name}</Text>
                    <Text styles={{ root: { fontSize: 11, color: "#605e5c" } }}>
                      {gw.resourceGroup} | {gw.location} | {gw.sku}
                    </Text>
                  </Stack>
                  <span style={{ marginLeft: 8 }} className={`status-badge status-${gw.operationalState?.toLowerCase()}`}>
                    {gw.operationalState}
                  </span>
                </Stack>
              ))}
            </Stack>

            {/* Scan Button */}
            <Stack styles={{ root: { marginTop: 16 } }}>
              <PrimaryButton
                text={scanning ? "Scanning..." : `Scan ${selectedGateways.size} Gateway(s)`}
                onClick={runScan}
                disabled={scanning || selectedGateways.size === 0}
                iconProps={{ iconName: "Shield" }}
                styles={{
                  root: { height: 40, background: "linear-gradient(135deg, #e3008c, #8764b8)", border: "none", borderRadius: 8, maxWidth: 300 },
                  rootHovered: { background: "linear-gradient(135deg, #c4006e, #6b4fa0)" },
                }}
              />
            </Stack>
          </div>
        )}

        {gatewaysLoaded && allGateways.length === 0 && (
          <MessageBar messageBarType={MessageBarType.warning}>No Application Gateways found in this subscription.</MessageBar>
        )}
      </Stack>

      {scanning && (
        <ProgressIndicator label={scanProgress.label} percentComplete={scanProgress.percent / 100}
          styles={{ root: { marginTop: 20 } }} />
      )}

      {error && <MessageBar messageBarType={MessageBarType.error} styles={{ root: { marginTop: 16 } }}>{error}</MessageBar>}

      {/* Executive Summary */}
      {summary && (
        <div style={{
          marginTop: 24, padding: 24, borderRadius: 12,
          background: "linear-gradient(135deg, #1a1a2e, #16213e)",
          color: "white",
        }}>
          <Text styles={{ root: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700, letterSpacing: "2px" } }}>
            EXECUTIVE SUMMARY
          </Text>
          <Stack horizontal tokens={{ childrenGap: 32 }} styles={{ root: { marginTop: 16 } }} wrap>
            <Stack horizontalAlign="center">
              <div style={{
                width: 80, height: 80, borderRadius: "50%",
                background: `linear-gradient(135deg, ${getGrade(summary.avgScore).color}, ${getGrade(summary.avgScore).color}88)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 32, fontWeight: 800, boxShadow: `0 4px 20px ${getGrade(summary.avgScore).color}44`,
              }}>
                {getGrade(summary.avgScore).grade}
              </div>
              <Text styles={{ root: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 8 } }}>
                Overall Grade
              </Text>
            </Stack>
            <Stack tokens={{ childrenGap: 4 }}>
              <Text styles={{ root: { color: "white", fontSize: 28, fontWeight: 700 } }}>{summary.avgScore}/100</Text>
              <Text styles={{ root: { color: "rgba(255,255,255,0.5)", fontSize: 12 } }}>Average Score</Text>
            </Stack>
            <Stack tokens={{ childrenGap: 4 }}>
              <Text styles={{ root: { color: "white", fontSize: 28, fontWeight: 700 } }}>{summary.totalGateways}</Text>
              <Text styles={{ root: { color: "rgba(255,255,255,0.5)", fontSize: 12 } }}>Gateways Scanned</Text>
            </Stack>
            <Stack tokens={{ childrenGap: 4 }}>
              <Text styles={{ root: { color: "#ff6b6b", fontSize: 28, fontWeight: 700 } }}>{summary.criticalCount}</Text>
              <Text styles={{ root: { color: "rgba(255,255,255,0.5)", fontSize: 12 } }}>Critical Issues</Text>
            </Stack>
            <Stack tokens={{ childrenGap: 4 }}>
              <Text styles={{ root: { color: "#ffa94d", fontSize: 28, fontWeight: 700 } }}>{summary.highCount}</Text>
              <Text styles={{ root: { color: "rgba(255,255,255,0.5)", fontSize: 12 } }}>High Severity</Text>
            </Stack>
            <Stack tokens={{ childrenGap: 4 }}>
              <Text styles={{ root: { color: "#69db7c", fontSize: 28, fontWeight: 700 } }}>{summary.passCount}</Text>
              <Text styles={{ root: { color: "rgba(255,255,255,0.5)", fontSize: 12 } }}>Checks Passed</Text>
            </Stack>
          </Stack>
          <Text styles={{ root: { color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 16 } }}>
            Scanned on {summary.scanDate} | Based on OWASP Top 10:2021 + Azure Security Best Practices
          </Text>
        </div>
      )}

      {/* Per-Gateway Results */}
      {results.map((result) => (
        <div key={result.gateway} style={{
          marginTop: 20, background: "white", borderRadius: 12,
          border: "1px solid #edebe9", overflow: "hidden",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          {/* Gateway Header */}
          <Stack horizontal verticalAlign="center" tokens={{ padding: "20px 24px", childrenGap: 16 }}
            styles={{ root: { borderBottom: "1px solid #f3f2f1" } }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: `linear-gradient(135deg, ${result.gradeColor}, ${result.gradeColor}99)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontSize: 24, fontWeight: 800,
              boxShadow: `0 4px 12px ${result.gradeColor}33`,
            }}>
              {result.grade}
            </div>
            <Stack styles={{ root: { flex: 1 } }}>
              <Text styles={{ root: { fontSize: 18, fontWeight: 600 } }}>{result.gateway}</Text>
              <Text styles={{ root: { color: "#605e5c", fontSize: 12 } }}>
                {result.resourceGroup} | {result.location} | {result.sku}
              </Text>
            </Stack>
            <Stack horizontal tokens={{ childrenGap: 16 }}>
              <Stack horizontalAlign="center">
                <Text styles={{ root: { fontSize: 20, fontWeight: 700, color: result.gradeColor } }}>{result.score}</Text>
                <Text styles={{ root: { fontSize: 10, color: "#a19f9d" } }}>SCORE</Text>
              </Stack>
              <Stack horizontalAlign="center">
                <Text styles={{ root: { fontSize: 20, fontWeight: 700, color: "#107c10" } }}>
                  {result.checks.filter(c => c.status === "pass").length}
                </Text>
                <Text styles={{ root: { fontSize: 10, color: "#a19f9d" } }}>PASS</Text>
              </Stack>
              <Stack horizontalAlign="center">
                <Text styles={{ root: { fontSize: 20, fontWeight: 700, color: "#d13438" } }}>
                  {result.checks.filter(c => c.status === "fail").length}
                </Text>
                <Text styles={{ root: { fontSize: 10, color: "#a19f9d" } }}>FAIL</Text>
              </Stack>
              <Stack horizontalAlign="center">
                <Text styles={{ root: { fontSize: 20, fontWeight: 700, color: "#c19c00" } }}>
                  {result.checks.filter(c => c.status === "warn").length}
                </Text>
                <Text styles={{ root: { fontSize: 10, color: "#a19f9d" } }}>WARN</Text>
              </Stack>
            </Stack>
          </Stack>

          {/* WAF Policy Summary */}
          {result.wafPolicy && (
            <Stack tokens={{ padding: "12px 24px" }} styles={{
              root: { background: "#f8f8ff", borderBottom: "1px solid #f3f2f1" },
            }}>
              <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                <span style={{ fontSize: 16 }}>{"\uD83D\uDEE1\uFE0F"}</span>
                <Text styles={{ root: { fontWeight: 600, fontSize: 13 } }}>WAF Policy: {result.wafPolicy.name}</Text>
                <span style={{
                  background: result.wafPolicy.policyMode === "Prevention" ? "#dff6dd" : "#fed9cc",
                  color: result.wafPolicy.policyMode === "Prevention" ? "#107c10" : "#d13438",
                  fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                }}>
                  {result.wafPolicy.policyMode}
                </span>
                <Text styles={{ root: { color: "#605e5c", fontSize: 12 } }}>
                  | {result.wafPolicy.ruleSetType} {result.wafPolicy.ruleSetVersion}
                  | {result.wafPolicy.customRulesCount} custom rules
                </Text>
              </Stack>
            </Stack>
          )}

          {/* Categorized Checks */}
          <Pivot styles={{ root: { padding: "0 24px" } }}>
            <PivotItem headerText="All Findings" itemCount={result.checks.length}>
              <div style={{ padding: "8px 0" }}>
                {["fail", "warn", "info", "pass"].map(status => {
                  const filtered = result.checks.filter(c => c.status === status);
                  if (filtered.length === 0) return null;
                  return filtered.map((check, idx) => (
                    <Stack key={`${check.name}-${idx}`} tokens={{ padding: "10px 0" }}
                      styles={{ root: { borderBottom: "1px solid #f8f7f6" } }}>
                      <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                        <span style={{ fontSize: 14, width: 20 }}>{statusIcon(check.status)}</span>
                        <Text styles={{ root: { fontWeight: 600, fontSize: 13 } }}>{check.name}</Text>
                        <span style={{
                          ...sevColors[check.severity],
                          background: sevColors[check.severity]?.bg,
                          color: sevColors[check.severity]?.fg,
                          fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3,
                          textTransform: "uppercase" as const, letterSpacing: "0.5px",
                        }}>
                          {check.severity}
                        </span>
                        <Text styles={{ root: { color: "#a19f9d", fontSize: 11 } }}>{check.category}</Text>
                      </Stack>
                      <Text styles={{ root: { color: "#323130", fontSize: 13, marginTop: 2, paddingLeft: 28 } }}>
                        {check.message}
                      </Text>
                      {check.remediation && (
                        <Text styles={{ root: { color: "#0078d4", fontSize: 12, marginTop: 4, paddingLeft: 28 } }}>
                          {"\uD83D\uDCA1"} {check.remediation}
                        </Text>
                      )}
                      {check.reference && (
                        <Text styles={{ root: { color: "#a19f9d", fontSize: 11, marginTop: 2, paddingLeft: 28 } }}>
                          Ref: {check.reference}
                        </Text>
                      )}
                    </Stack>
                  ));
                })}
              </div>
            </PivotItem>

            {categories.map(cat => {
              const catChecks = result.checks.filter(c => c.category === cat);
              if (catChecks.length === 0) return null;
              return (
                <PivotItem key={cat} headerText={cat} itemCount={catChecks.length}>
                  <div style={{ padding: "8px 0" }}>
                    {catChecks.map((check, idx) => (
                      <Stack key={idx} tokens={{ padding: "10px 0" }}
                        styles={{ root: { borderBottom: "1px solid #f8f7f6" } }}>
                        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                          <span style={{ fontSize: 14, width: 20 }}>{statusIcon(check.status)}</span>
                          <Text styles={{ root: { fontWeight: 600, fontSize: 13 } }}>{check.name}</Text>
                          <span style={{
                            background: sevColors[check.severity]?.bg,
                            color: sevColors[check.severity]?.fg,
                            fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3,
                            textTransform: "uppercase" as const,
                          }}>
                            {check.severity}
                          </span>
                        </Stack>
                        <Text styles={{ root: { color: "#323130", fontSize: 13, marginTop: 2, paddingLeft: 28 } }}>
                          {check.message}
                        </Text>
                        {check.remediation && (
                          <Text styles={{ root: { color: "#0078d4", fontSize: 12, marginTop: 4, paddingLeft: 28 } }}>
                            {"\uD83D\uDCA1"} {check.remediation}
                          </Text>
                        )}
                      </Stack>
                    ))}
                  </div>
                </PivotItem>
              );
            })}
          </Pivot>
        </div>
      ))}
    </div>
  );
}
