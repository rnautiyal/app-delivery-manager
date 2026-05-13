import { NetworkManagementClient } from "@azure/arm-network";
import { getAzureCredential } from "../config/azure";
import { logger } from "../config/logger";

export class FirewallService {
  private getNetworkClient(subscriptionId: string): NetworkManagementClient {
    return new NetworkManagementClient(getAzureCredential(), subscriptionId);
  }

  async listFirewalls(subscriptionId: string): Promise<any[]> {
    const client = this.getNetworkClient(subscriptionId);
    const firewalls: any[] = [];
    try {
      for await (const fw of client.azureFirewalls.listAll()) {
        firewalls.push({
          id: fw.id,
          name: fw.name,
          resourceGroup: fw.id?.split("/")[4] || "",
          location: fw.location,
          sku: fw.sku,
          threatIntelMode: fw.threatIntelMode,
          provisioningState: fw.provisioningState,
          firewallPolicyId: fw.firewallPolicy?.id,
          firewallPolicyName: fw.firewallPolicy?.id?.split("/").pop(),
          ipConfigurations: (fw.ipConfigurations || []).map((ip) => ({
            name: ip.name,
            privateIPAddress: ip.privateIPAddress,
            publicIPAddressId: ip.publicIPAddress?.id,
            publicIPAddressName: ip.publicIPAddress?.id?.split("/").pop(),
            subnetId: ip.subnet?.id,
          })),
          zones: fw.zones || [],
          hubIPAddresses: fw.hubIPAddresses,
          virtualHub: fw.virtualHub?.id ? { id: fw.virtualHub.id, name: fw.virtualHub.id.split("/").pop() } : undefined,
          networkRuleCollectionCount: (fw.networkRuleCollections || []).length,
          applicationRuleCollectionCount: (fw.applicationRuleCollections || []).length,
          natRuleCollectionCount: (fw.natRuleCollections || []).length,
          tags: fw.tags || {},
        });
      }
      logger.info("Listed Azure Firewalls", { subscriptionId, count: firewalls.length });
    } catch (error) {
      logger.error("Failed to list Azure Firewalls", { subscriptionId, error });
      throw error;
    }
    return firewalls;
  }

  async listFirewallPolicies(subscriptionId: string): Promise<any[]> {
    const client = this.getNetworkClient(subscriptionId);
    const policies: any[] = [];
    try {
      for await (const policy of client.firewallPolicies.listAll()) {
        policies.push({
          id: policy.id,
          name: policy.name,
          resourceGroup: policy.id?.split("/")[4] || "",
          location: policy.location,
          sku: policy.sku,
          threatIntelMode: policy.threatIntelMode,
          provisioningState: policy.provisioningState,
          dnsSettings: policy.dnsSettings,
          intrusionDetection: policy.intrusionDetection ? {
            mode: policy.intrusionDetection.mode,
            profileType: (policy.intrusionDetection as any).profile?.name,
          } : undefined,
          transportSecurity: policy.transportSecurity ? { enabled: true } : undefined,
          insights: policy.insights ? { enabled: policy.insights.isEnabled } : undefined,
          childPolicies: (policy.childPolicies || []).map((cp) => cp.id?.split("/").pop()),
          firewalls: (policy.firewalls || []).map((fw) => fw.id?.split("/").pop()),
          ruleCollectionGroups: (policy.ruleCollectionGroups || []).map((rcg) => rcg.id?.split("/").pop()),
          basePolicy: policy.basePolicy?.id ? policy.basePolicy.id.split("/").pop() : undefined,
          tags: policy.tags || {},
        });
      }
      logger.info("Listed Firewall Policies", { subscriptionId, count: policies.length });
    } catch (error) {
      logger.error("Failed to list Firewall Policies", { subscriptionId, error });
      throw error;
    }
    return policies;
  }

  async getFirewallPolicyRuleGroups(subscriptionId: string, resourceGroup: string, policyName: string): Promise<any[]> {
    const client = this.getNetworkClient(subscriptionId);
    const groups: any[] = [];
    try {
      for await (const rcg of client.firewallPolicyRuleCollectionGroups.list(resourceGroup, policyName)) {
        groups.push({
          id: rcg.id,
          name: rcg.name,
          priority: rcg.priority,
          provisioningState: rcg.provisioningState,
          ruleCollections: (rcg.ruleCollections || []).map((rc: any) => ({
            name: rc.name,
            ruleCollectionType: rc.ruleCollectionType,
            priority: rc.priority,
            action: rc.action,
            rulesCount: (rc.rules || []).length,
          })),
        });
      }
    } catch (error) {
      logger.error("Failed to list rule collection groups", { policyName, error });
      throw error;
    }
    return groups;
  }
}
