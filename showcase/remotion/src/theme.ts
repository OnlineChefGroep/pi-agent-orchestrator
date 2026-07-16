/**
 * Shared design tokens for the promo-media compositions.
 *
 * These are copied verbatim from `site/index.html` (`:root { --bg, --panel,
 * ... }`). Do not invent new colors here — if the brand changes, update
 * site/index.html first and mirror the values into this file so every
 * generated asset stays visually identical to the real site and README.
 */

export const theme = {
  bg: "#0b0d10",
  panel: "#12151a",
  panel2: "#171a20",
  text: "#f2f3f5",
  muted: "#a2a8b2",
  line: "rgba(255, 255, 255, 0.12)",
  accent: "#70a9ff",
  ok: "#5fd68a",
  warn: "#e0b34d",
  error: "#e0685f",
} as const;

export const layout = {
  bannerWidth: 1280,
  bannerHeight: 640,
  socialCardWidth: 1200,
  socialCardHeight: 630,
  videoWidth: 1920,
  videoHeight: 1080,
  fps: 30,
} as const;
