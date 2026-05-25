export const ANIMATION_INTERVAL = 80;

export const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const SPINNER_FRAMES = {
  braille: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  dots: ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"],
  lines: ["-", "\\", "|", "/"],
  classic: ["*"],
  pulse: ["○", "●", "○", "●"],
  wave: ["░", "▒", "▓", "█", "▓", "▒"],
  none: [""],
};

export type SpinnerStyle = keyof typeof SPINNER_FRAMES;

export function setSpinnerStyle(style: SpinnerStyle) {
  const frames = SPINNER_FRAMES[style] || SPINNER_FRAMES.braille;
  SPINNER.length = 0;
  SPINNER.push(...frames);
}

export function getSpinnerFrame(frame: number): string {
  return SPINNER[frame % SPINNER.length] ?? "";
}

export function getTimeSpinnerFrame(now = Date.now()): string {
  return getSpinnerFrame(Math.floor(now / ANIMATION_INTERVAL));
}
