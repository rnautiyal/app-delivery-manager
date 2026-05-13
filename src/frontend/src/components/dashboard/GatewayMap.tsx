import React from "react";
import { useNavigate } from "react-router-dom";
import { Text, Stack } from "@fluentui/react";
import { GatewayListItem, TrafficManagerProfile, AfdProfile } from "../../types";

interface Props {
  gateways: GatewayListItem[];
  trafficManagerProfiles?: TrafficManagerProfile[];
  afdProfiles?: AfdProfile[];
}

// Azure region coordinates — well-spaced on a 280x140 viewBox
const regionCoords: Record<string, { x: number; y: number; label: string }> = {
  eastus:             { x: 78,  y: 62,  label: "East US" },
  eastus2:            { x: 84,  y: 72,  label: "East US 2" },
  westus:             { x: 28,  y: 60,  label: "West US" },
  westus2:            { x: 24,  y: 52,  label: "West US 2" },
  westus3:            { x: 30,  y: 68,  label: "West US 3" },
  centralus:          { x: 54,  y: 58,  label: "Central US" },
  northcentralus:     { x: 56,  y: 48,  label: "N. Central US" },
  southcentralus:     { x: 50,  y: 72,  label: "S. Central US" },
  westeurope:         { x: 132, y: 46,  label: "West Europe" },
  northeurope:        { x: 126, y: 34,  label: "North Europe" },
  uksouth:            { x: 122, y: 40,  label: "UK South" },
  ukwest:             { x: 118, y: 36,  label: "UK West" },
  francecentral:      { x: 136, y: 50,  label: "France" },
  germanywestcentral: { x: 140, y: 42,  label: "Germany" },
  southeastasia:      { x: 216, y: 78,  label: "SE Asia" },
  eastasia:           { x: 222, y: 56,  label: "East Asia" },
  japaneast:          { x: 242, y: 52,  label: "Japan East" },
  japanwest:          { x: 238, y: 58,  label: "Japan West" },
  australiaeast:      { x: 236, y: 108, label: "Australia" },
  brazilsouth:        { x: 92,  y: 104, label: "Brazil South" },
  canadacentral:      { x: 56,  y: 36,  label: "Canada Central" },
  canadaeast:         { x: 72,  y: 32,  label: "Canada East" },
  centralindia:       { x: 194, y: 68,  label: "Central India" },
  southindia:         { x: 196, y: 78,  label: "South India" },
  koreacentral:       { x: 230, y: 50,  label: "Korea" },
  uaenorth:           { x: 172, y: 66,  label: "UAE North" },
  southafricanorth:   { x: 152, y: 104, label: "South Africa" },
  norwayeast:         { x: 130, y: 28,  label: "Norway East" },
  switzerlandnorth:   { x: 138, y: 44,  label: "Switzerland" },
};

const clickable: React.CSSProperties = { cursor: "pointer" };

