import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  azure: {
    tenantId: process.env.AZURE_TENANT_ID || "",
    clientId: process.env.AZURE_CLIENT_ID || "",
    clientSecret: process.env.AZURE_CLIENT_SECRET || "",
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
  },
  auth: {
    audience: process.env.AUTH_AUDIENCE || "",
    issuer: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`,
    issuerV1: `https://sts.windows.net/${process.env.AZURE_TENANT_ID}/`,
  },
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  },
  logLevel: process.env.LOG_LEVEL || "info",
};
