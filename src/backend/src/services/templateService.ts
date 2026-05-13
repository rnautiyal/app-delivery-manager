import crypto from "crypto";
import { StorageService } from "./storageService";
import { GatewayService } from "./gatewayService";
import { NetworkService } from "./networkService";
import { ConfigTemplate } from "../models/types";
import { logger } from "../config/logger";

// In-memory version history
const templateVersions: Map<string, ConfigTemplate[]> = new Map();

export class TemplateService {
  private storage = new StorageService<ConfigTemplate>("templates.json");
  private gatewayService = new GatewayService();

  async saveTemplate(
    subscriptionId: string,
    resourceGroup: string,
    gatewayName: string,
    name: string,
    description: string,
    createdBy: string
  ): Promise<ConfigTemplate> {
    const gw = await this.gatewayService.getGateway(subscriptionId, resourceGroup, gatewayName);

    const stripIds = (arr: any[] | undefined) =>
      (arr || []).map((item: any) => {
        const { id, etag, provisioningState, type, ...rest } = item;
        return rest;
      });

    const template: ConfigTemplate = {
      id: crypto.randomUUID(),
      name,
      description,
      createdAt: new Date().toISOString(),
      createdBy,
      sourceGateway: { name: gatewayName, resourceGroup, subscriptionId },
      config: {
        sku: {
          name: gw.sku?.name || "Standard_v2",
          tier: gw.sku?.tier || "Standard_v2",
        },
        backendAddressPools: stripIds(gw.backendAddressPools),
        backendHttpSettingsCollection: stripIds(gw.backendHttpSettingsCollection),
        httpListeners: stripIds(gw.httpListeners),
        requestRoutingRules: stripIds(gw.requestRoutingRules),
        probes: stripIds(gw.probes),
        frontendPorts: stripIds(gw.frontendPorts),
        wafConfiguration: gw.webApplicationFirewallConfiguration || undefined,
        tags: gw.tags || {},
      },
    };

    this.storage.add(template);
    logger.info("Config template saved", { templateId: template.id, name, sourceGateway: gatewayName });
    return template;
  }

  listTemplates(): ConfigTemplate[] {
    return this.storage.readAll();
  }

  getTemplate(id: string): ConfigTemplate {
    const template = this.storage.findById(id);
    if (!template) throw new Error(`Template not found: ${id}`);
    return template;
  }

  deleteTemplate(id: string): void {
    this.storage.remove(id);
    logger.info("Config template deleted", { templateId: id });
  }

