@description('The location for the ACR')
param location string = resourceGroup().location

@description('The name of the Azure Container Registry')
param acrName string = 'appgwmanageracr'

@description('The SKU of the ACR')
param acrSku string = 'Basic'

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: {
    name: acrSku
  }
  properties: {
    adminUserEnabled: true
  }
}

output acrLoginServer string = acr.properties.loginServer
output acrName string = acr.name
