import { logger } from "../logger.js";

/** Default cadence for terminal animation frames. */
export const ANIMATION_INTERVAL = 80;

/**
 * Spinner catalogue. Dashboard-safe styles use single-cell glyphs so cards and
 * tables never jitter horizontally while frames advance.
 */
export const SPINNER_FRAMES = {
  braille: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  dots: ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"],
  dotsDouble: ["⢄", "⢂", "⢁", "⡁", "⡈", "⡐", "⢐", "⢠"],
  lines: ["-", "\\", "|", "/"],
  classic: ["*"],
  pulse: ["◦", "•", "●", "•"],
  wave: ["░", "▒", "▓", "█", "▓", "▒"],
  pipe: ["┤", "┘", "┴", "└", "├", "┌", "┬", "┐"],
  moon: ["○", "◑", "●", "◐"],
  clock: ["◴", "◷", "◶", "◵"],
  earth: ["◰", "◳", "◲", "◱"],
  radar: ["▖", "▘", "▝", "▗"],
  pacman: ["c  ", "C  ", "•c ", "• C", "••c", "••C"],
  spaceInvaders: ["=o=", "-o-", "\\o/", "|o|"],
  pong: ["|·      |", "|  ·    |", "|    ·  |", "|      ·|", "|    ·  |", "|  ·    |"],
  tetris: ["▧", "▨", "▩", "▤"],
  heartbeat: ["♥", "♡"],
  pulseWave: ["·", "•", "●", "•", "·"],
  loadingBar: ["[    ]", "[=   ]", "[==  ]", "[=== ]", "[====]", "[ ===]", "[  ==]", "[   =]"],
  shrug: ["(•_•)", "( •_•)", "(⌐■_■)"],
  glitch: ["▚", "▞", "█", "░", "▌", "▐"],
  binary: ["01", "10", "11", "00"],
  matrix: ["⡀", "⡄", "⡆", "⡇", "⣇", "⣧", "⣷", "⣿"],
  fire: ["⡀", "⡄", "⡆", "⡇", "⢇", "⢎", "⠎", "⠘", "⠉", "⠁"],
  weather: ["⎺⎺", "⎻⎻", "⎼⎼", "⎽⎽", "⎼⎼", "⎻⎻"],
  seedling: ["_", "⡀", "⡄", "⡆", "⡇", "⣇", "⣧", "⣿"],
  squareSpin: ["▖", "▘", "▝", "▗"],
  triangleSpin: ["▲", "▶", "▼", "◀"],
  rhombus: ["◇", "◈", "◆", "◈"],
  arrows: ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"],
  bouncingBall: ["⎽", "⎼", "⎻", "⎺", "⎻", "⎼"],

  // Original orchestrator-focused motion language.
  orbit: ["◜", "◝", "◞", "◟"],
  aperture: ["◒", "◐", "◓", "◑"],
  signal: ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█", "▇", "▆", "▅", "▄", "▃", "▂"],
  scanline: ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█", "▉", "▊", "▋", "▌", "▍", "▎"],
  pipeline: ["┈", "┉", "┅", "━", "┅", "┉"],
  cascade: ["⣀", "⣄", "⣤", "⣦", "⣶", "⣷", "⣿", "⣾", "⣼", "⣸", "⣠"],
  weave: ["⠏", "⠛", "⠹", "⢸", "⣰", "⣤", "⣆", "⡇"],
  kernel: ["⊙", "⊚", "⊛", "⊚"],
  lattice: ["⌜", "⌝", "⌟", "⌞"],
  prism: ["△", "▷", "▽", "◁"],
  ripple: ["·", "∙", "•", "●", "•", "∙"],
  shuttle: ["▰", "▱", "▱", "▰", "▱", "▱"],
  none: [""],
} as const;

export type SpinnerStyle = keyof typeof SPINNER_FRAMES;
export type SpinnerRole = "agent" | "header" | "queue" | "handoff" | "swarm" | "tool";

/** Styles guaranteed to remain compact enough for dashboard rows and cards. */
export const DASHBOARD_SPINNER_STYLES = [
  "braille",
  "dotsDouble",
  "orbit",
  "aperture",
  "signal",
  "scanline",
  "pipeline",
  "cascade",
  "weave",
  "kernel",
  "lattice",
  "prism",
  "ripple",
] as const satisfies readonly SpinnerStyle[];

const ROLE_STYLES: Record<Exclude<SpinnerRole, "agent">, SpinnerStyle> = {
  header: "orbit",
  queue: "pipeline",
  handoff: "weave",
  swarm: "aperture",
  tool: "signal",
};

/** Mutable global frames retained for backwards compatibility. */
export const SPINNER: string[] = [...SPINNER_FRAMES.braille];