  async applyTemplate(
    templateId: string,
    subscriptionId: string,
    resourceGroup: string,
    gatewayName: string
  ): Promise<any> {
    const template = this.getTemplate(templateId);
    const gw = await this.gatewayService.getGateway(subscriptionId, resourceGroup, gatewayName);

    const basePath = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/applicationGateways/${gatewayName}`;

    const rewriteIds = (arr: any[], subType: string) =>
      arr.map((item: any) => ({
        ...item,
        id: item.name ? `${basePath}/${subType}/${item.name}` : undefined,
      }));

    // Apply template components while preserving gateway-specific fields (subnet, IPs, SKU capacity)
    gw.backendAddressPools = rewriteIds(template.config.backendAddressPools, "backendAddressPools");
    gw.backendHttpSettingsCollection = rewriteIds(template.config.backendHttpSettingsCollection, "backendHttpSettingsCollection");
    gw.probes = rewriteIds(template.config.probes, "probes");
    gw.frontendPorts = rewriteIds(template.config.frontendPorts, "frontendPorts");
    gw.requestRoutingRules = rewriteIds(template.config.requestRoutingRules, "requestRoutingRules");
    gw.httpListeners = rewriteIds(template.config.httpListeners, "httpListeners");

    if (template.config.wafConfiguration) {
      gw.webApplicationFirewallConfiguration = template.config.wafConfiguration;
    }
    if (template.config.tags) {
      gw.tags = { ...gw.tags, ...template.config.tags };
    }

    logger.info("Applying config template to gateway", {
      templateId,
      templateName: template.name,
      targetGateway: gatewayName,
    });

    return await this.gatewayService.updateGateway(subscriptionId, resourceGroup, gatewayName, gw);
  }

  exportTemplate(id: string): { template: ConfigTemplate; exportedAt: string; version: string } {
    const template = this.getTemplate(id);
    return {
      template,
      exportedAt: new Date().toISOString(),
      version: "1.0",
    };
  }

  exportAsArm(id: string): any {
    const template = this.getTemplate(id);
    return {
      "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
      contentVersion: "1.0.0.0",
      parameters: {
        gatewayName: { type: "string", defaultValue: template.sourceGateway.name },
        location: { type: "string", defaultValue: "[resourceGroup().location]" },
        skuName: { type: "string", defaultValue: template.config.sku.name },
        skuTier: { type: "string", defaultValue: template.config.sku.tier },
        vnetName: { type: "string", defaultValue: `${template.sourceGateway.name}-vnet` },
        vnetAddressPrefix: { type: "string", defaultValue: "10.0.0.0/16" },
        subnetName: { type: "string", defaultValue: "appgw-subnet" },
        subnetAddressPrefix: { type: "string", defaultValue: "10.0.0.0/24" },
        publicIpName: { type: "string", defaultValue: `${template.sourceGateway.name}-pip` },
      },
      variables: {
        nsgName: `[concat(parameters('gatewayName'), '-nsg')]`,
        subnetId: "[resourceId('Microsoft.Network/virtualNetworks/subnets', parameters('vnetName'), parameters('subnetName'))]",
        publicIpId: "[resourceId('Microsoft.Network/publicIPAddresses', parameters('publicIpName'))]",
      },
      resources: [
        {
          type: "Microsoft.Network/networkSecurityGroups",
          apiVersion: "2023-09-01",
          name: "[variables('nsgName')]",
          location: "[parameters('location')]",
          properties: {
            securityRules: [
              { name: "Allow-GatewayManager", properties: { priority: 100, direction: "Inbound", access: "Allow", protocol: "Tcp", sourceAddressPrefix: "GatewayManager", sourcePortRange: "*", destinationAddressPrefix: "*", destinationPortRange: "65200-65535" } },
              { name: "Allow-AzureLoadBalancer", properties: { priority: 110, direction: "Inbound", access: "Allow", protocol: "*", sourceAddressPrefix: "AzureLoadBalancer", sourcePortRange: "*", destinationAddressPrefix: "*", destinationPortRange: "*" } },
              { name: "Allow-HTTP", properties: { priority: 200, direction: "Inbound", access: "Allow", protocol: "Tcp", sourceAddressPrefix: "*", sourcePortRange: "*", destinationAddressPrefix: "*", destinationPortRange: "80" } },
              { name: "Allow-HTTPS", properties: { priority: 210, direction: "Inbound", access: "Allow", protocol: "Tcp", sourceAddressPrefix: "*", sourcePortRange: "*", destinationAddressPrefix: "*", destinationPortRange: "443" } },
            ],
          },
        },
        {
          type: "Microsoft.Network/publicIPAddresses",
          apiVersion: "2023-09-01",
          name: "[parameters('publicIpName')]",
          location: "[parameters('location')]",
          sku: { name: "Standard" },
          properties: { publicIPAllocationMethod: "Static" },
        },
        {
          type: "Microsoft.Network/virtualNetworks",
          apiVersion: "2023-09-01",
          name: "[parameters('vnetName')]",
          location: "[parameters('location')]",
          dependsOn: ["[resourceId('Microsoft.Network/networkSecurityGroups', variables('nsgName'))]"],
          properties: {
            addressSpace: { addressPrefixes: ["[parameters('vnetAddressPrefix')]"] },
            subnets: [{
              name: "[parameters('subnetName')]",
              properties: {
                addressPrefix: "[parameters('subnetAddressPrefix')]",
                networkSecurityGroup: { id: "[resourceId('Microsoft.Network/networkSecurityGroups', variables('nsgName'))]" },
              },
            }],
          },
        },
        {
          type: "Microsoft.Network/applicationGateways",
          apiVersion: "2023-09-01",
          name: "[parameters('gatewayName')]",
          location: "[parameters('location')]",
          dependsOn: [
            "[resourceId('Microsoft.Network/virtualNetworks', parameters('vnetName'))]",
            "[resourceId('Microsoft.Network/publicIPAddresses', parameters('publicIpName'))]",
          ],
          properties: {
            sku: { name: "[parameters('skuName')]", tier: "[parameters('skuTier')]", capacity: 2 },
            gatewayIPConfigurations: [{ name: "gwIpConfig", properties: { subnet: { id: "[variables('subnetId')]" } } }],
            frontendIPConfigurations: [
              { name: "publicFrontend", properties: { publicIPAddress: { id: "[variables('publicIpId')]" } } },
            ],
            frontendPorts: (template.config.frontendPorts || []).map((p: any) => ({
              name: p.name, properties: { port: p.port },
            })),
            backendAddressPools: (template.config.backendAddressPools || []).map((p: any) => ({
              name: p.name, properties: { backendAddresses: p.backendAddresses || [] },
            })),
            backendHttpSettingsCollection: (template.config.backendHttpSettingsCollection || []).map((s: any) => ({
              name: s.name, properties: {
                port: s.port || 80, protocol: s.protocol || "Http",
                cookieBasedAffinity: s.cookieBasedAffinity || "Disabled",
                requestTimeout: s.requestTimeout || 30,
              },
            })),
            httpListeners: (template.config.httpListeners || []).map((l: any) => ({
              name: l.name, properties: {
                frontendIPConfiguration: { id: "[concat(resourceId('Microsoft.Network/applicationGateways', parameters('gatewayName')), '/frontendIPConfigurations/publicFrontend')]" },
                frontendPort: { id: `[concat(resourceId('Microsoft.Network/applicationGateways', parameters('gatewayName')), '/frontendPorts/${template.config.frontendPorts?.[0]?.name || "port_80"}')]` },
                protocol: l.protocol || "Http",
              },
            })),
            requestRoutingRules: (template.config.requestRoutingRules || []).map((r: any, i: number) => ({
              name: r.name, properties: {
                ruleType: r.ruleType || "Basic", priority: r.priority || (100 + i * 10),
                httpListener: { id: `[concat(resourceId('Microsoft.Network/applicationGateways', parameters('gatewayName')), '/httpListeners/${template.config.httpListeners?.[0]?.name || "http-listener"}')]` },
                backendAddressPool: { id: `[concat(resourceId('Microsoft.Network/applicationGateways', parameters('gatewayName')), '/backendAddressPools/${template.config.backendAddressPools?.[0]?.name || "default"}')]` },
                backendHttpSettings: { id: `[concat(resourceId('Microsoft.Network/applicationGateways', parameters('gatewayName')), '/backendHttpSettingsCollection/${template.config.backendHttpSettingsCollection?.[0]?.name || "http-settings"}')]` },
              },
            })),
            probes: (template.config.probes || []).map((p: any) => ({
              name: p.name, properties: {
                protocol: p.protocol || "Http", path: p.path || "/",
                interval: p.interval || 30, timeout: p.timeout || 30,
                unhealthyThreshold: p.unhealthyThreshold || 3,
                host: p.host || "127.0.0.1",
                pickHostNameFromBackendHttpSettings: p.pickHostNameFromBackendHttpSettings || false,
              },
            })),
            ...(template.config.wafConfiguration ? { webApplicationFirewallConfiguration: template.config.wafConfiguration } : {}),
          },
          tags: template.config.tags || {},
        },
      ],
      outputs: {
        gatewayId: { type: "string", value: "[resourceId('Microsoft.Network/applicationGateways', parameters('gatewayName'))]" },
        publicIp: { type: "string", value: "[reference(parameters('publicIpName')).ipAddress]" },
      },
    };
  }

  exportAsBicep(id: string): string {
    const template = this.getTemplate(id);
    const cfg = template.config;
    let b = `// Generated from AppGW Manager template: ${template.name}\n`;
    b += `// Source: ${template.sourceGateway.name}\n// Full infrastructure included — deploy from scratch\n\n`;
    b += `@description('Application Gateway name')\nparam gatewayName string = '${template.sourceGateway.name}'\n`;
    b += `param location string = resourceGroup().location\n`;
    b += `param skuName string = '${cfg.sku.name}'\nparam skuTier string = '${cfg.sku.tier}'\n`;
    b += `param vnetName string = '\${gatewayName}-vnet'\n`;
    b += `param vnetAddressPrefix string = '10.0.0.0/16'\n`;
    b += `param subnetName string = 'appgw-subnet'\n`;
    b += `param subnetAddressPrefix string = '10.0.0.0/24'\n`;
    b += `param publicIpName string = '\${gatewayName}-pip'\n\n`;
    // NSG
    b += `resource nsg 'Microsoft.Network/networkSecurityGroups@2023-09-01' = {\n  name: '\${gatewayName}-nsg'\n  location: location\n  properties: {\n    securityRules: [\n`;
    b += `      { name: 'Allow-GatewayManager', properties: { priority: 100, direction: 'Inbound', access: 'Allow', protocol: 'Tcp', sourceAddressPrefix: 'GatewayManager', sourcePortRange: '*', destinationAddressPrefix: '*', destinationPortRange: '65200-65535' } }\n`;
    b += `      { name: 'Allow-HTTP', properties: { priority: 200, direction: 'Inbound', access: 'Allow', protocol: 'Tcp', sourceAddressPrefix: '*', sourcePortRange: '*', destinationAddressPrefix: '*', destinationPortRange: '80' } }\n`;
    b += `      { name: 'Allow-HTTPS', properties: { priority: 210, direction: 'Inbound', access: 'Allow', protocol: 'Tcp', sourceAddressPrefix: '*', sourcePortRange: '*', destinationAddressPrefix: '*', destinationPortRange: '443' } }\n`;
    b += `    ]\n  }\n}\n\n`;
    // Public IP
    b += `resource pip 'Microsoft.Network/publicIPAddresses@2023-09-01' = {\n  name: publicIpName\n  location: location\n  sku: { name: 'Standard' }\n  properties: { publicIPAllocationMethod: 'Static' }\n}\n\n`;
    // VNet
    b += `resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {\n  name: vnetName\n  location: location\n  properties: {\n    addressSpace: { addressPrefixes: [ vnetAddressPrefix ] }\n    subnets: [\n      {\n        name: subnetName\n        properties: {\n          addressPrefix: subnetAddressPrefix\n          networkSecurityGroup: { id: nsg.id }\n        }\n      }\n    ]\n  }\n}\n\n`;
    // AppGW
    b += `resource appGw 'Microsoft.Network/applicationGateways@2023-09-01' = {\n  name: gatewayName\n  location: location\n  properties: {\n`;
    b += `    sku: { name: skuName, tier: skuTier, capacity: 2 }\n`;
    b += `    gatewayIPConfigurations: [ { name: 'gwIpConfig', properties: { subnet: { id: vnet.properties.subnets[0].id } } } ]\n`;
    b += `    frontendIPConfigurations: [ { name: 'publicFrontend', properties: { publicIPAddress: { id: pip.id } } } ]\n`;
    b += `    frontendPorts: [\n`;
    for (const port of cfg.frontendPorts) {
      b += `      { name: '${port.name}', properties: { port: ${port.port} } }\n`;
    }
    b += `    ]\n`;
    b += `    backendAddressPools: [\n`;
    for (const pool of cfg.backendAddressPools) {
      b += `      { name: '${pool.name}', properties: { backendAddresses: ${JSON.stringify(pool.backendAddresses || [])} } }\n`;
    }
    b += `    ]\n`;
    b += `    backendHttpSettingsCollection: [\n`;
    for (const s of cfg.backendHttpSettingsCollection) {
      b += `      { name: '${s.name}', properties: { port: ${s.port || 80}, protocol: '${s.protocol || "Http"}', cookieBasedAffinity: '${s.cookieBasedAffinity || "Disabled"}', requestTimeout: ${s.requestTimeout || 30} } }\n`;
    }
    b += `    ]\n`;
    b += `    httpListeners: [\n`;
    for (const l of cfg.httpListeners) {
      b += `      { name: '${l.name}', properties: { frontendIPConfiguration: { id: resourceId('Microsoft.Network/applicationGateways/frontendIPConfigurations', gatewayName, 'publicFrontend') }, frontendPort: { id: resourceId('Microsoft.Network/applicationGateways/frontendPorts', gatewayName, '${cfg.frontendPorts?.[0]?.name || "port_80"}') }, protocol: '${l.protocol || "Http"}' } }\n`;
    }
    b += `    ]\n`;
    b += `    requestRoutingRules: [\n`;
    for (let i = 0; i < cfg.requestRoutingRules.length; i++) {
      const r = cfg.requestRoutingRules[i];
      b += `      { name: '${r.name}', properties: { ruleType: '${r.ruleType || "Basic"}', priority: ${r.priority || 100 + i * 10} } }\n`;
    }
    b += `    ]\n`;
    b += `    probes: [\n`;
    for (const p of cfg.probes) {
      b += `      { name: '${p.name}', properties: { protocol: '${p.protocol || "Http"}', path: '${p.path || "/"}', interval: ${p.interval || 30}, timeout: ${p.timeout || 30}, unhealthyThreshold: ${p.unhealthyThreshold || 3} } }\n`;
    }
    b += `    ]\n`;
    if (cfg.wafConfiguration) b += `    webApplicationFirewallConfiguration: ${JSON.stringify(cfg.wafConfiguration)}\n`;
    b += `  }\n}\n\n`;
    b += `output gatewayId string = appGw.id\noutput publicIpAddress string = pip.properties.ipAddress\n`;
    return b;
  }

