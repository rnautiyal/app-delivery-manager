@description('The location for all resources')
param location string = resourceGroup().location

@description('The name of the container app environment')
param environmentName string = 'appgw-manager-env'

@description('The name of the container app')
param containerAppName string = 'appgw-manager'

@description('The container image to deploy')
param containerImage string

@description('Azure AD Tenant ID')
@secure()
param azureTenantId string

@description('Azure AD Client ID')
@secure()
param azureClientId string

@description('Azure AD Client Secret')
@secure()
param azureClientSecret string

@description('Auth Audience')
param authAudience string = 'api://appgw-manager'

@description('CORS Origin')
param corsOrigin string = 'https://appgw-manager.azurecontainerapps.io'

// Log Analytics Workspace
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${environmentName}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// Container App Environment
resource containerAppEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: environmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// Container App
resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: containerAppName
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'http'
        allowInsecure: false
      }
      secrets: [
        { name: 'azure-tenant-id', value: azureTenantId }
        { name: 'azure-client-id', value: azureClientId }
        { name: 'azure-client-secret', value: azureClientSecret }
      ]
    }
    template: {
      containers: [
        {
          name: containerAppName
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'AZURE_TENANT_ID', secretRef: 'azure-tenant-id' }
            { name: 'AZURE_CLIENT_ID', secretRef: 'azure-client-id' }
            { name: 'AZURE_CLIENT_SECRET', secretRef: 'azure-client-secret' }
            { name: 'AUTH_AUDIENCE', value: authAudience }
            { name: 'CORS_ORIGIN', value: corsOrigin }
            { name: 'PORT', value: '8080' }
            { name: 'NODE_ENV', value: 'production' }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 10
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
}

output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output containerAppName string = containerApp.name
