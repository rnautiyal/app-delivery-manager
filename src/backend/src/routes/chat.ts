import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { AIAgentService } from "../services/aiAgentService";
import { getUsageSummary } from "../services/usageTracker";
import { AuthenticatedRequest } from "../middleware/auth";
import { logger } from "../config/logger";
import { BillingService } from "../services/billingService";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();
const aiAgent = new AIAgentService();
const billingService = new BillingService();

// Rate limit only POST (chat messages), not GET routes
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.CHAT_RATE_LIMIT || "20", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many chat requests. Please wait before sending more." },
});

// In-memory conversation store
const conversations = new Map<string, Anthropic.MessageParam[]>();

// Get AI usage stats (must be before /:conversationId)
router.get("/usage/stats", (async (_req: Request, res: Response) => {
  res.json({ success: true, data: getUsageSummary() });
}) as any);

// Send a chat message
router.post("/", chatLimiter, (async (req: Request, res: Response) => {
  try {
    const { message, conversationId } = req.body;
    const authReq = req as AuthenticatedRequest;

    if (!message) {
      res.status(400).json({ success: false, error: "Message is required" });
      return;
    }

    // Check if user's plan allows AI
    const userId = authReq.appUser?.oid || "anonymous";
    const userName = authReq.appUser?.name || "User";
    const summary = billingService.getBillingSummary(userId, userName);
    if (!summary.aiEnabled) {
      res.status(403).json({
        success: false,
        error: "AI chat requires a Pro or Enterprise plan. Please upgrade to access AppDelivery Genie.",
        upgradeRequired: true,
      });
      return;
    }

    const convId = conversationId || `conv_${Date.now()}_${authReq.appUser?.oid}`;

    let history = conversations.get(convId) || [];
    history.push({ role: "user", content: message });

    logger.info("Chat message received", {
      conversationId: convId,
      user: (req as AuthenticatedRequest).appUser?.email,
      message: message.substring(0, 100),
    });

    const { response, messages: updatedMessages } = await aiAgent.chat(history);

    conversations.set(convId, updatedMessages);

    res.json({
      success: true,
      data: {
        conversationId: convId,
        response,
      },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    logger.error("Chat error", { error: errMsg, stack: errStack });
    res.status(500).json({
      success: false,
      error: errMsg,
    });
  }
}) as any);

// Get conversation history
router.get("/:conversationId", (async (req: Request, res: Response) => {
  const history = conversations.get(req.params.conversationId);
  if (!history) {
    res.status(404).json({ success: false, error: "Conversation not found" });
    return;
  }

  const displayMessages = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      if (typeof m.content === "string") {
        return { role: m.role, content: m.content };
      }
      const textBlocks = (m.content as any[])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { role: m.role, content: textBlocks };
    })
    .filter((m) => m.content);

  res.json({ success: true, data: displayMessages });
}) as any);

// Delete conversation
router.delete("/:conversationId", (async (req: Request, res: Response) => {
  conversations.delete(req.params.conversationId);
  res.json({ success: true, message: "Conversation deleted" });
}) as any);

export default router;
