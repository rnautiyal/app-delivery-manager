import React from "react";

interface SectionDividerProps {
  title: string;
  emoji?: string;
  count?: number;
  action?: React.ReactNode;
}

export const SectionDivider: React.FC<SectionDividerProps> = ({ title, emoji, count, action }) => (
  <div className="section-divider">
    <h2>
      {emoji && <span>{emoji}</span>}
      {title}
      {count !== undefined && <span className="section-count">{count}</span>}
    </h2>
    {action}
  </div>
);
