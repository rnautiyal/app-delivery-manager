import { NetworkManagementClient, WebApplicationFirewallPolicy } from "@azure/arm-network";
import { getAzureCredential } from "../config/azure";
import { logger } from "../config/logger";
import { WafPolicy } from "../models/types";

export class WafService {
  private getNetworkClient(subscriptionId: string): NetworkManagementClient {
    return new NetworkManagementClient(getAzureCredential(), subscriptionId);
  }

  async listWafPolicies(subscriptionId: string): Promise<WafPolicy[]> {
    const client = this.getNetworkClient(subscriptionId);
    const policies: WafPolicy[] = [];

    try {
      for await (const policy of client.webApplicationFirewallPolicies.listAll()) {
        policies.push(this.mapPolicy(policy, subscriptionId));
      }
    } catch (error) {
      logger.error("Failed to list WAF policies", { subscriptionId, error });
      throw error;
    }

    return policies;
  }

  async getWafPolicy(
    subscriptionId: string,
    resourceGroup: string,
    policyName: string
  ): Promise<WebApplicationFirewallPolicy> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      return await client.webApplicationFirewallPolicies.get(resourceGroup, policyName);
    } catch (error) {
      logger.error("Failed to get WAF policy", { subscriptionId, resourceGroup, policyName, error });
      throw error;
    }
  }

  async createOrUpdateWafPolicy(
    subscriptionId: string,
    resourceGroup: string,
    policyName: string,
    parameters: WebApplicationFirewallPolicy
  ): Promise<WebApplicationFirewallPolicy> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      return await client.webApplicationFirewallPolicies.createOrUpdate(
        resourceGroup,
        policyName,
        parameters
      );
    } catch (error) {
      logger.error("Failed to create/update WAF policy", { subscriptionId, resourceGroup, policyName, error });
      throw error;
    }
  }

  async deleteWafPolicy(subscriptionId: string, resourceGroup: string, policyName: string): Promise<void> {
    const client = this.getNetworkClient(subscriptionId);
    try {
      await client.webApplicationFirewallPolicies.beginDeleteAndWait(resourceGroup, policyName);
    } catch (error) {
      logger.error("Failed to delete WAF policy", { subscriptionId, resourceGroup, policyName, error });
      throw error;
    }
  }

  async createDefaultWafPolicy(
    subscriptionId: string,
    resourceGroup: string,
    policyName: string,
    location: string
  ): Promise<WebApplicationFirewallPolicy> {
    const params: WebApplicationFirewallPolicy = {
      location,
      policySettings: {
        mode: "Prevention",
        state: "Enabled",
        requestBodyCheck: true,
        maxRequestBodySizeInKb: 128,
        fileUploadLimitInMb: 100,
      },
      managedRules: {
        managedRuleSets: [
          {
            ruleSetType: "OWASP",
            ruleSetVersion: "3.2",
          },
        ],
      },
    };

    logger.info("Creating default WAF policy", { subscriptionId, resourceGroup, policyName });
    return await this.createOrUpdateWafPolicy(subscriptionId, resourceGroup, policyName, params);
  }

  private mapPolicy(policy: WebApplicationFirewallPolicy, subscriptionId: string): WafPolicy {
    const resourceGroup = policy.id?.split("/")[4] || "";
    return {
      id: policy.id || "",
      name: policy.name || "",
      resourceGroup,
      subscriptionId,
      policyMode: policy.policySettings?.mode || "Detection",
      ruleSetType: policy.managedRules?.managedRuleSets?.[0]?.ruleSetType || "OWASP",
      ruleSetVersion: policy.managedRules?.managedRuleSets?.[0]?.ruleSetVersion || "3.2",
      customRulesCount: policy.customRules?.length || 0,
      managedRulesCount: policy.managedRules?.managedRuleSets?.length || 0,
      associatedGateways: (policy.applicationGateways || []).map((gw) => gw.id || ""),
    };
  }
}
