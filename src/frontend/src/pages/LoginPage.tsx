import { useMsal } from "@azure/msal-react";
import { Stack, Text, PrimaryButton, Image } from "@fluentui/react";
import { loginRequest } from "../config/authConfig";

export function LoginPage() {
  const { instance } = useMsal();

  const handleLogin = () => {
    instance.loginRedirect(loginRequest).catch((error) => {
      console.error("Login failed:", error);
    });
  };

  return (
    <Stack
      verticalAlign="center"
      horizontalAlign="center"
      styles={{ root: { height: "100vh", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" } }}
    >
      <Stack
        styles={{
          root: {
            background: "white",
            borderRadius: 8,
            padding: 48,
            maxWidth: 440,
            width: "100%",
            textAlign: "center",
            boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
          },
        }}
        tokens={{ childrenGap: 24 }}
      >
        <Text variant="xxLarge" styles={{ root: { fontWeight: 700, color: "#0078d4" } }}>
          AppGW Manager
        </Text>
        <Text variant="large" styles={{ root: { color: "#605e5c" } }}>
          Azure Application Gateway Centralized Manager
        </Text>
        <Text styles={{ root: { color: "#a19f9d" } }}>
          Manage your Application Gateways using natural language. Just tell the AI what you need — create, configure, monitor, and troubleshoot across all subscriptions.
        </Text>
        <PrimaryButton
          text="Sign in with Microsoft"
          onClick={handleLogin}
          iconProps={{ iconName: "AzureLogo" }}
          styles={{
            root: { height: 44, fontSize: 16, borderRadius: 4 },
          }}
        />
      </Stack>
    </Stack>
  );
}
