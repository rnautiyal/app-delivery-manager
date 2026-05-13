import { Configuration, LogLevel } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID || "",
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID || "common"}`,
    redirectUri: import.meta.env.VITE_AZURE_REDIRECT_URI || "http://localhost:3000",
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message) => {
        if (level === LogLevel.Error) console.error(message);
      },
      logLevel: LogLevel.Error,
    },
  },
};

export const loginRequest = {
  scopes: ["openid", "profile", "email"],
};

export const apiConfig = {
  baseUrl: import.meta.env.VITE_API_URL || "/api",
};
