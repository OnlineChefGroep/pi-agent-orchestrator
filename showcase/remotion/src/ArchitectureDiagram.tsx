import {useMemo} from "react";
import {usePromoData} from "./promo-data.js";
import {Badge, Eyebrow, GridBackground, Panel, TerminalHeader} from "./PromoShell.js";
import {interFamily, jetBrainsMonoFamily} from "./Fonts.js";
import {theme} from "./theme.js";

export const ArchitectureDiagram = () => {
  const data = usePromoData();
  const metrics = useMemo(() => {
    const lines = data.architectureAscii.split("\n");
    const longest = Math.max(...lines.map((line) => line.length), 1);
    const fontSize = Math.min(16, 1390 / longest, 760 / Math.max(lines.length, 1));
    return {fontSize: Math.max(11.2, fontSize), lines: lines.length};
  }, [data.architectureAscii]);

  return (
    <GridBackground>
      <div style={{position: "absolute", inset: "58px 72px 60px"}}>
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start"}}>
          <div>
            <Eyebrow>Source-derived system map</Eyebrow>
            <div
              style={{
                marginTop: 16,
                fontFamily: interFamily,
                fontWeight: 700,
                fontSize: 48,
                letterSpacing: -2,
              }}
            >
              Architecture overview
            </div>
            <div style={{marginTop: 10, color: theme.muted, fontSize: 18}}>
              Extracted from docs/architecture.md — no hand-edited diagram drift.
            </div>
          </div>
          <div style={{display: "flex", gap: 10}}>
            <Badge tone="accent">v{data.version}</Badge>
            <Badge>{metrics.lines} lines</Badge>
          </div>
        </div>

        <Panel
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 132,
            bottom: 0,
            overflow: "hidden",
          }}
        >
          <TerminalHeader
            title="docs/architecture.md — SYSTEM DIAGRAM"
            right={<span style={{fontFamily: jetBrainsMonoFamily, color: theme.muted}}>read-only</span>}
          />
          <div
            style={{
              position: "absolute",
              inset: "54px 0 0",
              padding: "18px 28px 20px",
              background:
                "radial-gradient(circle at 48% 0%, rgba(112,169,255,0.08), transparent 42%), rgba(8,10,13,0.96)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <pre
              style={{
                margin: 0,
                color: "#d8dce4",
                fontFamily: jetBrainsMonoFamily,
                fontSize: metrics.fontSize,
                lineHeight: 1.08,
                letterSpacing: -0.15,
                whiteSpace: "pre",
                fontVariantLigatures: "none",
                textRendering: "geometricPrecision",
              }}
            >
              {data.architectureAscii}
            </pre>
          </div>
        </Panel>
      </div>
    </GridBackground>
  );
};
