import { NetworkManagementClient } from "@azure/arm-network";
import { ResourceManagementClient } from "@azure/arm-resources";
import { getAzureCredential } from "../config/azure";
import { logger } from "../config/logger";

export class NetworkService {
  private getNetworkClient(subscriptionId: string): NetworkManagementClient {
    return new NetworkManagementClient(getAzureCredential(), subscriptionId);
  }

  private getResourceClient(subscriptionId: string): ResourceManagementClient {
    return new ResourceManagementClient(getAzureCredential(), subscriptionId);
  }

  // Resource Groups
  async listResourceGroups(subscriptionId: string) {
    const client = this.getResourceClient(subscriptionId);
    const groups = [];
    for await (const rg of client.resourceGroups.list()) {
      groups.push({ name: rg.name, location: rg.location, provisioningState: rg.properties?.provisioningState });
    }
    return groups;
  }

  async createResourceGroup(subscriptionId: string, name: string, location: string) {
    const client = this.getResourceClient(subscriptionId);
    return await client.resourceGroups.createOrUpdate(name, { location });
  }

  // Virtual Networks
  async listVnets(subscriptionId: string, resourceGroup?: string) {
    const client = this.getNetworkClient(subscriptionId);
    const vnets = [];
    const iterator = resourceGroup
      ? client.virtualNetworks.list(resourceGroup)
      : client.virtualNetworks.listAll();
    for await (const vnet of iterator) {
      vnets.push({
        id: vnet.id,
        name: vnet.name,
        location: vnet.location,
        resourceGroup: vnet.id?.split("/")[4],
        addressSpace: vnet.addressSpace?.addressPrefixes,
        subnets: (vnet.subnets || []).map(s => ({
          id: s.id,
          name: s.name,
          addressPrefix: s.addressPrefix,
          delegations: (s.delegations || []).map(d => d.serviceName),
        })),
        provisioningState: vnet.provisioningState,
      });
    }
    return vnets;
  }

  async createVnet(subscriptionId: string, resourceGroup: string, name: string, location: string, addressPrefix: string, subnetName?: string, subnetPrefix?: string) {
    const client = this.getNetworkClient(subscriptionId);
    logger.info("Creating VNet", { subscriptionId, resourceGroup, name, location, addressPrefix, subnetName });
    const params: any = {
      location,
      addressSpace: { addressPrefixes: [addressPrefix] },
    };
    if (subnetName && subnetPrefix) {
      params.subnets = [{ name: subnetName, addressPrefix: subnetPrefix }];
    }
    const poller = await client.virtualNetworks.beginCreateOrUpdate(resourceGroup, name, params);
    return await poller.pollUntilDone();
  }

  // Subnets
  async createSubnet(subscriptionId: string, resourceGroup: string, vnetName: string, subnetName: string, addressPrefix: string) {
    const client = this.getNetworkClient(subscriptionId);
    logger.info("Creating Subnet", { resourceGroup, vnetName, subnetName, addressPrefix });
    const poller = await client.subnets.beginCreateOrUpdate(resourceGroup, vnetName, subnetName, {
      addressPrefix,
    });
    return await poller.pollUntilDone();
  }

  async listSubnets(subscriptionId: string, resourceGroup: string, vnetName: string) {
    const client = this.getNetworkClient(subscriptionId);
    const subnets = [];
    for await (const subnet of client.subnets.list(resourceGroup, vnetName)) {
      subnets.push({
        id: subnet.id,
        name: subnet.name,
        addressPrefix: subnet.addressPrefix,
        provisioningState: subnet.provisioningState,
        ipConfigurations: (subnet.ipConfigurations || []).length,
      });
    }
    return subnets;
  }

  // Public IPs
  async listPublicIps(subscriptionId: string, resourceGroup?: string) {
    const client = this.getNetworkClient(subscriptionId);
    const ips = [];
    const iterator = resourceGroup
      ? client.publicIPAddresses.list(resourceGroup)
      : client.publicIPAddresses.listAll();
    for await (const ip of iterator) {
      ips.push({
        id: ip.id,
        name: ip.name,
        location: ip.location,
        resourceGroup: ip.id?.split("/")[4],
        ipAddress: ip.ipAddress,
        allocationMethod: ip.publicIPAllocationMethod,
        sku: ip.sku?.name,
        associatedTo: ip.ipConfiguration?.id?.split("/").slice(0, -2).pop(),
      });
    }
    return ips;
  }

  async createPublicIp(subscriptionId: string, resourceGroup: string, name: string, location: string, sku: string = "Standard") {
    const client = this.getNetworkClient(subscriptionId);
    logger.info("Creating Public IP", { resourceGroup, name, location, sku });
    const poller = await client.publicIPAddresses.beginCreateOrUpdate(resourceGroup, name, {
      location,
      sku: { name: sku },
      publicIPAllocationMethod: sku === "Standard" ? "Static" : "Dynamic",
    });
    return await poller.pollUntilDone();
  }

  // NSGs
  async listNsgs(subscriptionId: string, resourceGroup?: string) {
    const client = this.getNetworkClient(subscriptionId);
    const nsgs = [];
    const iterator = resourceGroup
      ? client.networkSecurityGroups.list(resourceGroup)
      : client.networkSecurityGroups.listAll();
    for await (const nsg of iterator) {
      nsgs.push({
        id: nsg.id,
        name: nsg.name,
        location: nsg.location,
        resourceGroup: nsg.id?.split("/")[4],
        rulesCount: (nsg.securityRules || []).length,
        subnets: (nsg.subnets || []).map(s => s.id?.split("/").pop()),
      });
    }
    return nsgs;
  }

  async getNsgRules(subscriptionId: string, resourceGroup: string, nsgName: string) {
    const client = this.getNetworkClient(subscriptionId);
    const nsg = await client.networkSecurityGroups.get(resourceGroup, nsgName);
    return {
      name: nsg.name,
      rules: (nsg.securityRules || []).map(r => ({
        name: r.name,
        priority: r.priority,
        direction: r.direction,
        access: r.access,
        protocol: r.protocol,
        sourceAddress: r.sourceAddressPrefix,
        destAddress: r.destinationAddressPrefix,
        sourcePort: r.sourcePortRange,
        destPort: r.destinationPortRange,
      })),
      defaultRules: (nsg.defaultSecurityRules || []).map(r => ({
        name: r.name,
        direction: r.direction,
        access: r.access,
      })),
    };
  }

  // DDoS Protection
  async listDdosPlans(subscriptionId: string) {
    const client = this.getNetworkClient(subscriptionId);
    const plans = [];
    for await (const plan of client.ddosProtectionPlans.list()) {
      plans.push({
        id: plan.id,
        name: plan.name,
        location: plan.location,
        resourceGroup: plan.id?.split("/")[4],
        vnets: (plan.virtualNetworks || []).map(v => v.id?.split("/").pop()),
      });
    }
    return plans;
  }

  async createDdosPlan(subscriptionId: string, resourceGroup: string, name: string, location: string) {
    const client = this.getNetworkClient(subscriptionId);
    logger.info("Creating DDoS Protection Plan", { resourceGroup, name, location });
    const poller = await client.ddosProtectionPlans.beginCreateOrUpdate(resourceGroup, name, { location });
    return await poller.pollUntilDone();
  }
}
