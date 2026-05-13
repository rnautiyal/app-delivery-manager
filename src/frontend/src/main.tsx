import React from "react";
import ReactDOM from "react-dom/client";
import { PublicClientApplication, EventType } from "@azure/msal-browser";
import { msalConfig } from "./config/authConfig";
import { setMsalInstance } from "./services/api";
import App from "./App";

const msalInstance = new PublicClientApplication(msalConfig);
setMsalInstance(msalInstance);

msalInstance.initialize().then(async () => {
  // Handle redirect response
  try {
    const response = await msalInstance.handleRedirectPromise();
    if (response?.account) {
      msalInstance.setActiveAccount(response.account);
    }
  } catch (error) {
    console.error("Redirect error:", error);
  }

  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
  }

  msalInstance.addEventCallback((event) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && (event.payload as any)?.account) {
      msalInstance.setActiveAccount((event.payload as any).account);
    }
  });

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App msalInstance={msalInstance} />
    </React.StrictMode>
  );
});
