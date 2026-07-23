import Convert from "ansi-to-html";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import {useEffect, useState} from "react";
import {
  getShowcasePlaybackRange,
  loadShowcaseData,
  type ShowcaseData,
  type TerminalFrame,
  type TerminalShowcaseProps,
} from "./showcase-data.js";

const converter = new Convert({
  fg: "#d5d8df",
  bg: "transparent",
  newline: true,
  escapeXML: true,
  stream: false,
});

const useShowcaseData = (dataFile: string) => {
  const [data, setData] = useState<ShowcaseData | null>(null);
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  const [handle] = useState(() => delayRender("Loading terminal capture"));

  useEffect(() => {
    let active = true;
    loadShowcaseData(dataFile)
      .then((value) => {
        if (active) {
          setData(value);
        }
        continueRender(handle);
      })
      .catch((error: unknown) => {
        if (active) {
          cancelRender(error instanceof Error ? error : new Error(String(error)));
        }
      });

    return () => {
      active = false;
    };
  }, [cancelRender, continueRender, dataFile, handle]);

  return data;
};

const selectFrame = (frames: TerminalFrame[], seconds: number) => {
  let selected = frames[0];
  for (const candidate of frames) {
    if (candidate.t > seconds) break;
    selected = candidate;
  }
  return selected;
};

export const PiTerminalShowcase = ({
  dataFile = "showcase.json",
  fromScene,
  toScene,
  poster = false,
}: TerminalShowcaseProps) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const data = useShowcaseData(dataFile);
  if (!data) return null;

  const range = getShowcasePlaybackRange(data, {fromScene, toScene});
  const seconds = poster
    ? range.startSeconds + (range.endSeconds - range.startSeconds) / 2
    : range.startSeconds + frame / fps;
  const terminalFrame = selectFrame(data.frames, seconds);
  const scene = data.scenes.find(
    (candidate) => seconds >= candidate.startSeconds && seconds < candidate.endSeconds,
  );
  const cueFadeSeconds = scene
    ? Math.min(0.18, (scene.endSeconds - scene.startSeconds) / 3)
    : 0;

  const terminalHtml = converter.toHtml(terminalFrame.screen);

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
  const cueOpacity = scene
    ? poster
      ? 1
      : interpolate(
          seconds,
          [
            scene.startSeconds,
            scene.startSeconds + cueFadeSeconds,
            scene.endSeconds - cueFadeSeconds,
            scene.endSeconds,
          ],
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
        Captured from <span style={{color: "#c9ccd3"}}>{data.source}</span> · v
        {data.packageVersion} · composed with Remotion
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
          {scene?.cue.key ?? ""}
        </div>
        <div style={{fontSize: 19, color: "#b8bcc5"}}>{scene?.cue.label ?? ""}</div>
      </div>
    </AbsoluteFill>
  );
};
