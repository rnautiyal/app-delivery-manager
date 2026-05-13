import { useState, useEffect } from "react";
import { Subscription } from "../types";
import { getSubscriptions } from "../services/api";

const HARDCODED_SUB: Subscription = {
  id: "64d48c73-c5f4-4817-93d8-65908359d9b4",
  name: "rnautiyal@lab",
  state: "Enabled",
};

export function useSubscriptions() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([HARDCODED_SUB]);
  const [selectedSubscription, setSelectedSubscription] = useState<string>(HARDCODED_SUB.id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const subs = await getSubscriptions();
        if (subs.length > 0) {
          // Prepend hardcoded sub if not already in the list
          const hasSub = subs.find(s => s.id === HARDCODED_SUB.id);
          setSubscriptions(hasSub ? subs : [HARDCODED_SUB, ...subs]);
        }
      } catch {
        // API failed (demo mode) — keep the hardcoded subscription
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return { subscriptions, selectedSubscription, setSelectedSubscription, loading, error };
}