  exportAsTerraform(id: string): string {
    const template = this.getTemplate(id);
    const cfg = template.config;
    let tf = `# Generated from AppGW Manager template: ${template.name}\n`;
    tf += `# Source: ${template.sourceGateway.name}\n# Full infrastructure included — deploy from scratch\n\n`;
    tf += `terraform {\n  required_providers {\n    azurerm = {\n      source  = "hashicorp/azurerm"\n      version = "~> 3.0"\n    }\n  }\n}\n\nprovider "azurerm" {\n  features {}\n}\n\n`;
    tf += `variable "gateway_name" {\n  default = "${template.sourceGateway.name}"\n}\n`;
    tf += `variable "resource_group" {\n  default = "${template.sourceGateway.resourceGroup}"\n}\n`;
    tf += `variable "location" {\n  default = "eastus"\n}\n`;
    tf += `variable "vnet_address_prefix" {\n  default = "10.0.0.0/16"\n}\n`;
    tf += `variable "subnet_address_prefix" {\n  default = "10.0.0.0/24"\n}\n\n`;
    // Resource Group
    tf += `resource "azurerm_resource_group" "main" {\n  name     = var.resource_group\n  location = var.location\n}\n\n`;
    // NSG
    tf += `resource "azurerm_network_security_group" "appgw" {\n  name                = "\${var.gateway_name}-nsg"\n  location            = azurerm_resource_group.main.location\n  resource_group_name = azurerm_resource_group.main.name\n\n`;
    tf += `  security_rule {\n    name                       = "Allow-GatewayManager"\n    priority                   = 100\n    direction                  = "Inbound"\n    access                     = "Allow"\n    protocol                   = "Tcp"\n    source_address_prefix      = "GatewayManager"\n    source_port_range          = "*"\n    destination_address_prefix = "*"\n    destination_port_range     = "65200-65535"\n  }\n\n`;
    tf += `  security_rule {\n    name                       = "Allow-HTTP"\n    priority                   = 200\n    direction                  = "Inbound"\n    access                     = "Allow"\n    protocol                   = "Tcp"\n    source_address_prefix      = "*"\n    source_port_range          = "*"\n    destination_address_prefix = "*"\n    destination_port_range     = "80"\n  }\n\n`;
    tf += `  security_rule {\n    name                       = "Allow-HTTPS"\n    priority                   = 210\n    direction                  = "Inbound"\n    access                     = "Allow"\n    protocol                   = "Tcp"\n    source_address_prefix      = "*"\n    source_port_range          = "*"\n    destination_address_prefix = "*"\n    destination_port_range     = "443"\n  }\n}\n\n`;
    // Public IP
    tf += `resource "azurerm_public_ip" "appgw" {\n  name                = "\${var.gateway_name}-pip"\n  location            = azurerm_resource_group.main.location\n  resource_group_name = azurerm_resource_group.main.name\n  allocation_method   = "Static"\n  sku                 = "Standard"\n}\n\n`;
    // VNet
    tf += `resource "azurerm_virtual_network" "main" {\n  name                = "\${var.gateway_name}-vnet"\n  location            = azurerm_resource_group.main.location\n  resource_group_name = azurerm_resource_group.main.name\n  address_space       = [var.vnet_address_prefix]\n}\n\n`;
    // Subnet
    tf += `resource "azurerm_subnet" "appgw" {\n  name                 = "appgw-subnet"\n  resource_group_name  = azurerm_resource_group.main.name\n  virtual_network_name = azurerm_virtual_network.main.name\n  address_prefixes     = [var.subnet_address_prefix]\n}\n\n`;
    tf += `resource "azurerm_subnet_network_security_group_association" "appgw" {\n  subnet_id                 = azurerm_subnet.appgw.id\n  network_security_group_id = azurerm_network_security_group.appgw.id\n}\n\n`;
    // AppGW
    tf += `resource "azurerm_application_gateway" "main" {\n`;
    tf += `  name                = var.gateway_name\n`;
    tf += `  resource_group_name = azurerm_resource_group.main.name\n`;
    tf += `  location            = azurerm_resource_group.main.location\n\n`;
    tf += `  sku {\n    name     = "${cfg.sku.name}"\n    tier     = "${cfg.sku.tier}"\n    capacity = 2\n  }\n\n`;
    tf += `  gateway_ip_configuration {\n    name      = "gwIpConfig"\n    subnet_id = azurerm_subnet.appgw.id\n  }\n\n`;
    tf += `  frontend_ip_configuration {\n    name                 = "publicFrontend"\n    public_ip_address_id = azurerm_public_ip.appgw.id\n  }\n\n`;
    for (const port of cfg.frontendPorts) {
      tf += `  frontend_port {\n    name = "${port.name}"\n    port = ${port.port}\n  }\n\n`;
    }
    for (const pool of cfg.backendAddressPools) {
      tf += `  backend_address_pool {\n    name = "${pool.name}"\n  }\n\n`;
    }
    for (const s of cfg.backendHttpSettingsCollection) {
      tf += `  backend_http_settings {\n    name                  = "${s.name}"\n    cookie_based_affinity = "${s.cookieBasedAffinity || "Disabled"}"\n    port                  = ${s.port || 80}\n    protocol              = "${s.protocol || "Http"}"\n    request_timeout       = ${s.requestTimeout || 30}\n  }\n\n`;
    }
    for (const l of cfg.httpListeners) {
      tf += `  http_listener {\n    name                           = "${l.name}"\n    frontend_ip_configuration_name = "publicFrontend"\n    frontend_port_name             = "${cfg.frontendPorts[0]?.name || "port_80"}"\n    protocol                       = "${l.protocol || "Http"}"\n  }\n\n`;
    }
    for (let i = 0; i < cfg.requestRoutingRules.length; i++) {
      const r = cfg.requestRoutingRules[i];
      tf += `  request_routing_rule {\n    name                       = "${r.name}"\n    rule_type                  = "${r.ruleType || "Basic"}"\n    http_listener_name         = "${cfg.httpListeners[0]?.name || "http-listener"}"\n    backend_address_pool_name  = "${cfg.backendAddressPools[0]?.name || "default"}"\n    backend_http_settings_name = "${cfg.backendHttpSettingsCollection[0]?.name || "http-settings"}"\n    priority                   = ${r.priority || 100 + i * 10}\n  }\n\n`;
    }
    for (const p of cfg.probes) {
      tf += `  probe {\n    name                = "${p.name}"\n    protocol            = "${p.protocol || "Http"}"\n    path                = "${p.path || "/"}"\n    host                = "${p.host || "127.0.0.1"}"\n    interval            = ${p.interval || 30}\n    timeout             = ${p.timeout || 30}\n    unhealthy_threshold = ${p.unhealthyThreshold || 3}\n  }\n\n`;
    }
    tf += `}\n\n`;
    tf += `output "gateway_id" {\n  value = azurerm_application_gateway.main.id\n}\n\n`;
    tf += `output "public_ip" {\n  value = azurerm_public_ip.appgw.ip_address\n}\n`;
    return tf;
  }

