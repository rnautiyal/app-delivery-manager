import { NetworkManagementClient } from "@azure/arm-network";
import { CertificateClient } from "@azure/keyvault-certificates";
import { X509Certificate } from "crypto";
import { getAzureCredential } from "../config/azure";
import { logger } from "../config/logger";
import { CertificateInfo } from "../models/types";

export class CertificateService {
  private getNetworkClient(subscriptionId: string): NetworkManagementClient {
    return new NetworkManagementClient(getAzureCredential(), subscriptionId);
  }

  async listCertificatesAcrossGateways(subscriptionId: string): Promise<CertificateInfo[]> {
    const client = this.getNetworkClient(subscriptionId);
    const certs: CertificateInfo[] = [];

    try {
      for await (const gw of client.applicationGateways.listAll()) {
        const resourceGroup = gw.id?.split("/")[4] || "";

        for (const sslCert of gw.sslCertificates || []) {
          const certInfo: CertificateInfo = {
            id: sslCert.id || "",
            name: sslCert.name || "",
            gatewayId: gw.id || "",
            gatewayName: gw.name || "",
            resourceGroup,
            subscriptionId,
            keyVaultSecretId: sslCert.keyVaultSecretId,
          };

          if (sslCert.keyVaultSecretId) {
            try {
              const kvDetails = await this.getKeyVaultCertDetails(sslCert.keyVaultSecretId);
              certInfo.expiryDate = kvDetails.expiryDate;
              certInfo.subject = kvDetails.subject;
              certInfo.thumbprint = kvDetails.thumbprint;
              if (certInfo.expiryDate) {
                certInfo.daysUntilExpiry = Math.ceil(
                  (certInfo.expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );
              }
            } catch (kvError) {
              logger.warn("Could not fetch Key Vault cert details", {
                secretId: sslCert.keyVaultSecretId,
                error: kvError,
              });
            }
          } else if ((sslCert as any).publicCertData) {
            // Parse expiry from inline PFX cert's public cert data (PKCS7 format)
            try {
              const rawB64 = (sslCert as any).publicCertData;
              const rawBuffer = Buffer.from(rawB64, "base64");
              
              // Azure returns PKCS7 envelope. Try to find the embedded certificate
              // by looking for the DER certificate sequence (starts with 0x30 0x82)
              // inside the PKCS7 structure. The actual cert starts after the PKCS7 header.
              let parsed = false;
              
              // First try: parse as raw X.509 DER
              try {
                const derPem = `-----BEGIN CERTIFICATE-----\n${rawB64}\n-----END CERTIFICATE-----`;
                const x509 = new X509Certificate(derPem);
                certInfo.expiryDate = new Date(x509.validTo);
                certInfo.subject = x509.subject;
                certInfo.thumbprint = x509.fingerprint;
                parsed = true;
              } catch {
                // Not a raw cert — it's PKCS7
              }
              
              // Second try: scan for embedded cert in PKCS7
              if (!parsed) {
                // Find the certificate within PKCS7 by locating the inner SEQUENCE
                // OID 1.2.840.113549.1.7.2 = signedData, certs are at a known offset
                const hexStr = rawBuffer.toString("hex");
                // Look for common cert OID patterns (2.5.4.3 = CN) to find cert start
                // The cert is a DER SEQUENCE starting with 30 82
                const certStarts: number[] = [];
                for (let i = 0; i < rawBuffer.length - 4; i++) {
                  if (rawBuffer[i] === 0x30 && rawBuffer[i + 1] === 0x82) {
                    certStarts.push(i);
                  }
                }
                // Try each potential cert start (skip the first one which is the PKCS7 wrapper itself)
                for (const start of certStarts.slice(1)) {
                  try {
                    const len = (rawBuffer[start + 2] << 8) | rawBuffer[start + 3];
                    const certDer = rawBuffer.slice(start, start + len + 4);
                    const certB64 = certDer.toString("base64");
                    const certPem = `-----BEGIN CERTIFICATE-----\n${certB64}\n-----END CERTIFICATE-----`;
                    const x509 = new X509Certificate(certPem);
                    certInfo.expiryDate = new Date(x509.validTo);
                    certInfo.subject = x509.subject;
                    certInfo.thumbprint = x509.fingerprint;
                    parsed = true;
                    break;
                  } catch {
                    // Not a valid cert at this offset, try next
                  }
                }
              }
              
              if (parsed && certInfo.expiryDate) {
                certInfo.daysUntilExpiry = Math.ceil(
                  (certInfo.expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );
              }
            } catch (parseError) {
              logger.warn("Could not parse public cert data", {
                certName: sslCert.name,
                error: parseError,
              });
            }
          }

          certs.push(certInfo);
        }
      }
    } catch (error) {
      logger.error("Failed to list certificates", { subscriptionId, error });
      throw error;
    }

    return certs;
  }

  async getExpiringCertificates(subscriptionId: string, daysThreshold: number = 30): Promise<CertificateInfo[]> {
    const allCerts = await this.listCertificatesAcrossGateways(subscriptionId);
    return allCerts.filter(
      (cert) => cert.daysUntilExpiry !== undefined && cert.daysUntilExpiry <= daysThreshold
    );
  }

  private async getKeyVaultCertDetails(secretId: string) {
    const vaultUrl = this.extractVaultUrl(secretId);
    const certName = this.extractCertName(secretId);

    const certClient = new CertificateClient(vaultUrl, getAzureCredential());
    const cert = await certClient.getCertificate(certName);

    return {
      expiryDate: cert.properties.expiresOn,
      subject: cert.policy?.subject,
      thumbprint: cert.properties.x509Thumbprint
        ? Buffer.from(cert.properties.x509Thumbprint).toString("hex")
        : undefined,
    };
  }

  private extractVaultUrl(secretId: string): string {
    const match = secretId.match(/^(https:\/\/[^/]+)/);
    return match ? match[1] : "";
  }

  private extractCertName(secretId: string): string {
    const parts = secretId.split("/");
    return parts[parts.length - 2] || parts[parts.length - 1];
  }
}
