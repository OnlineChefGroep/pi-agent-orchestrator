import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_DASHBOARD_KEYBINDINGS,
  matchDashboardKey,
} from "../src/ui/dashboard-keybindings.js";
import {
  decodePrintableKey,
  matchesKey,
  parseKey,
  setKittyProtocolActive,
} from "../src/ui/keys.js";

/**
 * These cases mirror what the Pi host actually delivers to handleInput:
 * raw terminal bytes, not canonical names like "up" / "space".
 */
describe("matchesKey raw terminal sequences", () => {
  afterEach(() => {
    setKittyProtocolActive(false);
  });

  it("matches arrow keys from legacy ANSI and SS3 sequences", () => {
    expect(matchesKey("\x1b[A", "up")).toBe(true);
    expect(matchesKey("\x1bOA", "up")).toBe(true);
    expect(matchesKey("\x1b[B", "down")).toBe(true);
    expect(matchesKey("\x1bOB", "down")).toBe(true);
    expect(matchesKey("\x1b[C", "right")).toBe(true);
    expect(matchesKey("\x1b[D", "left")).toBe(true);
  });

  it("matches space as the literal space byte, not the word space", () => {
    expect(matchesKey(" ", "space")).toBe(true);
    expect(matchesKey("space", "space")).toBe(true); // canonical pass-through
    expect(matchesKey("x", "space")).toBe(false);
  });

  it("matches enter/return as CR/LF and numpad SS3 M", () => {
    expect(matchesKey("\r", "enter")).toBe(true);
    expect(matchesKey("\r", "return")).toBe(true);
    expect(matchesKey("\n", "enter")).toBe(true);
    expect(matchesKey("\x1bOM", "enter")).toBe(true);
  });

  it("matches escape as the raw ESC byte", () => {
    expect(matchesKey("\x1b", "escape")).toBe(true);
    expect(matchesKey("\x1b", "esc")).toBe(true);
  });

  it("matches ctrl+c as the raw control character", () => {
    expect(matchesKey("\u0003", "ctrl+c")).toBe(true);
  });

  it("matches shift+letter via uppercase legacy form", () => {
    expect(matchesKey("K", "shift+k")).toBe(true);
    expect(matchesKey("S", "shift+s")).toBe(true);
  });

  it("matches plain letters and Kitty CSI-u printable sequences", () => {
    expect(matchesKey("s", "s")).toBe(true);
    expect(matchesKey("j", "j")).toBe(true);
    // Kitty CSI-u for 's' (codepoint 115) and 'j' (106)
    expect(matchesKey("\x1b[115u", "s")).toBe(true);
    expect(matchesKey("\x1b[106u", "j")).toBe(true);
    expect(matchesKey("\x1b[107u", "k")).toBe(true);
  });

  it("matches page/home/end legacy sequences", () => {
    expect(matchesKey("\x1b[5~", "pageUp")).toBe(true);
    expect(matchesKey("\x1b[6~", "pageDown")).toBe(true);
    expect(matchesKey("\x1b[H", "home")).toBe(true);
    expect(matchesKey("\x1b[F", "end")).toBe(true);
  });

  it("matches Kitty CSI-u for space and enter", () => {
    expect(matchesKey("\x1b[32u", "space")).toBe(true);
    expect(matchesKey("\x1b[13u", "enter")).toBe(true);
  });
});

describe("dashboard bindings against raw host input", () => {
  const bindings = DEFAULT_DASHBOARD_KEYBINDINGS;

  it("navigates with arrows and vim keys", () => {
    expect(matchDashboardKey("\x1b[A", "moveUp", bindings)).toBe(true);
    expect(matchDashboardKey("k", "moveUp", bindings)).toBe(true);
    expect(matchDashboardKey("\x1b[B", "moveDown", bindings)).toBe(true);
    expect(matchDashboardKey("j", "moveDown", bindings)).toBe(true);
  });

  it("toggles select on literal space", () => {
    expect(matchDashboardKey(" ", "toggleSelect", bindings)).toBe(true);
  });

  it("opens conversation on CR enter", () => {
    expect(matchDashboardKey("\r", "openConversation", bindings)).toBe(true);
  });

  it("steers on s and Kitty CSI-u s", () => {
    expect(matchDashboardKey("s", "steer", bindings)).toBe(true);
    expect(matchDashboardKey("\x1b[115u", "steer", bindings)).toBe(true);
  });

  it("kills on uppercase K", () => {
    expect(matchDashboardKey("K", "kill", bindings)).toBe(true);
  });
});

describe("decodePrintableKey", () => {
  it("decodes Kitty CSI-u printable characters for command mode", () => {
    expect(decodePrintableKey("\x1b[97u")).toBe("a");
    expect(decodePrintableKey("\x1b[115u")).toBe("s");
    expect(decodePrintableKey("\x1b[A")).toBeUndefined();
  });
});

describe("parseKey", () => {
  it("parses common raw sequences to canonical ids", () => {
    expect(parseKey("\x1b[A")).toBe("up");
    expect(parseKey(" ")).toBe("space");
    expect(parseKey("\r")).toBe("enter");
    expect(parseKey("s")).toBe("s");
  });
});