function positiveModulo(value: number, divisor: number): number {
  if (divisor <= 0) return 0;
  return ((value % divisor) + divisor) % divisor;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function copyFrames(style: SpinnerStyle): string[] {
  return [...SPINNER_FRAMES[style]];
}

export function setSpinnerStyle(style: SpinnerStyle): void {
  const selected = Object.hasOwn(SPINNER_FRAMES, style) ? style : "braille";
  SPINNER.splice(0, SPINNER.length, ...copyFrames(selected));
}

export function getSpinnerFrame(frame: number): string {
  if (SPINNER.length === 0) return "";
  return SPINNER[positiveModulo(frame, SPINNER.length)] ?? "";
}

export function getSpinnerFrameForStyle(style: SpinnerStyle, frame: number, phase = 0): string {
  const frames = SPINNER_FRAMES[style];
  return frames[positiveModulo(frame + phase, frames.length)] ?? "";
}

export function getSpinnerStyleForAgent(agentId: string, role: SpinnerRole = "agent"): SpinnerStyle {
  if (role !== "agent") return ROLE_STYLES[role];
  const index = stableHash(agentId) % DASHBOARD_SPINNER_STYLES.length;
  return DASHBOARD_SPINNER_STYLES[index] ?? "braille";
}

/** Stable style per agent plus a stable phase offset to avoid synchronized motion. */
export function getAgentSpinnerFrame(agentId: string, frame: number, role: SpinnerRole = "agent"): string {
  const style = getSpinnerStyleForAgent(agentId, role);
  const phase = stableHash(`${role}:${agentId}`) % SPINNER_FRAMES[style].length;
  return getSpinnerFrameForStyle(style, frame, phase);
}

export function getTimeSpinnerFrame(now = Date.now(), interval = ANIMATION_INTERVAL): string {
  const safeInterval = Math.max(1, interval);
  return getSpinnerFrame(Math.floor(now / safeInterval));
}

export interface SpinnerOptions {
  style?: SpinnerStyle;
  customFrames?: string[];
  interval?: number;
  prefix?: string | (() => string);
  suffix?: string | (() => string);
  colorizer?: (text: string) => string;
}

export class SpinnerEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private currentFrameIndex = 0;
  private isTerminated = false;

  public frames: string[];
  public interval: number;
  public prefix: string | (() => string);
  public suffix: string | (() => string);
  public colorizer?: (text: string) => string;

  constructor(options: SpinnerOptions = {}) {
    const selectedStyle = options.style ?? "braille";
    this.frames = options.customFrames?.length ? [...options.customFrames] : copyFrames(selectedStyle);
    this.interval = Math.max(1, options.interval ?? ANIMATION_INTERVAL);
    this.prefix = options.prefix ?? "";
    this.suffix = options.suffix ?? "";
    this.colorizer = options.colorizer;
  }

  public getFrame(): string {
    const rawFrame = this.frames[positiveModulo(this.currentFrameIndex, this.frames.length)] ?? "";
    return this.colorizer ? this.colorizer(rawFrame) : rawFrame;
  }

  public toString(): string {
    const prefix = typeof this.prefix === "function" ? this.prefix() : this.prefix;
    const suffix = typeof this.suffix === "function" ? this.suffix() : this.suffix;
    return `${prefix}${this.getFrame()}${suffix}`;
  }

  public start(
    terminalMode = typeof process !== "undefined" && process.stdout?.write !== undefined,
  ): this {
    if (this.timer) return this;
    this.isTerminated = false;

    if (terminalMode) process.stdout.write("\x1B[?25l");

    this.timer = setInterval(() => {
      this.currentFrameIndex++;
      if (terminalMode && !this.isTerminated) process.stdout.write(`\r${this.toString()}`);
    }, this.interval);

    return this;
  }

  public stop(
    finalMessage?: string,
    terminalMode = typeof process !== "undefined" && process.stdout?.write !== undefined,
  ): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isTerminated = true;

    if (!terminalMode) return;
    process.stdout.write("\x1B[?25h");
    process.stdout.write(finalMessage === undefined ? "\n" : `\r${finalMessage}\n`);
  }

  public update(options: SpinnerOptions): void {
    if (options.style) this.frames = copyFrames(options.style);
    if (options.customFrames?.length) this.frames = [...options.customFrames];
    if (options.interval !== undefined) this.interval = Math.max(1, options.interval);
    if (options.prefix !== undefined) this.prefix = options.prefix;
    if (options.suffix !== undefined) this.suffix = options.suffix;
    if (options.colorizer !== undefined) this.colorizer = options.colorizer;
    this.currentFrameIndex = positiveModulo(this.currentFrameIndex, this.frames.length);
  }
}

export function makeDualSpinner(style: SpinnerStyle, text: string): SpinnerOptions {
  return {
    style,
    prefix: "[ ",
    suffix: ` ] — ${text} — [ `,
    colorizer: (frame) => `${frame} ] [ ${frame}`,
  };
}

export function getAlternateFrame(
  styleA: SpinnerStyle,
  styleB: SpinnerStyle,
  durationMs = 2000,
): string {
  const now = Date.now();
  const style = Math.floor(now / Math.max(1, durationMs)) % 2 === 0 ? styleA : styleB;
  return getSpinnerFrameForStyle(style, Math.floor(now / ANIMATION_INTERVAL));
}

export function runShowcase(): void {
  logger.info("=== PI ORCHESTRATOR SPINNER SHOWCASE ===");
  const styles = Object.keys(SPINNER_FRAMES) as SpinnerStyle[];
  let styleIndex = 0;
  const engine = new SpinnerEngine({
    style: styles[styleIndex],
    prefix: "  ",
    suffix: () => `  [style: ${styles[styleIndex]}]  Ctrl+C to stop`,
  });

  engine.start();
  const rotation = setInterval(() => {
    styleIndex = (styleIndex + 1) % styles.length;
    engine.update({ style: styles[styleIndex] });
  }, 2500);

  process.once("SIGINT", () => {
    clearInterval(rotation);
    engine.stop("Spinner showcase stopped.", true);
  });
}
