import type {CSSProperties, ReactNode} from "react";
import {AbsoluteFill} from "remotion";
import {interFamily, jetBrainsMonoFamily} from "./Fonts.js";
import {theme} from "./theme.js";

export const TerminalDots = ({size = 12}: {size?: number}) => (
  <div style={{display: "flex", gap: Math.max(6, size * 0.65)}}>
    {[theme.error, theme.warn, theme.ok].map((color) => (
      <div
        key={color}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 0 1px ${color}55`,
        }}
      />
    ))}
  </div>
);

export const GridBackground = ({children}: {children: ReactNode}) => (
  <AbsoluteFill
    style={{
      background:
        "radial-gradient(circle at 18% 8%, rgba(112,169,255,0.16), transparent 34%), radial-gradient(circle at 88% 88%, rgba(95,214,138,0.08), transparent 30%), #0b0d10",
      color: theme.text,
      fontFamily: interFamily,
      overflow: "hidden",
    }}
  >
    <AbsoluteFill
      style={{
        opacity: 0.18,
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }}
    />
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(180deg, rgba(11,13,16,0) 0%, rgba(11,13,16,0.08) 58%, rgba(11,13,16,0.72) 100%)",
      }}
    />
    {children}
  </AbsoluteFill>
);

export const Eyebrow = ({children}: {children: ReactNode}) => (
  <div
    style={{
      fontFamily: jetBrainsMonoFamily,
      color: theme.accent,
      fontSize: 18,
      fontWeight: 700,
      letterSpacing: 2.8,
      textTransform: "uppercase",
    }}
  >
    {children}
  </div>
);

export const Badge = ({children, tone = "neutral"}: {children: ReactNode; tone?: "neutral" | "accent" | "ok"}) => {
  const color = tone === "accent" ? theme.accent : tone === "ok" ? theme.ok : theme.muted;
  return (
    <div
      style={{
        border: `1px solid ${tone === "neutral" ? theme.line : `${color}66`}`,
        color,
        background: tone === "neutral" ? "rgba(18,21,26,0.82)" : `${color}12`,
        borderRadius: 999,
        padding: "9px 14px",
        fontFamily: jetBrainsMonoFamily,
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: 0.5,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
};

export const Panel = ({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) => (
  <div
    style={{
      border: `1px solid ${theme.line}`,
      borderRadius: 20,
      background: "rgba(18,21,26,0.92)",
      boxShadow: "0 30px 90px rgba(0,0,0,0.42)",
      ...style,
    }}
  >
    {children}
  </div>
);

export const TerminalHeader = ({title, right}: {title: string; right?: ReactNode}) => (
  <div
    style={{
      height: 54,
      padding: "0 20px",
      display: "flex",
      alignItems: "center",
      borderBottom: `1px solid ${theme.line}`,
      background: "linear-gradient(180deg, rgba(23,26,32,0.96), rgba(18,21,26,0.96))",
      position: "relative",
    }}
  >
    <TerminalDots size={11} />
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: theme.muted,
        fontFamily: jetBrainsMonoFamily,
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      {title}
    </div>
    {right ? <div style={{marginLeft: "auto", zIndex: 1}}>{right}</div> : null}
  </div>
);
