import { SubscriptionClient } from "@azure/arm-resources-subscriptions";
import { getAzureCredential } from "../config/azure";
import { logger } from "../config/logger";

export class SubscriptionService {
  private client: SubscriptionClient;

  constructor() {
    this.client = new SubscriptionClient(getAzureCredential());
  }

  async listSubscriptions() {
    const subscriptions = [];
    try {
      for await (const sub of this.client.subscriptions.list()) {
        subscriptions.push({
          id: sub.subscriptionId,
          name: sub.displayName,
          state: sub.state,
        });
      }
    } catch (error) {
      logger.error("Failed to list subscriptions", { error });
      throw error;
    }
    return subscriptions;
  }
}
