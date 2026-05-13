import { logger } from "../config/logger";
import fs from "fs";
import path from "path";

export interface GcpLoadBalancer {
  id: string;
  name: string;
  type: string;
  scheme: string;
  region: string;
  ipAddress: string;
  port: string;
  protocol: string;
  healthStatus: string;
  backendCount: number;
  creationTimestamp: string;
  description: string;
}

export class GcpLbService {
  private getCredentials(): any {
    // Try file first (persistent storage)
    const dataDir = process.env.DATA_DIR || path.join(__dirname, "../../data");
    const credFile = path.join(dataDir, "gcp-credentials.json");
    if (fs.existsSync(credFile)) {
      try {
        return JSON.parse(fs.readFileSync(credFile, "utf-8"));
      } catch (e) {
        logger.warn("Failed to parse GCP credentials file", { error: (e as Error).message });
      }
    }

    // Fall back to env var
    const credsJson = process.env.GCP_CREDENTIALS_JSON;
    if (!credsJson) throw new Error("GCP credentials not configured. Place gcp-credentials.json in data directory or set GCP_CREDENTIALS_JSON env var.");
    return JSON.parse(credsJson);
  }

  private getProjectId(): string {
    return process.env.GCP_PROJECT_ID || this.getCredentials().project_id || "";
  }

  async listLoadBalancers(): Promise<GcpLoadBalancer[]> {
    const projectId = this.getProjectId();
    if (!projectId) throw new Error("GCP_PROJECT_ID not configured");

    const compute = await import("@google-cloud/compute");
    const credentials = this.getCredentials();
    const authOpts = { projectId, credentials };
    const lbs: GcpLoadBalancer[] = [];

    // Global forwarding rules (HTTP/S, SSL, TCP proxy LBs)
    try {
      const globalClient = new compute.GlobalForwardingRulesClient(authOpts);
      const [rules] = await globalClient.list({ project: projectId });
      for (const rule of rules || []) {
        lbs.push(this.mapRule(rule, "global"));
      }
    } catch (e) {
      logger.warn("Failed to list global forwarding rules", { error: (e as Error).message });
    }

    // Regional forwarding rules (network LBs, internal LBs)
    try {
      const regionalClient = new compute.ForwardingRulesClient(authOpts);
      const iterable = regionalClient.aggregatedListAsync({ project: projectId });
      for await (const [scope, scopedList] of iterable) {
        const region = scope.includes("regions/") ? scope.split("regions/")[1] : scope;
        for (const rule of scopedList.forwardingRules || []) {
          lbs.push(this.mapRule(rule, region));
        }
      }
    } catch (e) {
      logger.warn("Failed to list regional forwarding rules", { error: (e as Error).message });
    }

    return lbs;
  }

  private mapRule(rule: any, region: string): GcpLoadBalancer {
    return {
      id: rule.id?.toString() || "",
      name: rule.name || "",
      type: this.inferLbType(rule),
      scheme: rule.loadBalancingScheme || "EXTERNAL",
      region,
      ipAddress: rule.IPAddress || "",
      port: rule.portRange || (rule.ports || []).join(",") || "all",
      protocol: rule.IPProtocol || "",
      healthStatus: "Unknown",
      backendCount: 0,
      creationTimestamp: rule.creationTimestamp || "",
      description: rule.description || "",
    };
  }

  async getLoadBalancerDetail(name: string): Promise<any> {
    const projectId = this.getProjectId();
    const lbs = await this.listLoadBalancers();
    return lbs.find(lb => lb.name === name) || null;
  }

  private inferLbType(rule: any): string {
    const target = rule.target || "";
    const scheme = rule.loadBalancingScheme || "";

    if (target.includes("targetHttpsProxies")) return "HTTPS Load Balancer";
    if (target.includes("targetHttpProxies")) return "HTTP Load Balancer";
    if (target.includes("targetSslProxies")) return "SSL Proxy";
    if (target.includes("targetTcpProxies")) return "TCP Proxy";
    if (target.includes("targetPools")) return "Network LB (Target Pool)";
    if (scheme === "INTERNAL") return "Internal TCP/UDP LB";
    if (scheme === "INTERNAL_MANAGED") return "Internal HTTP/S LB";
    if (scheme === "EXTERNAL_MANAGED") return "External HTTP/S LB";
    return "Load Balancer";
  }

  isConfigured(): boolean {
    return !!(process.env.GCP_PROJECT_ID && process.env.GCP_CREDENTIALS_JSON);
  }
}
