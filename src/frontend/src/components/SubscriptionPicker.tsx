import { Dropdown, IDropdownOption } from "@fluentui/react";
import { Subscription } from "../types";

interface SubscriptionPickerProps {
  subscriptions: Subscription[];
  selectedSubscription: string;
  onChange: (subscriptionId: string) => void;
  loading?: boolean;
}

export function SubscriptionPicker({
  subscriptions,
  selectedSubscription,
  onChange,
  loading,
}: SubscriptionPickerProps) {
  const options: IDropdownOption[] = subscriptions.map((sub) => ({
    key: sub.id,
    text: `${sub.name} (${sub.id})`,
  }));

  return (
    <Dropdown
      label="Subscription"
      selectedKey={selectedSubscription}
      options={options}
      onChange={(_, option) => option && onChange(option.key as string)}
      disabled={loading}
      placeholder={loading ? "Loading subscriptions..." : "Select a subscription"}
      styles={{ root: { maxWidth: 400 } }}
    />
  );
}
