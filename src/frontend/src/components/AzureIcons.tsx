import React from "react";

// Azure-style icons matching the official Azure architecture icon set
// Rendered as inline SVGs for crisp rendering at any size

export function AppGatewayIcon({ size = 20, color = "#0078d4" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 1L16 5v8l-7 4-7-4V5l7-4z" fill={color} opacity="0.2" />
      <path d="M9 1L16 5v8l-7 4-7-4V5l7-4z" stroke={color} strokeWidth="1.2" fill="none" />
      <circle cx="9" cy="6" r="1.5" fill={color} />
      <circle cx="5.5" cy="11" r="1.5" fill={color} />
      <circle cx="12.5" cy="11" r="1.5" fill={color} />
      <line x1="9" y1="7.5" x2="5.5" y2="9.5" stroke={color} strokeWidth="0.8" />
      <line x1="9" y1="7.5" x2="12.5" y2="9.5" stroke={color} strokeWidth="0.8" />
    </svg>
  );
}

export function FrontDoorIcon({ size = 20, color = "#008272" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="9" r="7.5" fill={color} opacity="0.15" stroke={color} strokeWidth="1.2" />
      <ellipse cx="9" cy="9" rx="3" ry="7.5" fill="none" stroke={color} strokeWidth="0.9" />
      <line x1="1.5" y1="9" x2="16.5" y2="9" stroke={color} strokeWidth="0.9" />
      <line x1="2.5" y1="5.5" x2="15.5" y2="5.5" stroke={color} strokeWidth="0.6" />
      <line x1="2.5" y1="12.5" x2="15.5" y2="12.5" stroke={color} strokeWidth="0.6" />
      <circle cx="9" cy="9" r="1.2" fill={color} />
    </svg>
  );
}

export function TrafficManagerIcon({ size = 20, color = "#5c2d91" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="1" width="6" height="4" rx="1" fill={color} opacity="0.9" />
      <rect x="1" y="13" width="5" height="3.5" rx="0.8" fill={color} opacity="0.7" />
      <rect x="6.5" y="13" width="5" height="3.5" rx="0.8" fill={color} opacity="0.7" />
      <rect x="12" y="13" width="5" height="3.5" rx="0.8" fill={color} opacity="0.7" />
      <line x1="9" y1="5" x2="9" y2="8" stroke={color} strokeWidth="1.2" />
      <line x1="3.5" y1="8" x2="14.5" y2="8" stroke={color} strokeWidth="1.2" />
      <line x1="3.5" y1="8" x2="3.5" y2="13" stroke={color} strokeWidth="1.2" />
      <line x1="9" y1="8" x2="9" y2="13" stroke={color} strokeWidth="1.2" />
      <line x1="14.5" y1="8" x2="14.5" y2="13" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

export function WafIcon({ size = 20, color = "#d83b01" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 1.5L15.5 4.5V9c0 3.5-2.8 6-6.5 7.5C5.3 15 2.5 12.5 2.5 9V4.5L9 1.5z" fill={color} opacity="0.15" stroke={color} strokeWidth="1.2" />
      <path d="M6 9l2 2 4-4.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

// Map of URL paths to their Azure icon components
export const AZURE_ICONS: Record<string, React.ReactNode> = {
  "/gateways": <AppGatewayIcon />,
  "/afd": <FrontDoorIcon />,
  "/traffic-manager": <TrafficManagerIcon />,
  "/waf": <WafIcon />,
  "/log-analytics": <span style={{ fontSize: 18 }}>📊</span>,
};
