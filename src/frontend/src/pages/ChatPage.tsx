import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Stack,
  Text,
  TextField,
  PrimaryButton,
  IconButton,
  Spinner,
  Persona,
  PersonaSize,
} from "@fluentui/react";
import { useMsal } from "@azure/msal-react";
import { sendChatMessage, ChatMessage } from "../services/chatApi";
import { AppGatewayIcon, FrontDoorIcon, TrafficManagerIcon, WafIcon } from "../components/AzureIcons";

interface SuggestionGroup {
  label: string;
  iconNode: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  items: { text: string; icon: string }[];
}

const SUGGESTION_GROUPS: SuggestionGroup[] = [
  {
    label: "Application Gateway",
    iconNode: <AppGatewayIcon size={24} color="#0078d4" />,
    color: "#0078d4",
    bgColor: "linear-gradient(135deg, #e8f4fd 0%, #d0e8f7 100%)",
    borderColor: "#0078d4",
    items: [
      { text: "List all Application Gateways and their health status", icon: "📋" },
      { text: "Create a WAF_v2 gateway in eastus with backend pool 10.0.2.4:80", icon: "🆕" },
      { text: "Add an HTTPS listener with SSL certificate to my gateway", icon: "🔒" },
      { text: "Why is my gateway returning 502 Bad Gateway errors?", icon: "🔍" },
      { text: "Check backend health across all my gateways", icon: "💚" },
      { text: "Show me gateways with expiring SSL certificates", icon: "⏰" },
    ],
  },
  {
    label: "Azure Front Door",
    iconNode: <FrontDoorIcon size={24} color="#008272" />,
    color: "#008272",
    bgColor: "linear-gradient(135deg, #e0f7f3 0%, #c8efe8 100%)",
    borderColor: "#008272",
    items: [
      { text: "Compare Azure Front Door vs Application Gateway for my workload", icon: "⚖️" },
      { text: "What are the best practices for AFD routing rules?", icon: "📐" },
      { text: "How do I configure custom domains and SSL on Front Door?", icon: "🔒" },
      { text: "Explain AFD caching and compression settings", icon: "⚡" },
      { text: "How to set up geo-filtering with Azure Front Door?", icon: "🗺️" },
      { text: "Migrate from Application Gateway to Azure Front Door", icon: "🔄" },
    ],
  },
  {
    label: "Traffic Manager",
    iconNode: <TrafficManagerIcon size={24} color="#5c2d91" />,
    color: "#5c2d91",
    bgColor: "linear-gradient(135deg, #f0ebf8 0%, #e2d6f0 100%)",
    borderColor: "#5c2d91",
    items: [
      { text: "List all Traffic Manager profiles and their endpoints", icon: "📋" },
      { text: "Create a weighted Traffic Manager profile for blue-green deployment", icon: "🆕" },
      { text: "Which Traffic Manager endpoints are degraded or offline?", icon: "🔴" },
      { text: "Configure geographic routing for multi-region failover", icon: "🌍" },
      { text: "How to set up priority-based routing with health probes?", icon: "📊" },
      { text: "Optimize Traffic Manager probe intervals and TTL settings", icon: "⚙️" },
    ],
  },
  {
    label: "Web Application Firewall",
    iconNode: <WafIcon size={24} color="#d83b01" />,
    color: "#d83b01",
    bgColor: "linear-gradient(135deg, #fef0e8 0%, #fce0d0 100%)",
    borderColor: "#d83b01",
    items: [
      { text: "Show WAF policies and which gateways have WAF disabled", icon: "📋" },
      { text: "Create a WAF policy with OWASP 3.2 managed rules", icon: "🆕" },
      { text: "Add custom WAF rules to block specific IP ranges", icon: "🚫" },
      { text: "Why is WAF blocking legitimate traffic? Show recent blocks", icon: "🔍" },
      { text: "Switch WAF from detection mode to prevention mode", icon: "🛡️" },
      { text: "Set up WAF exclusions for false positive rules", icon: "✅" },
    ],
  },
];