  importTemplate(data: { template: ConfigTemplate }): ConfigTemplate {
    const template = data.template;
    // Generate new ID to avoid conflicts
    template.id = crypto.randomUUID();
    template.createdAt = new Date().toISOString();
    template.name = `${template.name} (imported)`;
    this.storage.add(template);
    logger.info("Template imported", { templateId: template.id, name: template.name });
    return template;
  }

  updateTemplate(
    id: string,
    subscriptionId: string,
    resourceGroup: string,
    gatewayName: string,
    updatedBy: string
  ): ConfigTemplate {
    const existing = this.getTemplate(id);

    // Save current version to history
    const versions = templateVersions.get(id) || [];
    versions.push({ ...existing });
    templateVersions.set(id, versions);

    // Update template config from live gateway (async not needed for storage)
    // For now, mark it as updated — full refresh happens on next save
    const updated: ConfigTemplate = {
      ...existing,
      createdAt: new Date().toISOString(),
      createdBy: updatedBy,
      description: `${existing.description} (updated)`,
    };

    this.storage.update(id, updated);
    logger.info("Template updated (version saved)", { templateId: id, version: versions.length });
    return updated;
  }

  getTemplateVersions(id: string): { current: ConfigTemplate; versions: ConfigTemplate[] } {
    const current = this.getTemplate(id);
    const versions = templateVersions.get(id) || [];
    return { current, versions };
  }

