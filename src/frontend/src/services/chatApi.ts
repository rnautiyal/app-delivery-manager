import axios from "axios";
import { apiConfig } from "../config/authConfig";

// Re-use the same token getter from the main api service
import { getAccessToken } from "./api";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function sendChatMessage(
  message: string,
  conversationId?: string
): Promise<{ response: string; conversationId: string }> {
  const token = await getAccessToken();
  const { data } = await axios.post(
    `${apiConfig.baseUrl}/chat`,
    { message, conversationId },
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 600000,
    }
  );
  return data.data;
}

export async function getConversationHistory(conversationId: string): Promise<ChatMessage[]> {
  const token = await getAccessToken();
  const { data } = await axios.get(`${apiConfig.baseUrl}/chat/${conversationId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.data;
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const token = await getAccessToken();
  await axios.delete(`${apiConfig.baseUrl}/chat/${conversationId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
