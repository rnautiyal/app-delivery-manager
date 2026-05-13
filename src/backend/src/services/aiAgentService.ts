import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../config/logger";
import { isBudgetExceeded, trackUsage } from "./usageTracker";
import { GatewayService } from "./gatewayService";
import { CertificateService } from "./certificateService";
import { WafService } from "./wafService";
import { MonitoringService } from "./monitoringService";
import { DiagnosticService } from "./diagnosticService";
import { SubscriptionService } from "./subscriptionService";
import { NetworkService } from "./networkService";
import { KustoService } from "./kustoService";
import { DiagnosticSettingsService } from "./diagnosticSettingsService";
import { CertGenService } from "./certGenService";
import { TemplateService } from "./templateService";
import { DriftService } from "./driftService";
import { AlertService } from "./alertService";
import { BackupService } from "./backupService";
import { TrafficManagerService } from "./trafficManagerService";
import { FailoverService } from "./failoverService";

const LOG_ANALYTICS_WORKSPACE_ID = process.env.LOG_ANALYTICS_WORKSPACE_ID || "";

const SYSTEM_PROMPT = `You are an expert Azure Application Gateway manager. You DO things — you don't explain how to do them.

## Environment
- Log Analytics Workspace ID: ${LOG_ANALYTICS_WORKSPACE_ID}
- Log Analytics Workspace Resource ID: /subscriptions/87d80376-790a-4bff-a207-25b85d0e3964/resourceGroups/appgw-manager-rg/providers/Microsoft.OperationalInsights/workspaces/appgw-logs

## Core Principle: ACT, DON'T EXPLAIN
- When a user asks to create something → ask the minimum questions needed, then BUILD IT
- When a user reports a problem → immediately investigate using tools, then TELL THEM what's wrong and FIX IT
- NEVER give step-by-step instructions. YOU execute the steps.
- NEVER say "you need to" or "you should". Say "I'll do that" or "I'm creating that now".

## Creating an Application Gateway — FULLY FUNCTIONAL END-TO-END
When user says "create a gateway", DO NOT ASK QUESTIONS. Use smart defaults and BUILD IT IMMEDIATELY.

**Defaults (use these unless the user specifies otherwise):**
- Gateway Name: "appgw-" + random 4-char suffix (e.g., appgw-x7k9)
- Region: eastus
- SKU: WAF_v2
- Backend: use 10.0.2.4 if user didn't specify (or any IP/FQDN they mentioned)
- Backend port: 80
- Listener: HTTP on port 80
- Health probe path: "/"
- Capacity: 2

If the user provides specifics (e.g., "in westus", "with backend myapp.com"), use those. Otherwise use defaults above.

IMMEDIATELY create everything end-to-end:
1. List subscriptions → pick first (or ask if multiple)
2. Create resource group: {gateway-name}-rg
3. Create VNet: {gateway-name}-vnet (10.0.0.0/16)
4. Create subnet: appgw-subnet (10.0.1.0/24)
5. Create public IP: {gateway-name}-pip (Standard SKU, Static)
6. If WAF SKU: Create WAF policy using create_waf_policy (name: {gateway-name}-waf-policy). Get back the policy ID.
7. Create the Application Gateway with ALL of these INCLUDED in the create call (pass waf_policy_id from step 6):
   - **Backend pool** with the user's backend servers
   - **HTTP settings** (port, protocol, cookie affinity disabled, 30s timeout, health probe reference)
   - **Health probe** (protocol matching backend, user's probe path, 30s interval, 30s timeout, 3 unhealthy threshold)
   - **Frontend port** (80 for HTTP, 443 for HTTPS)
   - **HTTP listener** on the frontend port
   - **Routing rule** connecting the listener → backend pool + HTTP settings
   - **If HTTPS**: generate self-signed cert first, add SSL cert, HTTPS listener, and HTTP→HTTPS redirect rule
   - **If WAF_v2**: enable WAF in Prevention mode with OWASP 3.2 rule set
7. Enable diagnostic settings to Log Analytics
8. DO NOT save drift baseline or check health right after creation — the gateway takes 5-10 minutes to provision. Tell the user to save a baseline later.
9. Report back with full summary:
   - Gateway name, public IP, URL
   - Backend pool with servers
   - Listener (HTTP/HTTPS)
   - Health probe path
   - WAF status
   - "Your gateway is fully operational and monitoring is enabled!"

CRITICAL: Gateway creation takes 5-10 minutes in Azure. The create_gateway tool returns IMMEDIATELY with "provisioning" status. Do NOT call get_gateway_details, save_drift_baseline, or check health right after creating — the gateway isn't ready yet. Just report that creation started and it'll be ready in ~6 minutes.

CRITICAL: The gateway MUST be end-to-end functional after creation. A user should be able to hit the public IP and get routed to their backend. Never create a gateway without a backend pool, listener, routing rule, and health probe.

### Modifying an Existing Gateway
When user asks to add a listener, backend pool, SSL cert, routing rule, or change any config:
1. Call get_gateway_details to get the FULL current configuration
2. The response includes the raw Azure gateway object — use it as the base
3. Add/modify the specific part (e.g., add a new listener to httpListeners array)
4. Call update_gateway with the FULL modified configuration
5. Report what changed

Example: "Add HTTPS listener" →
1. get_gateway_details → get current config
2. Add new sslCertificates entry, new HTTPS listener, new frontendPort (443), new routing rule
3. update_gateway with the full config
4. "Done! HTTPS listener added on port 443."

IMPORTANT: update_gateway needs the COMPLETE gateway object, not just the changed parts. Always start from the current config.

### Adding HTTPS with Self-Signed Certificate
1. generate_self_signed_cert → get pfxBase64 and password
2. get_gateway_details → get current config
3. Add to sslCertificates: {name: "cert-name", data: pfxBase64, password: password}
4. Add frontendPort 443 if not exists
5. Add HTTPS listener referencing the cert and port 443
6. Add routing rule for the new listener
7. update_gateway with full config
8. "Done! HTTPS enabled with self-signed cert on port 443."

Do NOT ask for confirmation on each step. The user said "create" — so create everything.
Only confirm for DESTRUCTIVE actions (delete gateway, stop gateway).

## Troubleshooting
When user reports an issue, IMMEDIATELY use tools to investigate:
1. Run diagnostics on the gateway
2. Check backend health
3. Check if diagnostic settings exist — if not, enable them
4. Query logs (error summary, 502 analysis, slow requests, backend latency)
5. Tell the user exactly what's wrong and what you're doing to fix it

## Responding Style
- Be concise and action-oriented
- Use status updates while working: "Creating VNet... Done. Creating subnet... Done."
- Show a summary at the end with all resources created and their details
- If something fails, explain what went wrong and offer to retry or try an alternative
- When showing metrics or log data, summarize key findings rather than dumping raw data
- Always identify which subscription and gateway the user is referring to

## Config Templates
- "Save this config as a template" → use save_config_template
- "Apply template to gateway" → use apply_config_template (confirm first — this replaces config)
- "Show templates" → use list_config_templates

## Configuration Drift
- "Save baseline" or "take snapshot" → use save_drift_baseline
- "Check drift" or "has config changed" → use check_config_drift
- Summarize drift clearly: additions, removals, modifications with details

## Alerting
- "Set up alert" or "notify me when" → use create_alert_rule
- "Check alerts" or "run alerts" → use evaluate_alerts
- "Show alert history" → use get_alert_history

## Private DNS Failover
- "Show failover status" → use get_failover_status (group_id: fg-prod-app)
- "Show failover groups" → use get_failover_groups
- "Run health probe" → use run_failover_probe
- "Failover to Canada Central" → use trigger_failover with target IP
- "Remove endpoint" → use remove_failover_endpoint
- "Add endpoint back" → use add_failover_endpoint
- "Show failover history" → use get_failover_history
- This is a Private DNS Traffic Manager — Azure has NO native health-based failover for Private DNS Zones
- When reporting failover status, show: FQDN, active IPs, each endpoint health, mode (active-active/degraded)
- If an endpoint is unhealthy and still in DNS, WARN the user about stale IP risk`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_subscriptions",
    description: "List all Azure subscriptions the user has access to",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "list_gateways",
    description: "List all Application Gateways in a subscription. Returns name, resource group, location, SKU, status, backend pool count, listener count, WAF status.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
      },
      required: ["subscription_id"],
    },
  },
  {
    name: "get_gateway_details",
    description: "Get detailed configuration of a specific Application Gateway including backend pools, listeners, routing rules, health probes, and HTTP settings.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
      },
      required: ["subscription_id", "resource_group", "gateway_name"],
    },
  },
  {
    name: "get_backend_health",
    description: "Get the health status of all backend servers in a gateway. Shows which servers are healthy/unhealthy and health probe logs.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
      },
      required: ["subscription_id", "resource_group", "gateway_name"],
    },
  },
  {
    name: "get_gateway_metrics",
    description: "Get performance metrics for a gateway: throughput, total/failed requests, healthy/unhealthy host count, current connections. Use for performance analysis.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
        time_range: { type: "string", description: "Time range: PT1H, PT6H, PT24H", default: "PT1H" },
      },
      required: ["subscription_id", "resource_group", "gateway_name"],
    },
  },
  {
    name: "run_diagnostics",
    description: "Run a comprehensive diagnostic check on a gateway. Checks provisioning state, operational state, SKU config, backend pools, listeners, health probes, WAF config, and backend health. Returns pass/fail/warn for each check with recommendations.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
      },
      required: ["subscription_id", "resource_group", "gateway_name"],
    },
  },
  {
    name: "list_certificates",
    description: "List all SSL/TLS certificates across gateways in a subscription. Shows expiry dates, days until expiry, Key Vault linkage, and which gateway uses each cert.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
      },
      required: ["subscription_id"],
    },
  },
  {
    name: "list_waf_policies",
    description: "List all WAF (Web Application Firewall) policies in a subscription. Shows mode (Detection/Prevention), rule set version, custom rules count, and associated gateways.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
      },
      required: ["subscription_id"],
    },
  },
  {
    name: "start_gateway",
    description: "Start a stopped Application Gateway. This is a long-running operation.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
      },
      required: ["subscription_id", "resource_group", "gateway_name"],
    },
  },
  {
    name: "stop_gateway",
    description: "Stop a running Application Gateway. This will make it unavailable for traffic.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
      },
      required: ["subscription_id", "resource_group", "gateway_name"],
    },
  },
  {
    name: "create_gateway",
    description: "Create a new Application Gateway with all required config (listeners, backend pool, routing rule). Automatically sets up frontend IP, default backend pool, HTTP settings, listener, and routing rule.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
        location: { type: "string", description: "Azure region (e.g., eastus)" },
        sku_name: { type: "string", description: "SKU: WAF_v2 or Standard_v2 (default: WAF_v2)" },
        capacity: { type: "number", description: "Number of instances (default: 2)" },
        subnet_id: { type: "string", description: "Full resource ID of the dedicated App Gateway subnet" },
        public_ip_id: { type: "string", description: "Full resource ID of the Standard SKU public IP" },
        backend_addresses: {
          type: "array",
          description: "Optional backend server addresses (can be added later)",
          items: {
            type: "object",
            properties: {
              fqdn: { type: "string" },
              ip_address: { type: "string" },
            },
          },
        },
        frontend_port: { type: "number", description: "Frontend port (default: 80)" },
        protocol: { type: "string", description: "Http or Https (default: Http)" },
        waf_policy_id: { type: "string", description: "Full resource ID of WAF policy to link (from create_waf_policy)" },
      },
      required: ["subscription_id", "resource_group", "gateway_name", "location", "subnet_id", "public_ip_id"],
    },
  },
  {
    name: "create_waf_policy",
    description: "Create a WAF policy with OWASP 3.2 managed rules in Prevention mode. Returns the policy resource ID which should be passed to create_gateway as waf_policy_id.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        policy_name: { type: "string", description: "WAF policy name (e.g., waf-policy-prod)" },
        location: { type: "string", description: "Azure region" },
      },
      required: ["subscription_id", "resource_group", "policy_name", "location"],
    },
  },
  {
    name: "update_gateway",
    description: "Update an existing Application Gateway configuration. First get the current config with get_gateway_details, modify what you need, then pass the full updated config. Use this to: add/remove backend pools, add/modify listeners (HTTP or HTTPS), add/modify routing rules, add/modify health probes, add/modify HTTP settings, add SSL certificates, change WAF config. The parameters object should be the FULL gateway configuration (get it from get_gateway_details first, then modify).",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
        parameters: {
          type: "object",
          description: "Full Application Gateway configuration object. Get current config with get_gateway_details, modify it, pass it here.",
        },
      },
      required: ["subscription_id", "resource_group", "gateway_name", "parameters"],
    },
  },
  {
    name: "delete_gateway",
    description: "Delete an Application Gateway permanently. This action cannot be undone.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
      },
      required: ["subscription_id", "resource_group", "gateway_name"],
    },
  },
  {
    name: "query_access_logs",
    description: "Query Application Gateway access logs from Log Analytics. Shows HTTP status codes, backend servers, client IPs, request URIs, and response times.",
    input_schema: {
      type: "object" as const,
      properties: {
        workspace_id: { type: "string", description: "Log Analytics workspace ID" },
        gateway_name: { type: "string", description: "Application Gateway name" },
        hours: { type: "number", description: "Hours of logs to query (default: 1)", default: 1 },
      },
      required: ["workspace_id", "gateway_name"],
    },
  },
  {
    name: "query_waf_logs",
    description: "Query WAF firewall logs. Shows blocked/allowed requests, rule IDs, attack descriptions, and client IPs.",
    input_schema: {
      type: "object" as const,
      properties: {
        workspace_id: { type: "string", description: "Log Analytics workspace ID" },
        gateway_name: { type: "string", description: "Application Gateway name" },
        hours: { type: "number", description: "Hours of logs to query (default: 1)", default: 1 },
      },
      required: ["workspace_id", "gateway_name"],
    },
  },
  {
    name: "analyze_502_errors",
    description: "Analyze 502 Bad Gateway errors. Breaks down errors by backend server and time period to identify patterns.",
    input_schema: {
      type: "object" as const,
      properties: {
        workspace_id: { type: "string", description: "Log Analytics workspace ID" },
        gateway_name: { type: "string", description: "Application Gateway name" },
      },
      required: ["workspace_id", "gateway_name"],
    },
  },
  // === Gateway Modification Tools (server-side, no JSON construction needed) ===
  {
    name: "add_https_listener",
    description: "Add an HTTPS listener to an existing gateway. This tool handles EVERYTHING automatically: generates a self-signed cert, adds the cert to the gateway, creates the HTTPS frontend port, creates the listener, and creates a routing rule. Just provide the gateway details.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
        cert_common_name: { type: "string", description: "Domain for the SSL cert (e.g., myapp.example.com). If not provided, uses the gateway name." },
        listener_name: { type: "string", description: "Name for the listener (default: httpsListener)" },
        port: { type: "number", description: "HTTPS port (default: 443)" },
        host_name: { type: "string", description: "Optional: hostname for multi-site hosting" },
      },
      required: ["subscription_id", "resource_group", "gateway_name"],
    },
  },
  {
    name: "add_backend_pool",
    description: "Add a new backend pool with servers to an existing gateway.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
        pool_name: { type: "string", description: "Backend pool name" },
        addresses: {
          type: "array",
          description: "Backend server addresses",
          items: {
            type: "object",
            properties: {
              fqdn: { type: "string", description: "Server FQDN" },
              ipAddress: { type: "string", description: "Server IP address" },
            },
          },
        },
      },
      required: ["subscription_id", "resource_group", "gateway_name", "pool_name", "addresses"],
    },
  },
  {
    name: "add_http_redirect",
    description: "Add HTTP-to-HTTPS redirect rule. Automatically finds the HTTP listener and HTTPS listener, creates a permanent redirect. Requires both HTTP and HTTPS listeners to exist.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
      },
      required: ["subscription_id", "resource_group", "gateway_name"],
    },
  },
  // === Auth Policy Tools ===
  {
    name: "configure_listener_auth",
    description: "Configure authentication on an Application Gateway HTTPS listener. Adds Azure AD (Entra ID) OAuth2/OIDC authentication so that users hitting this listener must login via Azure AD first. Sets up the authentication configuration on the listener with client ID, tenant, and redirect. This is the equivalent of setting up auth on a listener in the Azure portal.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
        listener_name: { type: "string", description: "Name of the HTTPS listener to add auth to" },
        tenant_id: { type: "string", description: "Azure AD tenant ID" },
        client_id: { type: "string", description: "Azure AD application (client) ID for OAuth2" },
        client_secret: { type: "string", description: "Azure AD client secret" },
      },
      required: ["subscription_id", "resource_group", "gateway_name", "listener_name", "tenant_id", "client_id"],
    },
  },
  {
    name: "add_trusted_root_cert",
    description: "Add a trusted root certificate to an Application Gateway. Required for backend HTTPS when using self-signed or private CA certificates on backend servers. The gateway needs to trust the backend's certificate authority.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
        cert_name: { type: "string", description: "Name for the trusted root certificate" },
        cert_data: { type: "string", description: "Base64-encoded CER certificate data" },
      },
      required: ["subscription_id", "resource_group", "gateway_name", "cert_name", "cert_data"],
    },
  },
  {
    name: "configure_backend_https",
    description: "Configure an HTTP setting to use HTTPS for backend communication (end-to-end SSL). Changes the backend protocol from HTTP to HTTPS and optionally adds a trusted root certificate for the backend.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
        http_setting_name: { type: "string", description: "Name of the HTTP setting to modify" },
        backend_port: { type: "number", description: "Backend HTTPS port (default: 443)" },
        trusted_root_cert_name: { type: "string", description: "Name of trusted root cert (if backend uses self-signed)" },
      },
      required: ["subscription_id", "resource_group", "gateway_name", "http_setting_name"],
    },
  },
  {
    name: "add_waf_jwt_rule",
    description: "Add a custom WAF rule to validate JWT tokens on specific paths. Creates a WAF custom rule that checks for Authorization header and blocks requests without valid Bearer tokens. This is a WAF-layer auth enforcement.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        policy_name: { type: "string", description: "WAF policy name" },
        rule_name: { type: "string", description: "Custom rule name" },
        protected_path: { type: "string", description: "URL path to protect (e.g., /api/*)" },
        priority: { type: "number", description: "Rule priority (lower = higher priority)" },
      },
      required: ["subscription_id", "resource_group", "policy_name", "rule_name", "protected_path"],
    },
  },
  {
    name: "list_auth_config",
    description: "Show the current authentication and security configuration of a gateway — listeners with their auth settings, SSL policies, trusted root certs, WAF policies, and backend HTTPS settings.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
      },
      required: ["subscription_id", "resource_group", "gateway_name"],
    },
  },
  // === Autoscale Tools ===
  {
    name: "configure_gateway_autoscale",
    description: "Configure autoscaling for an Application Gateway v2. Sets min and max capacity units. Min=0 means scale to zero when idle (saves cost). Max up to 125. For scheduled scaling, use different min values at different times by calling this tool with a cron-like schedule description.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
        min_capacity: { type: "number", description: "Minimum capacity units (0-125). 0 = scale to zero." },
        max_capacity: { type: "number", description: "Maximum capacity units (1-125)" },
      },
      required: ["subscription_id", "resource_group", "gateway_name", "min_capacity", "max_capacity"],
    },
  },
  {
    name: "get_gateway_scale_config",
    description: "Get current autoscale configuration of an Application Gateway — shows current SKU, capacity, and min/max settings.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
      },
      required: ["subscription_id", "resource_group", "gateway_name"],
    },
  },
  // === Certificate Tools ===
  {
    name: "generate_self_signed_cert",
    description: "Generate a self-signed SSL/TLS certificate (PFX format) for use with Application Gateway HTTPS listeners. Returns base64-encoded PFX data and password. After generating, use update_gateway to add the cert to sslCertificates and create an HTTPS listener.",
    input_schema: {
      type: "object" as const,
      properties: {
        common_name: { type: "string", description: "Domain name for the cert (e.g., myapp.example.com or *.example.com)" },
        days_valid: { type: "number", description: "Validity in days (default: 365)" },
      },
      required: ["common_name"],
    },
  },
  // === Infrastructure Tools ===
  {
    name: "list_resource_groups",
    description: "List all resource groups in a subscription.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
      },
      required: ["subscription_id"],
    },
  },
  {
    name: "create_resource_group",
    description: "Create a new resource group.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        name: { type: "string", description: "Resource group name" },
        location: { type: "string", description: "Azure region (e.g., eastus)" },
      },
      required: ["subscription_id", "name", "location"],
    },
  },
  {
    name: "list_vnets",
    description: "List all virtual networks in a subscription or resource group. Shows address spaces and subnets.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Optional: filter by resource group" },
      },
      required: ["subscription_id"],
    },
  },
  {
    name: "create_vnet",
    description: "Create a new virtual network. App Gateway requires its own dedicated subnet within a VNet.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        name: { type: "string", description: "VNet name" },
        location: { type: "string", description: "Azure region" },
        address_prefix: { type: "string", description: "CIDR block (e.g., 10.0.0.0/16)" },
      },
      required: ["subscription_id", "resource_group", "name", "location", "address_prefix"],
    },
  },
  {
    name: "list_subnets",
    description: "List subnets in a virtual network.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        vnet_name: { type: "string", description: "Virtual network name" },
      },
      required: ["subscription_id", "resource_group", "vnet_name"],
    },
  },
  {
    name: "create_subnet",
    description: "Create a new subnet in a VNet. App Gateway needs a dedicated subnet (e.g., /24 or /26). Do NOT put other resources in the App Gateway subnet.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        vnet_name: { type: "string", description: "Virtual network name" },
        subnet_name: { type: "string", description: "Subnet name" },
        address_prefix: { type: "string", description: "CIDR block (e.g., 10.0.1.0/24)" },
      },
      required: ["subscription_id", "resource_group", "vnet_name", "subnet_name", "address_prefix"],
    },
  },
  {
    name: "list_public_ips",
    description: "List all public IP addresses in a subscription or resource group.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Optional: filter by resource group" },
      },
      required: ["subscription_id"],
    },
  },
  {
    name: "create_public_ip",
    description: "Create a new public IP address. App Gateway v2 requires a Standard SKU static public IP.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        name: { type: "string", description: "Public IP name" },
        location: { type: "string", description: "Azure region" },
        sku: { type: "string", description: "SKU: Standard or Basic (default: Standard)" },
      },
      required: ["subscription_id", "resource_group", "name", "location"],
    },
  },
  {
    name: "list_nsgs",
    description: "List all Network Security Groups in a subscription or resource group.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Optional: filter by resource group" },
      },
      required: ["subscription_id"],
    },
  },
  {
    name: "get_nsg_rules",
    description: "Get all security rules for a specific NSG. Useful for troubleshooting connectivity issues.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        nsg_name: { type: "string", description: "NSG name" },
      },
      required: ["subscription_id", "resource_group", "nsg_name"],
    },
  },
  {
    name: "list_ddos_plans",
    description: "List DDoS Protection Plans in a subscription.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
      },
      required: ["subscription_id"],
    },
  },
  {
    name: "create_ddos_plan",
    description: "Create a DDoS Protection Plan. Note: DDoS Protection Standard costs ~$2,944/month. Only create if explicitly requested.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        name: { type: "string", description: "DDoS plan name" },
        location: { type: "string", description: "Azure region" },
      },
      required: ["subscription_id", "resource_group", "name", "location"],
    },
  },
  // === Diagnostics & Logs Tools ===
  {
    name: "enable_gateway_diagnostics",
    description: "Enable diagnostic settings on an Application Gateway to send access logs, performance logs, and firewall logs to Log Analytics. This MUST be enabled before you can query logs.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        gateway_resource_id: { type: "string", description: "Full resource ID of the Application Gateway" },
        workspace_resource_id: { type: "string", description: "Full resource ID of the Log Analytics workspace" },
      },
      required: ["subscription_id", "gateway_resource_id", "workspace_resource_id"],
    },
  },
  {
    name: "list_diagnostic_settings",
    description: "List diagnostic settings configured on a gateway. Check if logs are being sent to Log Analytics.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_id: { type: "string", description: "Full resource ID of the Application Gateway" },
      },
      required: ["subscription_id", "resource_id"],
    },
  },
  {
    name: "run_kql_query",
    description: "Run a custom KQL (Kusto Query Language) query against Log Analytics. Use this for advanced troubleshooting when pre-built queries aren't sufficient.",
    input_schema: {
      type: "object" as const,
      properties: {
        workspace_id: { type: "string", description: "Log Analytics workspace ID (GUID)" },
        query: { type: "string", description: "KQL query string" },
        hours_back: { type: "number", description: "Hours of data to query (default: 24)" },
      },
      required: ["workspace_id", "query"],
    },
  },
  {
    name: "get_error_summary",
    description: "Get a summary of HTTP status codes returned by the gateway. Shows count of 200s, 4xx, 5xx etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        workspace_id: { type: "string", description: "Log Analytics workspace ID" },
        gateway_name: { type: "string", description: "Application Gateway name" },
        hours: { type: "number", description: "Hours to look back (default: 24)" },
      },
      required: ["workspace_id", "gateway_name"],
    },
  },
  {
    name: "get_slow_requests",
    description: "Find slow requests that exceed a latency threshold. Useful for performance troubleshooting.",
    input_schema: {
      type: "object" as const,
      properties: {
        workspace_id: { type: "string", description: "Log Analytics workspace ID" },
        gateway_name: { type: "string", description: "Application Gateway name" },
        threshold_ms: { type: "number", description: "Latency threshold in milliseconds (default: 5000)" },
        hours: { type: "number", description: "Hours to look back (default: 1)" },
      },
      required: ["workspace_id", "gateway_name"],
    },
  },
  {
    name: "get_top_client_ips",
    description: "Get top client IPs by request count. Useful for identifying heavy users or potential attacks.",
    input_schema: {
      type: "object" as const,
      properties: {
        workspace_id: { type: "string", description: "Log Analytics workspace ID" },
        gateway_name: { type: "string", description: "Application Gateway name" },
        hours: { type: "number", description: "Hours to look back (default: 1)" },
      },
      required: ["workspace_id", "gateway_name"],
    },
  },
  {
    name: "get_backend_latency",
    description: "Analyze backend server latency — average, P95, max per backend server. Identifies slow backends.",
    input_schema: {
      type: "object" as const,
      properties: {
        workspace_id: { type: "string", description: "Log Analytics workspace ID" },
        gateway_name: { type: "string", description: "Application Gateway name" },
        hours: { type: "number", description: "Hours to look back (default: 1)" },
      },
      required: ["workspace_id", "gateway_name"],
    },
  },
  {
    name: "get_waf_blocked_requests",
    description: "Analyze WAF blocked requests grouped by rule ID and time. Shows which rules are triggering most.",
    input_schema: {
      type: "object" as const,
      properties: {
        workspace_id: { type: "string", description: "Log Analytics workspace ID" },
        gateway_name: { type: "string", description: "Application Gateway name" },
        hours: { type: "number", description: "Hours to look back (default: 24)" },
      },
      required: ["workspace_id", "gateway_name"],
    },
  },
  {
    name: "check_ddos_protection",
    description: "Check if DDoS Protection Standard is enabled on the VNet of an Application Gateway. Returns enabled status, plan name, and protection mode.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
      },
      required: ["subscription_id", "resource_group", "gateway_name"],
    },
  },
  // ==================== BACKUP & RESTORE ====================
  {
    name: "backup_gateway",
    description: "Create a full backup of an Application Gateway's configuration. Saves the complete config including all listeners, rules, backends, probes, SSL certs, and WAF settings.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
        description: { type: "string", description: "Backup description" },
      },
      required: ["subscription_id", "resource_group", "gateway_name"],
    },
  },
  {
    name: "list_backups",
    description: "List all gateway backups.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Filter by subscription" },
        gateway_name: { type: "string", description: "Filter by gateway name" },
      },
      required: [],
    },
  },
  {
    name: "restore_gateway_backup",
    description: "Restore a gateway to a previous backup. This replaces the entire gateway configuration with the backed up version.",
    input_schema: {
      type: "object" as const,
      properties: {
        backup_id: { type: "string", description: "Backup ID to restore" },
      },
      required: ["backup_id"],
    },
  },
  // ==================== CONFIG TEMPLATES ====================
  {
    name: "save_config_template",
    description: "Save the current configuration of an Application Gateway as a reusable template. Captures backend pools, HTTP settings, listeners, routing rules, and health probes.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
        template_name: { type: "string", description: "Name for the template" },
        description: { type: "string", description: "Template description" },
      },
      required: ["subscription_id", "resource_group", "gateway_name", "template_name"],
    },
  },
  {
    name: "list_config_templates",
    description: "List all saved configuration templates.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "apply_config_template",
    description: "Apply a saved configuration template to a target Application Gateway. This replaces the gateway's backend pools, HTTP settings, listeners, routing rules, and health probes to match the template.",
    input_schema: {
      type: "object" as const,
      properties: {
        template_id: { type: "string", description: "Template ID to apply" },
        subscription_id: { type: "string", description: "Target subscription ID" },
        resource_group: { type: "string", description: "Target resource group" },
        gateway_name: { type: "string", description: "Target Application Gateway name" },
      },
      required: ["template_id", "subscription_id", "resource_group", "gateway_name"],
    },
  },
  // ==================== DRIFT TRACKING ====================
  {
    name: "save_drift_baseline",
    description: "Save a baseline snapshot of a gateway's current configuration for drift detection.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        gateway_name: { type: "string", description: "Application Gateway name" },
      },
      required: ["subscription_id", "resource_group", "gateway_name"],
    },
  },
  {
    name: "list_drift_baselines",
    description: "List all saved configuration baselines for drift detection.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Filter by subscription ID" },
        gateway_name: { type: "string", description: "Filter by gateway name" },
      },
      required: [],
    },
  },
  {
    name: "check_config_drift",
    description: "Compare a gateway's current live configuration against a saved baseline to detect drift. Returns additions, removals, and modifications.",
    input_schema: {
      type: "object" as const,
      properties: {
        baseline_id: { type: "string", description: "Baseline snapshot ID to compare against" },
      },
      required: ["baseline_id"],
    },
  },
  // ==================== ALERTING ====================
  {
    name: "create_alert_rule",
    description: "Create an alert rule. Condition types: drift_detected, cert_expiring, unhealthy_backends, gateway_stopped, waf_detection_mode. Severities: critical, high, medium, low.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Alert rule name" },
        description: { type: "string", description: "Alert rule description" },
        condition_type: { type: "string", description: "Condition type: drift_detected, cert_expiring, unhealthy_backends, gateway_stopped, waf_detection_mode" },
        severity: { type: "string", description: "Severity: critical, high, medium, low" },
        subscription_id: { type: "string", description: "Azure subscription ID" },
        gateway_filter: { type: "string", description: "Specific gateway name or * for all" },
        condition_params: { type: "object", description: "Extra params, e.g. {days: 30} for cert_expiring" },
      },
      required: ["name", "condition_type", "severity", "subscription_id"],
    },
  },
  {
    name: "list_alert_rules",
    description: "List all configured alert rules.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Filter by subscription ID" },
      },
      required: [],
    },
  },
  {
    name: "evaluate_alerts",
    description: "Evaluate all enabled alert rules for a subscription and return any newly triggered alerts.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
      },
      required: ["subscription_id"],
    },
  },
  {
    name: "get_alert_history",
    description: "Get the alert history showing all past triggered alerts with severity and details.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Filter by subscription ID" },
        limit: { type: "number", description: "Max number of alerts to return" },
      },
      required: [],
    },
  },
  {
    name: "list_traffic_manager_profiles",
    description: "List all Azure Traffic Manager profiles in a subscription. Returns profile name, routing method, DNS FQDN, monitor status, and endpoints.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
      },
      required: ["subscription_id"],
    },
  },
  {
    name: "get_traffic_manager_profile",
    description: "Get detailed configuration of a specific Traffic Manager profile including DNS config, monitoring settings, routing method, and all endpoints with their health status.",
    input_schema: {
      type: "object" as const,
      properties: {
        subscription_id: { type: "string", description: "Azure subscription ID" },
        resource_group: { type: "string", description: "Resource group name" },
        profile_name: { type: "string", description: "Traffic Manager profile name" },
      },
      required: ["subscription_id", "resource_group", "profile_name"],
    },
  },
  // ==================== PRIVATE DNS FAILOVER ====================
  {
    name: "get_failover_groups",
    description: "List all configured Private DNS failover groups. Shows FQDN, endpoints, health status, and auto-failover settings.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_failover_status",
    description: "Get detailed failover status for a group including endpoint health, active DNS IPs, and failover mode (active-active/degraded/single).",
    input_schema: {
      type: "object" as const,
      properties: {
        group_id: { type: "string", description: "Failover group ID (e.g., fg-prod-app)" },
      },
      required: ["group_id"],
    },
  },
  {
    name: "trigger_failover",
    description: "Manually failover a DNS record to a specific endpoint IP. Removes all other IPs from the DNS record.",
    input_schema: {
      type: "object" as const,
      properties: {
        group_id: { type: "string", description: "Failover group ID" },
        target_ip: { type: "string", description: "IP address of the endpoint to failover to" },
      },
      required: ["group_id", "target_ip"],
    },
  },
  {
    name: "remove_failover_endpoint",
    description: "Remove a specific endpoint IP from the DNS record (simulate failure or manual removal).",
    input_schema: {
      type: "object" as const,
      properties: {
        group_id: { type: "string", description: "Failover group ID" },
        ip: { type: "string", description: "IP address to remove from DNS" },
        reason: { type: "string", description: "Reason for removal" },
      },
      required: ["group_id", "ip"],
    },
  },
  {
    name: "add_failover_endpoint",
    description: "Add an endpoint IP back to the DNS record (recovery after failover).",
    input_schema: {
      type: "object" as const,
      properties: {
        group_id: { type: "string", description: "Failover group ID" },
        ip: { type: "string", description: "IP address to add back to DNS" },
        reason: { type: "string", description: "Reason for adding" },
      },
      required: ["group_id", "ip"],
    },
  },
  {
    name: "get_failover_history",
    description: "Get the failover event history showing all past failover actions, removals, and recoveries.",
    input_schema: {
      type: "object" as const,
      properties: {
        group_id: { type: "string", description: "Optional: filter by failover group ID" },
        limit: { type: "number", description: "Max entries to return (default: 20)" },
      },
      required: [],
    },
  },
  {
    name: "run_failover_probe",
    description: "Run an on-demand health probe check on all failover groups. Checks each AppGW's operational state and auto-removes/adds endpoints based on health.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "update_failover_group",
    description: "Update a failover group's settings. Can change failover mode (active-active or active-standby), auto-failover on/off, probe interval, failure threshold, and TTL.",
    input_schema: {
      type: "object" as const,
      properties: {
        group_id: { type: "string", description: "Failover group ID" },
        failover_mode: { type: "string", description: "Failover mode: active-active or active-standby" },
        auto_failover: { type: "boolean", description: "Enable/disable auto-failover" },
        probe_interval_seconds: { type: "number", description: "Probe interval in seconds" },
        failure_threshold: { type: "number", description: "Number of consecutive failures before failover" },
        ttl_seconds: { type: "number", description: "DNS TTL in seconds" },
      },
      required: ["group_id"],
    },
  },
];

