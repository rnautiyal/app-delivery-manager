#!/bin/bash
set -e

# Configuration
RESOURCE_GROUP="${RESOURCE_GROUP:-appgw-manager-rg}"
LOCATION="${LOCATION:-eastus}"
ACR_NAME="${ACR_NAME:-appgwmanageracr}"
CONTAINER_APP_NAME="${CONTAINER_APP_NAME:-appgw-manager}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

echo "=== AppGW Manager Deployment ==="
echo "Resource Group: $RESOURCE_GROUP"
echo "Location: $LOCATION"
echo "ACR: $ACR_NAME"

# Step 1: Create resource group
echo "Creating resource group..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION"

# Step 2: Deploy ACR
echo "Deploying Azure Container Registry..."
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file ../bicep/acr.bicep \
  --parameters acrName="$ACR_NAME"

# Step 3: Get ACR login server
ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)
echo "ACR Login Server: $ACR_LOGIN_SERVER"

# Step 4: Build and push Docker image
echo "Building and pushing Docker image..."
az acr build --registry "$ACR_NAME" --image "appgw-manager:$IMAGE_TAG" ../../

# Step 5: Deploy Container App
echo "Deploying Container App..."
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file ../bicep/main.bicep \
  --parameters \
    containerImage="$ACR_LOGIN_SERVER/appgw-manager:$IMAGE_TAG" \
    azureTenantId="$AZURE_TENANT_ID" \
    azureClientId="$AZURE_CLIENT_ID" \
    azureClientSecret="$AZURE_CLIENT_SECRET"

# Step 6: Get app URL
APP_URL=$(az containerapp show --name "$CONTAINER_APP_NAME" --resource-group "$RESOURCE_GROUP" --query "properties.configuration.ingress.fqdn" -o tsv)
echo ""
echo "=== Deployment Complete ==="
echo "App URL: https://$APP_URL"
echo ""
echo "Next steps:"
echo "1. Register the app URL as a redirect URI in your Azure AD app registration"
echo "2. Update CORS_ORIGIN to https://$APP_URL"
echo "3. Configure the frontend VITE_AZURE_REDIRECT_URI to https://$APP_URL"
