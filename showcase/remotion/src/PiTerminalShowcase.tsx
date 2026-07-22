import Convert from "ansi-to-html";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import {useEffect, useMemo, useState} from "react";

interface TerminalFrame {
  t: number;
  screen: string;
}

interface ShowcaseData {
  version: number;
  cols: number;
  rows: number;
  durationSeconds: number;
  generatedAt: string;
  source: string;
  packageVersion?: string;
  frames: TerminalFrame[];
}

export interface PiTerminalShowcaseProps extends Record<string, unknown> {
  poster?: boolean;
}

const fallback: ShowcaseData = {
  version: 1,
  cols: 140,
  rows: 36,
  durationSeconds: 36,
  generatedAt: "fallback",
  source: "scripts/showcase-live-demo.mjs --auto",
  packageVersion: "0.17.6",
  frames: [
    {
      t: 0,
      screen:
        "\u001b[38;5;81m╭─ PI AGENT ORCHESTRATOR ──────────────────────────────────────────────────────────────────────────────────────────────────────────╮\u001b[0m\n" +
        "│  RUNNING 3   QUEUED 1   DONE 1   ERROR 1                                                                                       │\n" +
        "├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤\n" +
        "│  ● Explore          Trace RPC + swarm health                                                                         running │\n" +
        "│  ● Explore          Scan test/ coverage gaps                                                                         running │\n" +
        "│  ● Plan             Verify v0.17.6 release                                                                           running │\n" +
        "│  ○ general-purpose  Virtual scroll polish                                                                            queued  │\n" +
        "│  ✓ Analysis         Benchmark fastTruncate                                                                           done    │\n" +
        "│  × Plan             Schedule bounds audit                                                                            error   │\n" +
        "╰────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯",
    },
  ],
};

const useShowcaseData = () => {
  const [data, setData] = useState<ShowcaseData>(fallback);
  const {delayRender, continueRender} = useDelayRender();
  const [handle] = useState(() => delayRender("Loading terminal capture"));

  useEffect(() => {
    let active = true;
    fetch(staticFile("showcase.json"))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`showcase.json returned ${response.status}`);
        }
        return response.json() as Promise<ShowcaseData>;
      })
      .then((value) => {
        if (active && value.frames?.length) {
          setData(value);
        }
        continueRender(handle);
      })
      .catch((error: unknown) => {
        if (active) {
          setData(fallback);
        }
        console.warn("Using fallback terminal capture", error);
        continueRender(handle);
      });

    return () => {
      active = false;
    };
  }, [continueRender, handle]);

  return data;
};

const selectFrame = (frames: TerminalFrame[], seconds: number) => {
  let selected = frames[0] ?? fallback.frames[0];
  for (const candidate of frames) {
    if (candidate.t > seconds) break;
    selected = candidate;
  }
  return selected;
};

export const PiTerminalShowcase = ({poster = false}: PiTerminalShowcaseProps = {}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const data = useShowcaseData();
  const seconds = poster ? 6 : frame / fps;
  const terminalFrame = selectFrame(data.frames, seconds);

  const converter = useMemo(
    () =>
      new Convert({
        fg: "#d5d8df",
        bg: "transparent",
        newline: true,
        escapeXML: true,
        stream: false,
      }),
    [],
  );
  const terminalHtml = useMemo(
    () => converter.toHtml(terminalFrame.screen),
    [converter, terminalFrame.screen],
  );

  const intro = poster
    ? 1
    : interpolate(frame, [0, 18], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      });
  const exit = poster
    ? 1
    : interpolate(frame, [durationInFrames - 18, durationInFrames - 1], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
  const terminalY = interpolate(intro, [0, 1], [18, 0]);
  const progress = poster ? 0.42 : Math.min(1, frame / Math.max(1, durationInFrames - 1));

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 48% 8%, rgba(72,82,98,0.22), transparent 42%), linear-gradient(160deg, #070809 0%, #0e1014 48%, #07080a 100%)",
        color: "#f4f4f5",
        fontFamily:
          "IBM Plex Sans, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        opacity: intro * exit,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.09,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 40,
          right: 40,
          top: 28,
          fontSize: 15,
          letterSpacing: 0.4,
          color: "#9aa0ab",
          fontWeight: 560,
        }}
      >
        Pi Agent Orchestrator
      </div>

      <div
        style={{
          position: "absolute",
          left: 40,
          right: 40,
          top: 56,
          bottom: 40,
          transform: `translateY(${terminalY}px)`,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10,
          background: "rgba(6,8,10,0.98)",
          boxShadow: "0 28px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 34,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 14px",
            background: "linear-gradient(180deg, #14161b 0%, #0d0f12 100%)",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 14,
              display: "flex",
              gap: 6,
            }}
          >
            {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
              <div
                key={color}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: color,
                  opacity: 0.85,
                }}
              />
            ))}
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 560,
              color: "#a8adb8",
              letterSpacing: 0.15,
              fontFamily:
                "Berkeley Mono, JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            }}
          >
            pi — /agents
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            inset: "34px 0 0 0",
            padding: "18px 22px",
            background: "#080a0d",
          }}
        >
          <pre
            style={{
              margin: 0,
              color: "#d5d8df",
              fontFamily:
                "Berkeley Mono, JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
              fontSize: 14.5,
              lineHeight: 1.28,
              letterSpacing: -0.15,
              whiteSpace: "pre",
              fontVariantLigatures: "none",
              textRendering: "geometricPrecision",
            }}
            dangerouslySetInnerHTML={{__html: terminalHtml}}
          />
        </div>

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 2,
            background: "rgba(255,255,255,0.05)",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress * 100}%`,
              background: "linear-gradient(90deg, #7f96a6, #c9d5dc)",
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