export const GatewayMap: React.FC<Props> = ({ gateways, trafficManagerProfiles = [], afdProfiles = [] }) => {
  const navigate = useNavigate();
  const regionGroups = new Map<string, GatewayListItem[]>();
  for (const gw of gateways) {
    const loc = gw.location.toLowerCase().replace(/\s/g, "");
    const existing = regionGroups.get(loc) || [];
    existing.push(gw);
    regionGroups.set(loc, existing);
  }

  if (gateways.length === 0 && trafficManagerProfiles.length === 0 && afdProfiles.length === 0) {
    return null;
  }

  // Analytics
  const totalGateways = gateways.length;
  const runningCount = gateways.filter(g => g.operationalState === "Running").length;
  const stoppedCount = gateways.filter(g => g.operationalState === "Stopped").length;
  const activeRegions = regionGroups.size;
  const tmCount = trafficManagerProfiles.length;
  const afdCount = afdProfiles.length;
  const tmEndpointCount = trafficManagerProfiles.reduce((sum, tm) => sum + tm.endpoints.length, 0);

  // Build TM → gateway lookup for connection lines
  const tmConnections: { tmX: number; tmY: number; gwX: number; gwY: number; color: string; tmName: string; gwName: string }[] = [];
  trafficManagerProfiles.forEach((tm, idx) => {
    const tmX = 18 + idx * 30;
    const tmY = 10;
    const isActive = tm.profileStatus === "Enabled" && tm.monitorConfig.profileMonitorStatus !== "Inactive";
    const tmColor = isActive ? "#5c2d91" : "#a19f9d";
    tm.endpoints
      .filter(ep => ep.endpointStatus === "Enabled")
      .forEach(ep => {
        // Try matching by gateway name in target/targetResourceId first
        let matchedGw = gateways.find(gw =>
          ep.target?.toLowerCase().includes(gw.name.toLowerCase()) ||
          ep.targetResourceId?.toLowerCase().includes(gw.name.toLowerCase())
        );
        // Fallback: match by endpoint location to gateway region
        if (!matchedGw && ep.endpointLocation) {
          const epLoc = ep.endpointLocation.toLowerCase().replace(/\s/g, "");
          matchedGw = gateways.find(gw => gw.location.toLowerCase().replace(/\s/g, "") === epLoc);
        }
        if (matchedGw) {
          const loc = matchedGw.location.toLowerCase().replace(/\s/g, "");
          const coords = regionCoords[loc];
          if (coords) {
            tmConnections.push({ tmX, tmY, gwX: coords.x, gwY: coords.y, color: tmColor, tmName: tm.name, gwName: matchedGw.name });
          }
        } else if (ep.endpointLocation) {
          // Even if no gateway match, draw line to the region if it exists
          const epLoc = ep.endpointLocation.toLowerCase().replace(/\s/g, "");
          const coords = regionCoords[epLoc];
          if (coords) {
            tmConnections.push({ tmX, tmY, gwX: coords.x, gwY: coords.y, color: tmColor, tmName: tm.name, gwName: ep.name });
          }
        }
      });
  });

  const statBoxStyle: React.CSSProperties = {
    background: "#f3f2f1",
    borderRadius: 8,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  };

  return (
    <div className="card" style={{ padding: 16, position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 16 }}>
        {/* Analytics Panel */}
        <div style={{ width: 200, minWidth: 200, display: "flex", flexDirection: "column", gap: 10 }}>
          <Text variant="mediumPlus" style={{ fontWeight: 600, marginBottom: 4, color: "#323130" }}>Fleet Analytics</Text>

          <div style={{ ...statBoxStyle, ...clickable }} onClick={() => navigate("/gateways")}>
            <Text variant="tiny" style={{ color: "#605e5c", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5 }}>Total Gateways</Text>
            <Text variant="xxLarge" style={{ fontWeight: 700, color: "#0078d4", lineHeight: 1.1 }}>{totalGateways}</Text>
            <Text variant="tiny" style={{ color: "#605e5c" }}>across {activeRegions} region{activeRegions !== 1 ? "s" : ""}</Text>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ ...statBoxStyle, flex: 1, alignItems: "center" }}>
              <span className="health-dot healthy" style={{ width: 8, height: 8 }} />
              <Text variant="large" style={{ fontWeight: 700, color: "#107c10" }}>{runningCount}</Text>
              <Text variant="tiny" style={{ color: "#605e5c" }}>Running</Text>
            </div>
            <div style={{ ...statBoxStyle, flex: 1, alignItems: "center" }}>
              <span className="health-dot unhealthy" style={{ width: 8, height: 8 }} />
              <Text variant="large" style={{ fontWeight: 700, color: "#d13438" }}>{stoppedCount}</Text>
              <Text variant="tiny" style={{ color: "#605e5c" }}>Stopped</Text>
            </div>
          </div>

          {tmCount > 0 && (
            <div style={{ ...statBoxStyle, ...clickable }} onClick={() => navigate("/traffic-manager")}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, background: "#5c2d91", display: "inline-block", clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} />
                <Text variant="tiny" style={{ color: "#605e5c", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5 }}>Traffic Manager</Text>
              </div>
              <Text variant="large" style={{ fontWeight: 700, color: "#5c2d91" }}>{tmCount}</Text>
              <Text variant="tiny" style={{ color: "#605e5c" }}>{tmEndpointCount} endpoint{tmEndpointCount !== 1 ? "s" : ""} configured</Text>
            </div>
          )}

          {afdCount > 0 && (
            <div style={{ ...statBoxStyle, ...clickable }} onClick={() => navigate("/afd")}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid #008272", display: "inline-block" }} />
                <Text variant="tiny" style={{ color: "#605e5c", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5 }}>Front Door</Text>
              </div>
              <Text variant="large" style={{ fontWeight: 700, color: "#008272" }}>{afdCount}</Text>
              <Text variant="tiny" style={{ color: "#605e5c" }}>
                {afdProfiles.reduce((s, a) => s + a.endpointCount, 0)} endpoint{afdProfiles.reduce((s, a) => s + a.endpointCount, 0) !== 1 ? "s" : ""}
              </Text>
            </div>
          )}

          {/* Connection list */}
          {tmConnections.length > 0 && (
            <div style={statBoxStyle}>
              <Text variant="tiny" style={{ color: "#605e5c", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>TM → AppGW Routes</Text>
              {tmConnections.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#323130" }}>
                  <span style={{ width: 6, height: 6, background: c.color, display: "inline-block", clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} />
                  <span style={{ fontWeight: 600 }}>{c.tmName}</span>
                  <span style={{ color: "#a19f9d" }}>→</span>
                  <span>{c.gwName}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Map */}
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <svg viewBox="0 0 280 130" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "auto", display: "block", background: "linear-gradient(180deg, #f0f6fa 0%, #e4eef5 100%)", borderRadius: 8 }} shapeRendering="geometricPrecision">
            {/* Grid */}
            {[25, 45, 65, 85, 105].map(y => (
              <line key={`h${y}`} x1="4" y1={y} x2="276" y2={y} stroke="#c8dce8" strokeWidth="0.3" opacity="0.3" />
            ))}
            {[30, 60, 90, 120, 150, 180, 210, 240].map(x => (
              <line key={`v${x}`} x1={x} y1="14" x2={x} y2="122" stroke="#c8dce8" strokeWidth="0.3" opacity="0.3" />
            ))}

            {/* North America */}
            <path d="M12,36 Q20,28 36,26 Q48,24 60,28 Q70,26 78,28 L82,36 Q84,44 82,52 L80,60 Q80,65 82,70 Q80,78 74,80 Q68,84 60,82 Q52,78 42,74 Q34,72 28,66 Q22,60 20,52 Q18,44 14,38 Z" fill="#d8e8dd" stroke="#a8c4b0" strokeWidth="0.4" />
            {/* Greenland */}
            <path d="M82,18 Q90,14 98,18 Q100,24 98,28 Q92,32 86,28 Q82,24 82,18Z" fill="#d8e8dd" stroke="#a8c4b0" strokeWidth="0.3" />
            {/* South America */}
            <path d="M64,86 Q72,82 84,84 Q94,88 100,96 Q100,106 96,114 Q90,122 82,124 Q74,122 68,114 Q62,106 62,96 Z" fill="#d8e8dd" stroke="#a8c4b0" strokeWidth="0.4" />

            {/* Europe */}
            <path d="M114,30 Q122,24 132,24 Q142,24 148,30 Q152,36 148,44 Q146,50 140,52 Q136,54 130,52 Q122,50 118,44 Q114,38 114,30Z" fill="#d8e8dd" stroke="#a8c4b0" strokeWidth="0.4" />
            {/* Scandinavia */}
            <path d="M132,18 Q138,14 142,18 Q144,24 142,30 Q138,32 134,28 Z" fill="#d8e8dd" stroke="#a8c4b0" strokeWidth="0.3" />

            {/* Africa */}
            <path d="M120,56 Q128,54 142,56 Q152,62 160,72 Q164,82 162,94 Q156,106 148,110 Q140,112 132,110 Q124,104 120,94 Q116,84 116,72 Z" fill="#d8e8dd" stroke="#a8c4b0" strokeWidth="0.4" />

            {/* Asia */}
            <path d="M152,22 Q166,16 184,16 Q204,16 222,22 Q236,22 248,28 Q256,36 254,48 Q250,56 246,64 Q238,68 228,72 Q218,74 206,74 Q194,72 184,68 Q174,62 166,54 Q158,46 154,36 Z" fill="#d8e8dd" stroke="#a8c4b0" strokeWidth="0.4" />
            {/* India */}
            <path d="M182,72 Q188,66 196,72 Q200,80 196,90 Q190,94 186,90 Q182,82 182,72Z" fill="#d8e8dd" stroke="#a8c4b0" strokeWidth="0.3" />
            {/* Japan */}
            <path d="M238,44 Q240,38 244,44 Q244,52 242,58 Q238,56 238,50 Z" fill="#d8e8dd" stroke="#a8c4b0" strokeWidth="0.3" />
            {/* SE Asia */}
            <path d="M210,76 Q216,72 222,76 Q224,82 222,88 Q216,86 212,82 Z" fill="#d8e8dd" stroke="#a8c4b0" strokeWidth="0.25" />

            {/* Australia */}
            <path d="M216,96 Q228,90 242,92 Q250,98 254,106 Q252,114 244,118 Q232,118 222,112 Q216,106 216,100 Z" fill="#d8e8dd" stroke="#a8c4b0" strokeWidth="0.4" />

            {/* === Arrow marker for TM lines === */}
            <defs>
              <marker id="tm-arrow" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <path d="M0,0 L6,2 L0,4 Z" fill="#5c2d91" opacity="0.8" />
              </marker>
              <marker id="tm-arrow-inactive" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <path d="M0,0 L6,2 L0,4 Z" fill="#a19f9d" opacity="0.8" />
              </marker>
            </defs>

            {/* === TM → AppGW connection lines (drawn FIRST so they appear behind markers) === */}
            {tmConnections.map((c, i) => (
              <line key={`tm-line-${i}`} x1={c.tmX} y1={c.tmY} x2={c.gwX} y2={c.gwY}
                stroke={c.color} strokeWidth="0.8" strokeDasharray="3,2" opacity="0.75"
                markerEnd={c.color === "#5c2d91" ? "url(#tm-arrow)" : "url(#tm-arrow-inactive)"} />
            ))}

            {/* AFD profiles — shown as globe icon at top right */}
            {afdProfiles.map((afd, idx) => {
              const afdX = 196 + idx * 28;
              const afdY = 10;
              const afdColor = afd.resourceState === "Active" ? "#008272" : "#a19f9d";
              return (
                <g key={afd.id} style={clickable} onClick={() => navigate("/afd")}>
                  <circle cx={afdX} cy={afdY} r="4.5" fill={afdColor} opacity="0.12" />
                  <circle cx={afdX} cy={afdY} r="3" fill="none" stroke={afdColor} strokeWidth="0.6" />
                  <ellipse cx={afdX} cy={afdY} rx="1.2" ry="3" fill="none" stroke={afdColor} strokeWidth="0.5" />
                  <line x1={afdX - 3} y1={afdY} x2={afdX + 3} y2={afdY} stroke={afdColor} strokeWidth="0.4" />
                  <text x={afdX + 6} y={afdY + 1} fontSize="3.2" fill="#323130" fontWeight="600">{afd.name}</text>
                  <text x={afdX + 6} y={afdY + 4.8} fontSize="2.6" fill="#605e5c">
                    {afd.sku.includes("Premium") ? "Premium" : "Standard"} • {afd.endpointCount} ep
                  </text>
                </g>
              );
            })}

            {/* Traffic Manager — top area */}
            {trafficManagerProfiles.map((tm, idx) => {
              const tmX = 18 + idx * 30;
              const tmY = 10;
              const isActive = tm.profileStatus === "Enabled" && tm.monitorConfig.profileMonitorStatus !== "Inactive";
              const tmColor = isActive ? "#5c2d91" : "#a19f9d";

              return (
                <g key={tm.id} style={clickable} onClick={() => navigate("/traffic-manager")}>
                  <polygon
                    points={`${tmX},${tmY - 4} ${tmX + 3.5},${tmY} ${tmX},${tmY + 4} ${tmX - 3.5},${tmY}`}
                    fill={tmColor} stroke="white" strokeWidth="0.6"
                  />
                  <text x={tmX + 5.5} y={tmY + 1} fontSize="3.2" fill="#323130" fontWeight="600">{tm.name}</text>
                  <text x={tmX + 5.5} y={tmY + 4.8} fontSize="2.6" fill="#605e5c">
                    {tm.trafficRoutingMethod} • {tm.endpoints.length} ep
                  </text>
                </g>
              );
            })}

            {/* Gateway markers */}
            {Array.from(regionGroups.entries()).map(([loc, gws]) => {
              const coords = regionCoords[loc];
              if (!coords) return null;
              const allRunning = gws.every((g) => g.operationalState === "Running");
              const anyDown = gws.some((g) => g.operationalState === "Stopped");
              const color = anyDown ? "#d13438" : allRunning ? "#107c10" : "#c19c00";

              const firstGw = gws[0];
              const gwPath = gws.length === 1
                ? `/gateways/${firstGw.subscriptionId}/${firstGw.resourceGroup}/${firstGw.name}`
                : "/gateways";

              return (
                <g key={loc} style={clickable} onClick={() => navigate(gwPath)}>
                  <circle cx={coords.x} cy={coords.y} r="4" fill={color} opacity="0.15">
                    <animate attributeName="r" values="4;7;4" dur="2.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.15;0.04;0.15" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={coords.x} cy={coords.y} r="2.8" fill={color} stroke="white" strokeWidth="0.6" />
                  {gws.length > 1 && (
                    <>
                      <circle cx={coords.x + 4} cy={coords.y - 4} r="2.6" fill="#0078d4" />
                      <text x={coords.x + 4} y={coords.y - 2.4} textAnchor="middle" fontSize="2.8" fill="white" fontWeight="bold">{gws.length}</text>
                    </>
                  )}
                  <text x={coords.x} y={coords.y + 6.5} textAnchor="middle" fontSize="3" fill="#323130" fontWeight="600">
                    {coords.label}
                  </text>
                  <text x={coords.x} y={coords.y + 9.5} textAnchor="middle" fontSize="2.4" fill="#605e5c">
                    {gws.length === 1 ? gws[0].name : `${gws.length} gateways`}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <Stack horizontal tokens={{ childrenGap: 20 }} horizontalAlign="center" styles={{ root: { marginTop: 8 } }}>
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 4 }}>
              <span className="health-dot healthy" />
              <Text variant="small">Running</Text>
            </Stack>
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 4 }}>
              <span className="health-dot unhealthy" />
              <Text variant="small">Stopped</Text>
            </Stack>
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 4 }}>
              <span className="health-dot" style={{ background: "#c19c00" }} />
              <Text variant="small">Mixed</Text>
            </Stack>
            {tmCount > 0 && (
              <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 4 }}>
                <span style={{ width: 10, height: 10, background: "#5c2d91", display: "inline-block", clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} />
                <Text variant="small">Traffic Manager</Text>
              </Stack>
            )}
            {afdCount > 0 && (
              <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid #008272", display: "inline-block" }} />
                <Text variant="small">Front Door</Text>
              </Stack>
            )}
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 4 }}>
              <span style={{ width: 16, height: 0, borderTop: "2px dashed #5c2d91", display: "inline-block" }} />
              <Text variant="small">TM → AppGW</Text>
            </Stack>
          </Stack>
        </div>
      </div>
    </div>
  );
};
