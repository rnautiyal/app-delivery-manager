import { execSync } from "child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { logger } from "../config/logger";

export class CertGenService {
  generateSelfSignedCert(commonName: string, daysValid: number = 365): { pfxBase64: string; password: string } {
    // Sanitize commonName to prevent shell injection
    const sanitizedCN = commonName.replace(/[^a-zA-Z0-9.*\-_]/g, "");
    if (!sanitizedCN) throw new Error("Invalid common name");

    const tempDir = mkdtempSync(join(tmpdir(), "cert-"));
    const keyPath = join(tempDir, "key.pem");
    const certPath = join(tempDir, "cert.pem");
    const pfxPath = join(tempDir, "cert.pfx");
    const confPath = join(tempDir, "openssl.cnf");
    const password = this.generatePassword();

    try {
      logger.info("Generating self-signed certificate", { commonName, daysValid });

      // Write OpenSSL config to handle SAN properly
      const opensslConf = `
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_ca

[dn]
CN = ${sanitizedCN}

[v3_ca]
subjectAltName = DNS:${sanitizedCN}
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
`;
      writeFileSync(confPath, opensslConf);

      // Generate private key + self-signed cert using config file
      execSync(
        `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days ${daysValid} -nodes -config "${confPath}"`,
        { timeout: 30000, stdio: "pipe" }
      );

      // Convert to PFX (PKCS#12) which Azure App Gateway requires
      // Use -legacy flag if available for broader compatibility
      try {
        execSync(
          `openssl pkcs12 -export -out "${pfxPath}" -inkey "${keyPath}" -in "${certPath}" -password pass:"${password}" -legacy`,
          { timeout: 30000, stdio: "pipe" }
        );
      } catch (_e) {
        // Fallback without -legacy flag
        execSync(
          `openssl pkcs12 -export -out "${pfxPath}" -inkey "${keyPath}" -in "${certPath}" -password pass:"${password}"`,
          { timeout: 30000, stdio: "pipe" }
        );
      }

      const pfxBuffer = readFileSync(pfxPath);
      const pfxBase64 = pfxBuffer.toString("base64");

      logger.info("Self-signed certificate generated successfully", { commonName, size: pfxBase64.length });

      return { pfxBase64, password };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Failed to generate certificate", { commonName, error: errMsg });
      // Check if openssl is available
      try {
        const version = execSync("openssl version", { stdio: "pipe" }).toString().trim();
        logger.info("OpenSSL version", { version });
      } catch (_e) {
        logger.error("OpenSSL is not installed in this container");
      }
      throw new Error(`Failed to generate certificate: ${errMsg}`);
    } finally {
      try { rmSync(tempDir, { recursive: true }); } catch (_e) { /* cleanup */ }
    }
  }

  private generatePassword(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let password = "";
    for (let i = 0; i < 24; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
