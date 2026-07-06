import { logger } from "../logger.js";

/**
 * Ultimate CLI Spinner & Animation Engine
 * Een minimalistisch, elegant en professioneel animatie-framework voor terminal-applicaties.
 */

export const ANIMATION_INTERVAL = 80;

// De standaard gedeelde globale spinner array (behoudt achterwaartse compatibiliteit)
export const SPINNER: string[] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Catalogus van minimalistische en originele spinnerframes zonder emoticons.
 * Gericht op strakke ontwerpen die perfect renderen in elke developer-terminal.
 */
export const SPINNER_FRAMES = {
  // --- KLASSIEK & BRAILLE ---
  braille: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  dots: ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"],
  dotsDouble: ["⢄", "⢂", "⢁", "⡁", "⡈", "⡐", "⢐", "⢠"],
  lines: ["-", "\\", "|", "/"],
  classic: ["*"],
  pulse: ["◦", "•", "◦", "•"],
  wave: ["░", "▒", "▓", "█", "▓", "▒"],
  pipe: ["┤", "┘", "┴", "└", "├", "┌", "┬", "┐"],

  // --- KOSMISCH & TIJD ---
  moon: ["○", "◑", "●", "◐"],
  clock: ["◴", "◷", "◶", "◵"],
  earth: ["◰", "◳", "◲", "◱"],
  radar: ["▖", "▘", "▝", "▗"],

  // --- RETRO GAMING & ARCADE ---
  pacman: ["c  ", "C  ", "•c ", "• C", "••c", "••C"],
  spaceInvaders: ["=o=", "-o-", "\\o/", "|o|"],
  pong: ["|·      |", "|  ·    |", "|    ·  |", "|      ·|", "|    ·  |", "|  ·    |"],
  tetris: ["▧", "▨", "▩", "▤"],

  // --- SUBTIELE ANIMAL & HUMAN ACTIONS ---
  heartbeat: ["♥", "♡"],
  pulseWave: ["·", "•", "●", "•", "·"],
  loadingBar: ["[    ]", "[=   ]", "[==  ]", "[=== ]", "[====]", "[ ===]", "[  ==]", "[   =]"],
  shrug: ["(•_•)", "( •_•)", "(⌐■_■)"],

  // --- CYBERPUNK & GEEKY ---
  glitch: ["▚", "▞", "█", "░", "▌", "▐"],
  binary: ["01", "10", "11", "00"],
  matrix: ["⡀", "⡄", "⡆", "⡇", "⣇", "⣧", "⣷", "⣿"],

  // --- NATUUR & ELEMENTEN (Gezuiverd van emoticons, nu super strak) ---
  fire: ["⡀", "⡄", "⡆", "⡇", "⢇", "⢎", "⠎", "⠘", "⠉", "⠁"], // Stijgende vonken in braille
  weather: ["⎺⎺", "⎻⎻", "⎼⎼", "⎽⎽", "⎼⎼", "⎻⎻"], // Golvende windvlagen
  seedling: ["_", "⡀", "⡄", "⡆", "⡇", "⣇", "⣧", "⣿"], // Organisch groeiend plantje vanuit de grond

  // --- GEOMETRIE ---
  squareSpin: ["▖", "▘", "▝", "▗"],
  triangleSpin: ["▲", "▶", "▼", "◀"],
  rhombus: ["◇", "◈", "◆", "◈"],
  arrows: ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"],
  bouncingBall: ["⎽", "⎼", "⎻", "⎺", "⎻", "⎼"],

  none: [""],
} as const;

export type SpinnerStyle = keyof typeof SPINNER_FRAMES;

/**
 * Stelt de actieve globale spinnerstijl in (voor achterwaartse compatibiliteit).
 */
export function setSpinnerStyle(style: SpinnerStyle) {
  const frames = SPINNER_FRAMES[style] || SPINNER_FRAMES.braille;
  SPINNER.length = 0;
  SPINNER.push(...(frames as unknown as string[]));
}

/**
 * Haalt een specifiek frame-index op uit de actieve globale spinner.
 */
export function getSpinnerFrame(frame: number): string {
  return SPINNER[frame % SPINNER.length] ?? "";
}

/**
 * Retourneert het juiste spinnerframe op basis van de huidige tijd.
 */
export function getTimeSpinnerFrame(now = Date.now(), interval = ANIMATION_INTERVAL): string {
  return getSpinnerFrame(Math.floor(now / interval));
}

/**
 * ============================================================================
 * GEAVANCEERDE SPINNER ENGINE & UTILITIES
 * ============================================================================
 */

export interface SpinnerOptions {
  style?: SpinnerStyle;
  customFrames?: string[];
  interval?: number;
  prefix?: string | (() => string);
  suffix?: string | (() => string);
  colorizer?: (text: string) => string;
}

/**
 * Een interactieve controller om strakke, custom spinners te draaien in terminal- of browserconsoles.
 */
export class SpinnerEngine {
  private timer: any = null;
  private currentFrameIndex = 0;
  private isTerminated = false;