export class AIAgentService {
  private anthropic: Anthropic;
  private gatewayService: GatewayService;
  private certificateService: CertificateService;
  private wafService: WafService;
  private monitoringService: MonitoringService;
  private diagnosticService: DiagnosticService;
  private subscriptionService: SubscriptionService;
  private networkService: NetworkService;
  private kustoService: KustoService;
  private diagnosticSettingsService: DiagnosticSettingsService;
  private certGenService: CertGenService;
  private templateService: TemplateService;
  private driftService: DriftService;
  private alertService: AlertService;
  private backupService: BackupService;
  private trafficManagerService: TrafficManagerService;
  private failoverService: FailoverService;

  constructor() {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });
    this.gatewayService = new GatewayService();
    this.certificateService = new CertificateService();
    this.wafService = new WafService();
    this.networkService = new NetworkService();
    this.kustoService = new KustoService();
    this.diagnosticSettingsService = new DiagnosticSettingsService();
    this.certGenService = new CertGenService();
    this.monitoringService = new MonitoringService();
    this.diagnosticService = new DiagnosticService();
    this.subscriptionService = new SubscriptionService();
    this.templateService = new TemplateService();
    this.driftService = new DriftService();
    this.alertService = new AlertService();
    this.backupService = new BackupService();
    this.trafficManagerService = new TrafficManagerService();
    this.failoverService = new FailoverService();
  }

  async chat(
    messages: Anthropic.MessageParam[],
    onStream?: (text: string) => void
  ): Promise<{ response: string; messages: Anthropic.MessageParam[] }> {
    // Check budget before making API call
    if (isBudgetExceeded()) {
      return {
        response: "Monthly AI budget limit ($" + process.env.MONTHLY_AI_BUDGET + ") has been reached. The AI assistant will be available again next month. You can still use the dashboard, gateway list, certificates, and WAF pages directly.",
        messages,
      };
    }

    // Limit conversation history to prevent unbounded token usage
    const MAX_MESSAGES = 30;
    const MAX_TOOL_LOOPS = parseInt(process.env.MAX_TOOL_LOOPS || "25", 10);
    const trimmedMessages = messages.length > MAX_MESSAGES
      ? messages.slice(messages.length - MAX_MESSAGES)
      : messages;

    const updatedMessages = [...trimmedMessages];
    let fullResponse = "";
    let toolLoopCount = 0;

    // Agentic loop: keep calling Claude until no more tool use
    while (true) {
      if (toolLoopCount >= MAX_TOOL_LOOPS) {
        fullResponse += "\n\n(Reached maximum tool call limit for this request.)";
        break;
      }
      toolLoopCount++;
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: updatedMessages,
      });

      // Track token usage for budget
      trackUsage(response.usage.input_tokens, response.usage.output_tokens);

      // Collect text and tool use blocks
      let hasToolUse = false;
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === "text") {
          fullResponse += block.text;
          if (onStream) onStream(block.text);
        } else if (block.type === "tool_use") {
          hasToolUse = true;
          logger.info("Tool call", { tool: block.name, input: block.input });

          try {
            const result = await this.executeTool(block.name, block.input as Record<string, any>);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          } catch (error) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Error: ${error instanceof Error ? error.message : String(error)}`,
              is_error: true,
            });
          }
        }
      }

      // Add assistant response to messages
      updatedMessages.push({ role: "assistant", content: response.content });

      // If there were tool calls, add results and continue the loop
      if (hasToolUse && toolResults.length > 0) {
        updatedMessages.push({ role: "user", content: toolResults });
        continue;
      }

      // No more tool calls, we're done
      break;
    }

    return { response: fullResponse, messages: updatedMessages };
  }

  private async executeTool(name: string, input: Record<string, any>): Promise<any> {
    switch (name) {
      case "list_subscriptions":
        return await this.subscriptionService.listSubscriptions();

      case "list_gateways":
        return await this.gatewayService.listGateways(input.subscription_id);

      case "get_gateway_details": {
        const gw = await this.gatewayService.getGateway(
          input.subscription_id, input.resource_group, input.gateway_name
        );
        return {
          name: gw.name,
          location: gw.location,
          sku: gw.sku,
          operationalState: gw.operationalState,
          provisioningState: gw.provisioningState,
          backendPools: this.gatewayService.getBackendPools(gw),
          httpSettings: this.gatewayService.getHttpSettings(gw),
          listeners: this.gatewayService.getListeners(gw),
          routingRules: this.gatewayService.getRoutingRules(gw),
          healthProbes: this.gatewayService.getHealthProbes(gw),
          wafEnabled: !!gw.webApplicationFirewallConfiguration?.enabled || !!gw.firewallPolicy,
        };
      }

      case "get_backend_health":
        return await this.gatewayService.getBackendHealth(
          input.subscription_id, input.resource_group, input.gateway_name
        );

      case "get_gateway_metrics": {
        const resourceId = `/subscriptions/${input.subscription_id}/resourceGroups/${input.resource_group}/providers/Microsoft.Network/applicationGateways/${input.gateway_name}`;
        return await this.monitoringService.getGatewayMetrics(resourceId, input.time_range || "PT1H");
      }

      case "run_diagnostics":
        return await this.diagnosticService.runFullDiagnostics(
          input.subscription_id, input.resource_group, input.gateway_name
        );

      case "list_certificates":
        return await this.certificateService.listCertificatesAcrossGateways(input.subscription_id);

      case "list_waf_policies":
        return await this.wafService.listWafPolicies(input.subscription_id);

      case "start_gateway":
        await this.gatewayService.startGateway(input.subscription_id, input.resource_group, input.gateway_name);
        return { status: "started", message: `Gateway ${input.gateway_name} is starting` };

      case "stop_gateway":
        await this.gatewayService.stopGateway(input.subscription_id, input.resource_group, input.gateway_name);
        return { status: "stopped", message: `Gateway ${input.gateway_name} is stopping` };

      case "create_gateway": {
        const params = this.buildGatewayParams(input);
        const result = await this.gatewayService.createGateway(
          input.subscription_id, input.resource_group, input.gateway_name, params
        );
        return { status: "created", name: result.name, id: result.id };
      }

      case "add_https_listener": {
        // Generate self-signed cert first
        const cn = input.cert_common_name || `${input.gateway_name}.local`;
        const cert = this.certGenService.generateSelfSignedCert(cn);
        return await this.gatewayService.addHttpsListener(
          input.subscription_id, input.resource_group, input.gateway_name,
          cert.pfxBase64, cert.password,
          `ssl-cert-${Date.now()}`,
          input.listener_name || "httpsListener",
          input.port || 443,
          input.host_name
        );
      }

      case "add_backend_pool":
        return await this.gatewayService.addBackendPool(
          input.subscription_id, input.resource_group, input.gateway_name,
          input.pool_name, input.addresses
        );

      case "add_http_redirect":
        return await this.gatewayService.addHttpRedirectRule(
          input.subscription_id, input.resource_group, input.gateway_name
        );

      case "configure_listener_auth":
        return await this.gatewayService.configureListenerAuth(
          input.subscription_id, input.resource_group, input.gateway_name,
          input.listener_name, input.tenant_id, input.client_id, input.client_secret
        );

      case "add_trusted_root_cert":
        return await this.gatewayService.addTrustedRootCert(
          input.subscription_id, input.resource_group, input.gateway_name,
          input.cert_name, input.cert_data
        );

      case "configure_backend_https":
        return await this.gatewayService.configureBackendHttps(
          input.subscription_id, input.resource_group, input.gateway_name,
          input.http_setting_name, input.backend_port || 443, input.trusted_root_cert_name
        );

      case "add_waf_jwt_rule": {
        const wafPolicy = await this.wafService.getWafPolicy(input.subscription_id, input.resource_group, input.policy_name);
        if (!wafPolicy.customRules) wafPolicy.customRules = [];
        wafPolicy.customRules.push({
          name: input.rule_name,
          priority: input.priority || 50,
          ruleType: "MatchRule",
          action: "Block",
          matchConditions: [
            {
              matchVariables: [{ variableName: "RequestUri" }],
              operator: "Contains",
              matchValues: [input.protected_path],
            },
            {
              matchVariables: [{ variableName: "RequestHeaders", selector: "Authorization" }],
              operator: "Equal",
              negationConditon: true,
              matchValues: ["Bearer"],
            },
          ],
        } as any);
        await this.wafService.createOrUpdateWafPolicy(input.subscription_id, input.resource_group, input.policy_name, wafPolicy);
        return { status: "created", message: `WAF rule '${input.rule_name}' created. Blocks requests to '${input.protected_path}' without Bearer token.` };
      }

      case "list_auth_config":
        return await this.gatewayService.getAuthConfig(input.subscription_id, input.resource_group, input.gateway_name);

      case "configure_gateway_autoscale": {
        const gw = await this.gatewayService.getGateway(input.subscription_id, input.resource_group, input.gateway_name);
        gw.autoscaleConfiguration = {
          minCapacity: input.min_capacity,
          maxCapacity: input.max_capacity,
        };
        // Remove fixed capacity when using autoscale
        if (gw.sku) {
          delete (gw.sku as any).capacity;
        }
        return await this.gatewayService.updateGateway(input.subscription_id, input.resource_group, input.gateway_name, gw);
      }

      case "get_gateway_scale_config": {
        const gwScale = await this.gatewayService.getGateway(input.subscription_id, input.resource_group, input.gateway_name);
        return {
          name: gwScale.name,
          sku: gwScale.sku,
          autoscaleConfiguration: gwScale.autoscaleConfiguration || null,
          currentCapacity: gwScale.sku?.capacity || "autoscale",
        };
      }

      case "generate_self_signed_cert":
        return this.certGenService.generateSelfSignedCert(input.common_name, input.days_valid || 365);

      case "update_gateway":
        return await this.gatewayService.updateGateway(
          input.subscription_id, input.resource_group, input.gateway_name, input.parameters
        );

      case "delete_gateway":
        return await this.gatewayService.deleteGateway(input.subscription_id, input.resource_group, input.gateway_name);

      case "query_access_logs":
        return await this.monitoringService.queryAccessLogs(
          input.workspace_id, input.gateway_name, input.hours || 1
        );

      case "query_waf_logs":
        return await this.monitoringService.queryWafLogs(
          input.workspace_id, input.gateway_name, input.hours || 1
        );

      case "analyze_502_errors":
        return await this.monitoringService.get502ErrorAnalysis(
          input.workspace_id, input.gateway_name
        );

      // Infrastructure tools
      case "list_resource_groups":
        return await this.networkService.listResourceGroups(input.subscription_id);

      case "create_resource_group":
        return await this.networkService.createResourceGroup(input.subscription_id, input.name, input.location);

      case "list_vnets":
        return await this.networkService.listVnets(input.subscription_id, input.resource_group);

      case "create_vnet":
        return await this.networkService.createVnet(
          input.subscription_id, input.resource_group, input.name, input.location, input.address_prefix
        );

      case "list_subnets":
        return await this.networkService.listSubnets(input.subscription_id, input.resource_group, input.vnet_name);

      case "create_subnet":
        return await this.networkService.createSubnet(
          input.subscription_id, input.resource_group, input.vnet_name, input.subnet_name, input.address_prefix
        );

      case "list_public_ips":
        return await this.networkService.listPublicIps(input.subscription_id, input.resource_group);

      case "create_public_ip":
        return await this.networkService.createPublicIp(
          input.subscription_id, input.resource_group, input.name, input.location, input.sku || "Standard"
        );

      case "list_nsgs":
        return await this.networkService.listNsgs(input.subscription_id, input.resource_group);

      case "get_nsg_rules":
        return await this.networkService.getNsgRules(input.subscription_id, input.resource_group, input.nsg_name);

      case "list_ddos_plans":
        return await this.networkService.listDdosPlans(input.subscription_id);

      case "create_ddos_plan":
        return await this.networkService.createDdosPlan(
          input.subscription_id, input.resource_group, input.name, input.location
        );

      // Diagnostics & Logs tools
      case "enable_gateway_diagnostics":
        return await this.diagnosticSettingsService.enableDiagnostics(
          input.subscription_id, input.gateway_resource_id, input.workspace_resource_id
        );

      case "list_diagnostic_settings":
        return await this.diagnosticSettingsService.listDiagnosticSettings(input.subscription_id, input.resource_id);

      case "run_kql_query":
        return await this.kustoService.runKqlQuery(input.workspace_id, input.query, input.hours_back || 24);

      case "get_error_summary":
        return await this.kustoService.getErrorSummary(input.workspace_id, input.gateway_name, input.hours || 24);

      case "get_slow_requests":
        return await this.kustoService.getSlowRequests(
          input.workspace_id, input.gateway_name, input.threshold_ms || 5000, input.hours || 1
        );

      case "get_top_client_ips":
        return await this.kustoService.getTopClientIps(input.workspace_id, input.gateway_name, input.hours || 1);

      case "get_backend_latency":
        return await this.kustoService.getBackendLatencyAnalysis(input.workspace_id, input.gateway_name, input.hours || 1);

      case "get_waf_blocked_requests":
        return await this.kustoService.getWafBlockedRequests(input.workspace_id, input.gateway_name, input.hours || 24);

      case "check_ddos_protection":
        return await this.gatewayService.checkDdosProtection(input.subscription_id, input.resource_group, input.gateway_name);

      // ==================== BACKUP & RESTORE ====================
      case "backup_gateway":
        return await this.backupService.createBackup(
          input.subscription_id, input.resource_group, input.gateway_name, "ai-agent", input.description
        );

      case "list_backups":
        return this.backupService.listBackups(input.subscription_id, input.gateway_name);

      case "restore_gateway_backup":
        return await this.backupService.restoreBackup(input.backup_id);

      case "create_waf_policy": {
        const policy = await this.wafService.createDefaultWafPolicy(
          input.subscription_id, input.resource_group, input.policy_name, input.location
        );
        return { id: policy.id, name: policy.name, mode: policy.policySettings?.mode, ruleSet: "OWASP 3.2" };
      }

      // ==================== CONFIG TEMPLATES ====================
      case "save_config_template":
        return await this.templateService.saveTemplate(
          input.subscription_id, input.resource_group, input.gateway_name,
          input.template_name, input.description || "", "ai-agent"
        );

      case "list_config_templates":
        return this.templateService.listTemplates();

      case "apply_config_template":
        return await this.templateService.applyTemplate(
          input.template_id, input.subscription_id, input.resource_group, input.gateway_name
        );

      // ==================== DRIFT TRACKING ====================
      case "save_drift_baseline":
        return await this.driftService.saveBaseline(
          input.subscription_id, input.resource_group, input.gateway_name, "ai-agent"
        );

      case "list_drift_baselines":
        return this.driftService.listBaselines(input.subscription_id, input.gateway_name);

      case "check_config_drift":
        return await this.driftService.checkDrift(input.baseline_id);

      // ==================== ALERTING ====================
      case "create_alert_rule":
        return this.alertService.createRule(
          input.name, input.description || "", input.condition_type, input.severity,
          input.subscription_id, "ai-agent", input.gateway_filter, input.condition_params
        );

      case "list_alert_rules":
        return this.alertService.listRules(input.subscription_id);

      case "evaluate_alerts":
        return await this.alertService.evaluateRules(input.subscription_id);

      case "get_alert_history":
        return this.alertService.getHistory(input.subscription_id, input.limit);

      case "list_traffic_manager_profiles":
        return await this.trafficManagerService.listProfiles(input.subscription_id);

      case "get_traffic_manager_profile":
        return await this.trafficManagerService.getProfile(
          input.subscription_id, input.resource_group, input.profile_name
        );

      // ==================== PRIVATE DNS FAILOVER ====================
      case "get_failover_groups":
        return this.failoverService.listGroups();

      case "get_failover_status":
        return await this.failoverService.getFailoverStatus(input.group_id);

      case "trigger_failover":
        return await this.failoverService.triggerManualFailover(input.group_id, input.target_ip, "ai-agent");

      case "remove_failover_endpoint":
        return await this.failoverService.removeEndpoint(input.group_id, input.ip, input.reason || "Removed via AI agent", "ai-agent");

      case "add_failover_endpoint":
        return await this.failoverService.addEndpoint(input.group_id, input.ip, input.reason || "Added via AI agent", "ai-agent");

      case "get_failover_history":
        return this.failoverService.getHistory(input.group_id, input.limit || 20);

      case "run_failover_probe":
        await this.failoverService.runProbeCheck();
        return { status: "completed", message: "Probe check completed. Check failover status for results." };

      case "update_failover_group":
        return this.failoverService.updateGroup(input.group_id, {
          failoverMode: input.failover_mode,
          autoFailover: input.auto_failover,
          probeIntervalSeconds: input.probe_interval_seconds,
          failureThreshold: input.failure_threshold,
          ttlSeconds: input.ttl_seconds,
        });

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private buildGatewayParams(input: Record<string, any>) {
    const subscriptionId = input.subscription_id;
    const resourceGroup = input.resource_group;
    const gatewayName = input.gateway_name;
    const frontendPort = input.frontend_port || 80;
    const protocol = input.protocol || "Http";
    const skuName = input.sku_name || "WAF_v2";

    // Base path for self-referencing sub-resources
    const basePath = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/applicationGateways/${gatewayName}`;

    const params: any = {
      location: input.location,
      sku: {
        name: skuName,
        tier: skuName,
        capacity: input.capacity || 2,
      },
      gatewayIPConfigurations: [
        {
          name: "appGatewayIpConfig",
          subnet: { id: input.subnet_id },
        },
      ],
      frontendIPConfigurations: [
        {
          name: "appGatewayFrontendIP",
          publicIPAddress: input.public_ip_id ? { id: input.public_ip_id } : undefined,
        },
      ],
      frontendPorts: [
        { name: "appGatewayFrontendPort", port: frontendPort },
      ],
      backendAddressPools: [
        {
          name: "defaultBackendPool",
          backendAddresses: (input.backend_addresses && input.backend_addresses.length > 0)
            ? input.backend_addresses.map((addr: any) => ({
                fqdn: addr.fqdn || undefined,
                ipAddress: addr.ip_address || addr.ipAddress || undefined,
              }))
            : [{ ipAddress: "10.0.2.4" }],
        },
      ],
      backendHttpSettingsCollection: [
        {
          name: "defaultHttpSettings",
          port: 80,
          protocol: "Http",
          requestTimeout: 30,
          cookieBasedAffinity: "Disabled",
        },
      ],
      httpListeners: [
        {
          name: "defaultListener",
          frontendIPConfiguration: {
            id: `${basePath}/frontendIPConfigurations/appGatewayFrontendIP`,
          },
          frontendPort: {
            id: `${basePath}/frontendPorts/appGatewayFrontendPort`,
          },
          protocol,
        },
      ],
      requestRoutingRules: [
        {
          name: "defaultRoutingRule",
          ruleType: "Basic",
          priority: 100,
          httpListener: {
            id: `${basePath}/httpListeners/defaultListener`,
          },
          backendAddressPool: {
            id: `${basePath}/backendAddressPools/defaultBackendPool`,
          },
          backendHttpSettings: {
            id: `${basePath}/backendHttpSettingsCollection/defaultHttpSettings`,
          },
        },
      ],
      probes: [
        {
          name: "defaultHealthProbe",
          protocol: "Http",
          host: "127.0.0.1",
          path: "/",
          interval: 30,
          timeout: 30,
          unhealthyThreshold: 3,
        },
      ],
    };

    // Link health probe to HTTP settings
    params.backendHttpSettingsCollection[0].probe = {
      id: `${basePath}/probes/defaultHealthProbe`,
    };

    // Link WAF policy if provided
    if (input.waf_policy_id) {
      params.firewallPolicy = { id: input.waf_policy_id };
    } else if (skuName.includes("WAF")) {
      // Fallback to inline WAF config if no policy ID
      params.webApplicationFirewallConfiguration = {
        enabled: true,
        firewallMode: "Prevention",
        ruleSetType: "OWASP",
        ruleSetVersion: "3.2",
      };
    }

    return params;
  }
}
