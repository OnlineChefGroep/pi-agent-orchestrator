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
  frames: TerminalFrame[];
}

export interface PiTerminalShowcaseProps {
  poster?: boolean;
}

const fallback: ShowcaseData = {
  version: 1,
  cols: 110,
  rows: 32,
  durationSeconds: 36.669,
  generatedAt: "fallback",
  source: "scripts/showcase-live-demo.mjs --auto",
  frames: [
    {
      t: 0,
      screen:
        "\u001b[38;5;81m╭─ PI AGENT ORCHESTRATOR ─────────────────────────────────────────────────────────────╮\u001b[0m\n" +
        "│  RUNNING 3   QUEUED 1   DONE 1   ERROR 1                                         │\n" +
        "├────────────────────────────────────────────────────────────────────────────────────┤\n" +
        "│  ● Explore          Trace RPC + swarm health handlers                    running │\n" +
        "│  ● Explore          Scan test/ coverage gaps                             running │\n" +
        "│  ● Plan             Verify v0.17.6 release artifact                      running │\n" +
        "│  ○ general-purpose  Virtual scroll + heatmap polish                      queued  │\n" +
        "│  ✓ Analysis         Benchmark fastTruncate                               done    │\n" +
        "│  × Plan             Schedule bounds audit                                error   │\n" +
        "╰────────────────────────────────────────────────────────────────────────────────────╯",
    },
  ],
};

// Cue windows follow scripts/showcase-live-demo.mjs --auto (~37s expanded tour).
const cues = [
  {from: 0.0, to: 3.5, key: "intro", label: "deterministic tour"},
  {from: 3.5, to: 8.5, key: "j / k", label: "navigate agents"},
  {from: 8.5, to: 11.5, key: "?", label: "open help"},
  {from: 11.5, to: 18.5, key: "t", label: "resource top view"},
  {from: 18.5, to: 22.5, key: "widget", label: "live editor telemetry"},
  {from: 22.5, to: 26.0, key: "w", label: "swarm topology"},
  {from: 26.0, to: 29.0, key: "perf", label: "render metrics"},
  {from: 29.0, to: 32.0, key: "sched", label: "persistent schedules"},
  {from: 32.0, to: 35.0, key: "cfg", label: "runtime settings"},
  {from: 35.0, to: 36.7, key: "handoff", label: "structured completion"},
];

const useShowcaseData = () => {
  const [data, setData] = useState<ShowcaseData>(fallback);
  const {delayRender, continueRender, cancelRender} = useDelayRender();
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
  }, [cancelRender, continueRender, handle]);

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
  const seconds = poster ? 7 : frame / fps;
  const terminalFrame = selectFrame(data.frames, seconds);
  const cue = cues.find((candidate) => seconds >= candidate.from && seconds < candidate.to);

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
    : interpolate(frame, [0, 24], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      });
  const exit = poster
    ? 1
    : interpolate(frame, [durationInFrames - 24, durationInFrames - 1], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
  const terminalY = interpolate(intro, [0, 1], [34, 0]);
  const progress = poster ? 0.48 : Math.min(1, frame / Math.max(1, durationInFrames - 1));
  const cueOpacity = cue
    ? poster
      ? 1
      : interpolate(
          seconds,
          [cue.from, cue.from + 0.18, cue.to - 0.18, cue.to],
          [0, 1, 1, 0],
          {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
        )
    : 0;

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 15%, rgba(83,91,107,0.28), transparent 40%), linear-gradient(145deg, #08090b 0%, #111318 52%, #090a0d 100%)",
        color: "#f4f4f5",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        opacity: intro * exit,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.13,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 144,
          right: 144,
          top: 70,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 22,
              letterSpacing: 4.6,
              textTransform: "uppercase",
              color: "#a8adb7",
              fontWeight: 650,
              marginBottom: 14,
            }}
          >
            OnlineChefGroep / Pi extension
          </div>
          <div style={{fontSize: 62, fontWeight: 720, letterSpacing: -2.5, lineHeight: 1}}>
            Pi Agent Orchestrator
          </div>
        </div>
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(13,15,19,0.76)",
            borderRadius: 999,
            padding: "12px 18px",
            fontSize: 18,
            letterSpacing: 1.1,
            color: "#c8cbd2",
          }}
        >
          ACTUAL TUI RENDERERS · {data.cols}×{data.rows}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 144,
          right: 144,
          top: 190,
          height: 760,
          transform: `translateY(${terminalY}px)`,
          border: "1px solid rgba(255,255,255,0.16)",
          borderRadius: 22,
          background: "rgba(8,10,13,0.97)",
          boxShadow:
            "0 42px 110px rgba(0,0,0,0.62), 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 60,
            borderBottom: "1px solid rgba(255,255,255,0.09)",
            display: "flex",
            alignItems: "center",
            padding: "0 24px",
            background: "linear-gradient(180deg, #17191f 0%, #101216 100%)",
          }}
        >
          <div style={{display: "flex", gap: 11}}>
            {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
              <div
                key={color}
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: "50%",
                  background: color,
                  boxShadow: `0 0 0 1px ${color}55`,
                }}
              />
            ))}
          </div>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              textAlign: "center",
              fontSize: 18,
              fontWeight: 600,
              color: "#aeb2bc",
              letterSpacing: 0.2,
            }}
          >
            pi — /agents
          </div>
          <div
            style={{
              marginLeft: "auto",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 14,
              color: "#747985",
            }}
          >
            xterm-256color
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            inset: "60px 0 0 0",
            padding: "24px 28px",
            background:
              "radial-gradient(circle at 25% 0%, rgba(59,80,99,0.10), transparent 36%), #080a0d",
          }}
        >
          <pre
            style={{
              margin: 0,
              color: "#d5d8df",
              fontFamily:
                "Berkeley Mono, JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
              fontSize: 17.5,
              lineHeight: 1.29,
              letterSpacing: -0.22,
              whiteSpace: "pre",
              fontVariantLigatures: "none",
              textRendering: "geometricPrecision",
              filter: "drop-shadow(0 0 7px rgba(177,205,226,0.05))",
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
            height: 3,
            background: "rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress * 100}%`,
              background: "linear-gradient(90deg, #8ca7b7, #d7e2e8)",
            }}
          />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 144,
          bottom: 54,
          color: "#8e939e",
          fontSize: 17,
          letterSpacing: 0.4,
        }}
      >
        Captured from <span style={{color: "#c9ccd3"}}>scripts/showcase-live-demo.mjs</span> · composed with Remotion
      </div>

      <div
        style={{
          position: "absolute",
          right: 144,
          bottom: 42,
          display: "flex",
          alignItems: "center",
          gap: 14,
          opacity: cueOpacity,
          transform: `translateY(${(1 - cueOpacity) * 12}px)`,
        }}
      >
        <div
          style={{
            padding: "9px 13px",
            borderRadius: 9,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(26,29,35,0.9)",
            boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.5)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontWeight: 700,
            fontSize: 18,
            color: "#f5f5f5",
          }}
        >
          {cue?.key ?? "t"}
        </div>
        <div style={{fontSize: 19, color: "#b8bcc5"}}>{cue?.label ?? "resource top view"}</div>
      </div>
    </AbsoluteFill>
  );
};
