import { ClientSecretCredential, DefaultAzureCredential, ManagedIdentityCredential, TokenCredential } from "@azure/identity";
import { config } from "./env";
import { logger } from "./logger";

let credential: TokenCredential;

export function getAzureCredential(): TokenCredential {
  if (credential) return credential;

  if (config.azure.clientId && config.azure.clientSecret && config.azure.tenantId) {
    logger.info("Using ClientSecretCredential for Azure authentication");
    credential = new ClientSecretCredential(
      config.azure.tenantId,
      config.azure.clientId,
      config.azure.clientSecret
    );
  } else if (process.env.AZURE_MANAGED_IDENTITY_CLIENT_ID) {
    logger.info("Using ManagedIdentityCredential with explicit client ID");
    credential = new ManagedIdentityCredential(process.env.AZURE_MANAGED_IDENTITY_CLIENT_ID);
  } else {
    logger.info("Using DefaultAzureCredential (managed identity / local dev)");
    credential = new DefaultAzureCredential({ managedIdentityClientId: undefined });
  }

  return credential;
}