export function ChatPage() {
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(text?: string) {
    const messageText = text || input;
    if (!messageText.trim() || loading) return;

    const userMessage: ChatMessage = { role: "user", content: messageText };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const result = await sendChatMessage(messageText, conversationId);
      setConversationId(result.conversationId);
      setMessages((prev) => [...prev, { role: "assistant", content: result.response }]);
    } catch (error: any) {
      const upgradeRequired = error?.response?.data?.upgradeRequired;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: upgradeRequired
            ? "🔒 AppDelivery Genie AI requires a Pro or Enterprise plan.\n\nYour current plan doesn't include AI chat. You can:\n• Use the **Command Palette** for direct operations (free)\n• Upgrade to **Pro ($99/mo)** for 50 AI requests\n• Upgrade to **Enterprise ($299/mo)** for 500 AI requests\n\nGo to Billing & Usage to upgrade your plan."
            : "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleNewChat() {
    setMessages([]);
    setConversationId(undefined);
  }

  const userName = accounts[0]?.name || "You";

  return (
    <Stack styles={{ root: { height: "100%", display: "flex", flexDirection: "column" } }}>
      {/* Header */}
      <Stack
        horizontal
        verticalAlign="center"
        tokens={{ padding: "12px 24px", childrenGap: 12 }}
        styles={{
          root: {
            borderBottom: "1px solid #edebe9",
            background: "white",
          },
        }}
      >
        <IconButton
          iconProps={{ iconName: "Back" }}
          title="Go back"
          onClick={() => navigate(-1)}
          styles={{ root: { marginRight: 4 } }}
        />
        <span style={{ fontSize: 24, marginRight: 4 }}>{"\uD83E\uDDDE"}</span>
        <Text variant="xLarge" styles={{ root: { fontWeight: 600, flex: 1 } }}>
          AppDelivery Genie
        </Text>
        <IconButton
          iconProps={{ iconName: "Add" }}
          title="New conversation"
          onClick={handleNewChat}
        />
      </Stack>

      {/* Messages */}
      <Stack
        styles={{
          root: {
            flex: 1,
            overflow: "auto",
            padding: "24px",
            background: "#faf9f8",
          },
        }}
      >
        {messages.length === 0 ? (
          <Stack
            verticalAlign="center"
            horizontalAlign="center"
            styles={{ root: { flex: 1, paddingTop: 60 } }}
            tokens={{ childrenGap: 24 }}
          >
            <Text variant="xxLarge" styles={{ root: { fontWeight: 700, color: "#323130" } }}>
              What can I help you with?
            </Text>
            <Text styles={{ root: { color: "#605e5c", maxWidth: 640, textAlign: "center", fontSize: 15, lineHeight: "22px" } }}>
              Your AI assistant for Azure networking — manage Application Gateways, Front Door, Traffic Manager, and WAF policies with natural language.
            </Text>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                gap: 20,
                maxWidth: 900,
                width: "100%",
                marginTop: 8,
              }}
            >
              {SUGGESTION_GROUPS.map((group) => (
                <div
                  key={group.label}
                  style={{
                    background: "white",
                    borderRadius: 12,
                    border: `1px solid ${group.borderColor}22`,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                    overflow: "hidden",
                    transition: "box-shadow 0.2s ease",
                  }}
                >
                  <div
                    style={{
                      background: group.bgColor,
                      padding: "14px 18px",
                      borderBottom: `2px solid ${group.borderColor}33`,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center" }}>{group.iconNode}</span>
                    <Text variant="mediumPlus" styles={{ root: { fontWeight: 700, color: group.color, letterSpacing: "0.3px" } }}>
                      {group.label}
                    </Text>
                  </div>
                  <div style={{ padding: "8px 10px" }}>
                    {group.items.map((item, i) => (
                      <div
                        key={i}
                        onClick={() => handleSend(item.text)}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          padding: "10px 10px",
                          borderRadius: 8,
                          cursor: "pointer",
                          transition: "background 0.15s ease",
                          borderBottom: i < group.items.length - 1 ? "1px solid #f3f2f1" : "none",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = `${group.borderColor}0a`; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                      >
                        <span style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }}>{item.icon}</span>
                        <Text variant="small" styles={{ root: { color: "#323130", lineHeight: "20px" } }}>{item.text}</Text>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Stack>
        ) : (
          <Stack tokens={{ childrenGap: 16 }} styles={{ root: { maxWidth: 800, margin: "0 auto", width: "100%" } }}>
            {messages.map((msg, i) => (
              <Stack
                key={i}
                horizontal
                tokens={{ childrenGap: 12 }}
                styles={{
                  root: {
                    padding: 16,
                    borderRadius: 8,
                    background: msg.role === "user" ? "#e8f0fe" : "#ffffff",
                    border: msg.role === "assistant" ? "1px solid #0078d422" : "none",
                    borderLeft: msg.role === "assistant" ? "3px solid #0078d4" : "none",
                  },
                }}
              >
                <Persona
                  text={msg.role === "user" ? userName : "AI Assistant"}
                  size={PersonaSize.size32}
                  hidePersonaDetails
                  initialsColor={msg.role === "user" ? 0 : 6}
                />
                <Stack styles={{ root: { flex: 1, paddingTop: 4 } }}>
                  <Text
                    variant="small"
                    styles={{ root: { fontWeight: 600, marginBottom: 4, color: "#605e5c" } }}
                  >
                    {msg.role === "user" ? userName : "AppDelivery Genie"}
                  </Text>
                  <div
                    style={{
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.6,
                      fontSize: 14,
                      color: "#323130",
                    }}
                  >
                    {msg.content}
                  </div>
                </Stack>
              </Stack>
            ))}
            {loading && (
              <Stack
                horizontal
                tokens={{ childrenGap: 12 }}
                styles={{
                  root: {
                    padding: 16,
                    borderRadius: 8,
                    background: "white",
                    border: "1px solid #edebe9",
                  },
                }}
              >
                <Persona text="AI Assistant" size={PersonaSize.size32} hidePersonaDetails initialsColor={6} />
                <Spinner label="Analyzing your gateways..." />
              </Stack>
            )}
            <div ref={messagesEndRef} />
          </Stack>
        )}
      </Stack>

      {/* Input */}
      <Stack
        horizontal
        verticalAlign="end"
        tokens={{ padding: "16px 24px", childrenGap: 8 }}
        styles={{
          root: {
            borderTop: "1px solid #edebe9",
            background: "white",
          },
        }}
      >
        <Stack styles={{ root: { flex: 1 } }}>
          <TextField
            multiline
            autoAdjustHeight
            rows={1}
            placeholder="Ask about your gateways... (e.g., 'Why is my gateway returning 502 errors?')"
            value={input}
            onChange={(_, val) => setInput(val || "")}
            onKeyDown={handleKeyDown}
            disabled={loading}
            styles={{
              root: { width: "100%" },
              fieldGroup: { borderRadius: 8, minHeight: 44 },
            }}
          />
        </Stack>
        <PrimaryButton
          iconProps={{ iconName: "Send" }}
          onClick={() => handleSend()}
          disabled={!input.trim() || loading}
          styles={{ root: { height: 44, borderRadius: 8 } }}
        />
      </Stack>
    </Stack>
  );
}