  restoreTemplateVersion(id: string, versionIndex: number): ConfigTemplate {
    const versions = templateVersions.get(id);
    if (!versions || versionIndex >= versions.length) {
      throw new Error("Version not found");
    }
    const target = versions[versionIndex];

    // Save current to versions
    const current = this.getTemplate(id);
    versions.push({ ...current });

    // Restore the old version
    const restored: ConfigTemplate = { ...target, id, createdAt: new Date().toISOString() };
    this.storage.update(id, restored);
    logger.info("Template version restored", { templateId: id, fromVersion: versionIndex });
    return restored;
  }

  async deployNew(
    id: string,
    subscriptionId: string,
    resourceGroup: string,
    gatewayName: string,
    location: string
  ): Promise<{ status: string; message: string }> {
    const template = this.getTemplate(id);
    const cfg = template.config;
    const networkService = new (await import("./networkService")).NetworkService();

    logger.info("Starting new gateway deployment from template", { id, gatewayName, resourceGroup, location });

    // 1. Ensure resource group
    await networkService.createResourceGroup(subscriptionId, resourceGroup, location);
    logger.info("Resource group ready", { resourceGroup });

    // 2. Create NSG with AppGW required rules
    const { NetworkManagementClient } = await import("@azure/arm-network");
    const { getAzureCredential } = await import("../config/azure");
    const netClient = new NetworkManagementClient(getAzureCredential(), subscriptionId);
    const nsgName = `${gatewayName}-nsg`;
    await netClient.networkSecurityGroups.beginCreateOrUpdateAndWait(resourceGroup, nsgName, {
      location,
      securityRules: [
        { name: "Allow-GatewayManager", priority: 100, direction: "Inbound", access: "Allow", protocol: "Tcp", sourceAddressPrefix: "GatewayManager", sourcePortRange: "*", destinationAddressPrefix: "*", destinationPortRange: "65200-65535" },
        { name: "Allow-HTTP", priority: 200, direction: "Inbound", access: "Allow", protocol: "Tcp", sourceAddressPrefix: "*", sourcePortRange: "*", destinationAddressPrefix: "*", destinationPortRange: "80" },
        { name: "Allow-HTTPS", priority: 210, direction: "Inbound", access: "Allow", protocol: "Tcp", sourceAddressPrefix: "*", sourcePortRange: "*", destinationAddressPrefix: "*", destinationPortRange: "443" },
      ],
    });
    const nsgId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/networkSecurityGroups/${nsgName}`;
    logger.info("NSG created", { nsgName });

    // 3. Create VNet + Subnet with NSG
    const vnetName = `${gatewayName}-vnet`;
    const subnetName = "appgw-subnet";
    await netClient.virtualNetworks.beginCreateOrUpdateAndWait(resourceGroup, vnetName, {
      location,
      addressSpace: { addressPrefixes: ["10.0.0.0/16"] },
      subnets: [{ name: subnetName, addressPrefix: "10.0.0.0/24", networkSecurityGroup: { id: nsgId } }],
    });
    const subnetId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/virtualNetworks/${vnetName}/subnets/${subnetName}`;
    logger.info("VNet + Subnet created", { vnetName, subnetName });

    // 4. Create Public IP
    const pipName = `${gatewayName}-pip`;
    await networkService.createPublicIp(subscriptionId, resourceGroup, pipName, location, "Standard");
    const pipId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/publicIPAddresses/${pipName}`;
    logger.info("Public IP created", { pipName });

    // 5. Create Application Gateway (async — takes 5-10 min)
    const basePath = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/applicationGateways/${gatewayName}`;
    const gwParams: any = {
      location,
      sku: { name: cfg.sku.name, tier: cfg.sku.tier, capacity: 2 },
      gatewayIPConfigurations: [{ name: "gwIpConfig", properties: { subnet: { id: subnetId } } }],
      frontendIPConfigurations: [{ name: "publicFrontend", properties: { publicIPAddress: { id: pipId } } }],
      frontendPorts: (cfg.frontendPorts || []).map((p: any) => ({ name: p.name, properties: { port: p.port } })),
      backendAddressPools: (cfg.backendAddressPools || []).map((p: any) => ({
        name: p.name, properties: { backendAddresses: p.backendAddresses || [] },
      })),
      backendHttpSettingsCollection: (cfg.backendHttpSettingsCollection || []).map((s: any) => ({
        name: s.name, properties: {
          port: s.port || 80, protocol: s.protocol || "Http",
          cookieBasedAffinity: s.cookieBasedAffinity || "Disabled", requestTimeout: s.requestTimeout || 30,
        },
      })),
      httpListeners: (cfg.httpListeners || []).map((l: any) => ({
        name: l.name, properties: {
          frontendIPConfiguration: { id: `${basePath}/frontendIPConfigurations/publicFrontend` },
          frontendPort: { id: `${basePath}/frontendPorts/${cfg.frontendPorts?.[0]?.name || "port_80"}` },
          protocol: l.protocol || "Http",
        },
      })),
      requestRoutingRules: (cfg.requestRoutingRules || []).map((r: any, i: number) => ({
        name: r.name, properties: {
          ruleType: r.ruleType || "Basic", priority: r.priority || (100 + i * 10),
          httpListener: { id: `${basePath}/httpListeners/${cfg.httpListeners?.[0]?.name || "http-listener"}` },
          backendAddressPool: { id: `${basePath}/backendAddressPools/${cfg.backendAddressPools?.[0]?.name || "default"}` },
          backendHttpSettings: { id: `${basePath}/backendHttpSettingsCollection/${cfg.backendHttpSettingsCollection?.[0]?.name || "http-settings"}` },
        },
      })),
      probes: (cfg.probes || []).map((p: any) => ({
        name: p.name, properties: {
          protocol: p.protocol || "Http", path: p.path || "/",
          interval: p.interval || 30, timeout: p.timeout || 30, unhealthyThreshold: p.unhealthyThreshold || 3,
          host: p.host || "127.0.0.1",
        },
      })),
    };

    const result = await this.gatewayService.createGateway(subscriptionId, resourceGroup, gatewayName, gwParams);
    logger.info("Gateway deployment initiated", { gatewayName, status: result.status });

    return {
      status: result.status || "provisioning",
      message: `Gateway "${gatewayName}" deployment started in ${resourceGroup} (${location}). NSG, VNet, Public IP created. Gateway takes 5-10 min to provision.`,
    };
  }
}