  public frames: string[];
  public interval: number;
  public prefix: string | (() => string);
  public suffix: string | (() => string);
  public colorizer?: (text: string) => string;

  constructor(options: SpinnerOptions = {}) {
    const selectedStyle = options.style ?? "braille";
    this.frames =
      options.customFrames ?? (SPINNER_FRAMES[selectedStyle] as unknown as string[]) ?? SPINNER_FRAMES.braille;
    this.interval = options.interval ?? ANIMATION_INTERVAL;
    this.prefix = options.prefix ?? "";
    this.suffix = options.suffix ?? "";
    this.colorizer = options.colorizer;
  }

  /**
   * Retourneert het huidige actieve frame.
   */
  public getFrame(): string {
    const rawFrame = this.frames[this.currentFrameIndex % this.frames.length] ?? "";
    return this.colorizer ? this.colorizer(rawFrame) : rawFrame;
  }

  /**
   * Formatteert de volledige spinner-output inclusief optionele prefix/suffix.
   */
  public toString(): string {
    const pfx = typeof this.prefix === "function" ? this.prefix() : this.prefix;
    const sfx = typeof this.suffix === "function" ? this.suffix() : this.suffix;
    return `${pfx}${this.getFrame()}${sfx}`;
  }

  /**
   * Start de spinner. In Node.js verbergt deze de cursor en schrijft direct naar stdout.
   */
  public start(terminalMode = typeof process !== "undefined" && process.stdout?.write !== undefined): this {
    if (this.timer) return this;
    this.isTerminated = false;

    if (terminalMode) {
      process.stdout.write("\x1B[?25l");
    }

    const run = () => {
      this.currentFrameIndex++;
      if (terminalMode && !this.isTerminated) {
        process.stdout.write(`\r${this.toString()}`);
      }
    };

    this.timer = setInterval(run, this.interval);
    return this;
  }

  /**
   * Stopt de actieve animatie en herstelt desgewenst de cursor.
   */
  public stop(
    finalMessage?: string,
    terminalMode = typeof process !== "undefined" && process.stdout?.write !== undefined,
  ): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isTerminated = true;

    if (terminalMode) {
      process.stdout.write("\x1B[?25h");
      if (finalMessage !== undefined) {
        process.stdout.write(`\r${finalMessage}\n`);
      } else {
        process.stdout.write("\n");
      }
    }
  }

  /**
   * Wijzigt opties dynamisch tijdens de uitvoering van taken.
   */
  public update(
    options: Partial<Omit<SpinnerOptions, "style">> & {
      style?: SpinnerStyle;
    },
  ): void {
    if (options.style) {
      this.frames = (SPINNER_FRAMES[options.style] as unknown as string[]) ?? this.frames;
    }
    if (options.customFrames) this.frames = options.customFrames;
    if (options.interval) this.interval = options.interval;
    if (options.prefix !== undefined) this.prefix = options.prefix;
    if (options.suffix !== undefined) this.suffix = options.suffix;
    if (options.colorizer !== undefined) this.colorizer = options.colorizer;
  }
}

/**
 * ============================================================================
 * UTILITIES & DECORATORS
 * ============================================================================
 */

/**
 * Creëert een gespiegelde dubbele spinner (bijv. `[ ⠋ ] Bezig met verwerken [ ⠋ ]`)
 */
export function makeDualSpinner(style: SpinnerStyle, text: string): SpinnerOptions {
  return {
    style,
    prefix: "[ ",
    suffix: ` ] — ${text} — [ `,
    colorizer: (frame) => `${frame} ] [ ${frame}`,
  };
}

/**
 * Geeft een afwisselend frame terug tussen twee stijlen op basis van de systeemtijd.
 */
export function getAlternateFrame(styleA: SpinnerStyle, styleB: SpinnerStyle, durationMs = 2000): string {
  const select = Math.floor(Date.now() / durationMs) % 2 === 0;
  const frames = SPINNER_FRAMES[select ? styleA : styleB] as unknown as string[];
  return frames[Math.floor(Date.now() / ANIMATION_INTERVAL) % frames.length] ?? "";
}

/**
 * Handige demonstratietool om alle minimalistische stijlen direct live te testen in de terminal.
 */
export function runShowcase() {
  logger.info("=== THE ULTIMATE SPINNER SHOWCASE ===");
  const keys = Object.keys(SPINNER_FRAMES) as SpinnerStyle[];
  let currentKeyIndex = 0;

  const engine = new SpinnerEngine({
    style: keys[currentKeyIndex],
    prefix: "  ",
    suffix: () => `  [Thema: ${keys[currentKeyIndex]}]  - Druk op Ctrl+C om te stoppen`,
  });

  engine.start();

  const interval = setInterval(() => {
    currentKeyIndex = (currentKeyIndex + 1) % keys.length;
    engine.update({ style: keys[currentKeyIndex] });
  }, 2500);

  process.on("SIGINT", () => {
    clearInterval(interval);
    engine.stop("Bedankt voor het kijken!", true);
    process.exit();
  });
}
