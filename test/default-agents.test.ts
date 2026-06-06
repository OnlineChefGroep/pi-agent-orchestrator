/**
 * default-agents.test.ts — Validate embedded default agent configs and prompt rendering.
 *
 * Guards against template placeholder leaks (e.g. {{TOOL_INSTRUCTIONS}}) and
 * ensures defense-in-depth properties like disallowedTools are present.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_AGENTS } from "../src/default-agents.js";

describe("DEFAULT_AGENTS", () => {
  it("general-purpose agent exists and has minimal safe config", () => {
    const gp = DEFAULT_AGENTS.get("general-purpose");
    expect(gp).toBeDefined();
    expect(gp!.name).toBe("general-purpose");
    expect(gp!.enabled).not.toBe(false);
    expect(gp!.isDefault).toBe(true);
  });

  it("Explore agent is read-only with disallowedTools floor", () => {
    const agent = DEFAULT_AGENTS.get("Explore");
    expect(agent).toBeDefined();
    expect(agent!.disallowedTools).toContain("write");
    expect(agent!.disallowedTools).toContain("edit");
    expect(agent!.builtinToolNames).not.toContain("write");
    expect(agent!.builtinToolNames).not.toContain("edit");
  });

  it("Plan agent is read-only with disallowedTools floor", () => {
    const agent = DEFAULT_AGENTS.get("Plan");
    expect(agent).toBeDefined();
    expect(agent!.disallowedTools).toContain("write");
    expect(agent!.disallowedTools).toContain("edit");
  });

  it("Analysis agent is read-only with disallowedTools floor", () => {
    const agent = DEFAULT_AGENTS.get("Analysis");
    expect(agent).toBeDefined();
    expect(agent!.disallowedTools).toContain("write");
    expect(agent!.disallowedTools).toContain("edit");
    expect(agent!.useContextMode).toBe(true);
  });

  it("rendered systemPrompts contain no unreplaced {{ placeholders", () => {
    for (const [_name, config] of DEFAULT_AGENTS) {
      if (config.systemPrompt) {
        // Any remaining {{ indicates a template bug (missing closing }} or missing replace)
        expect(config.systemPrompt).not.toMatch(/\{\{/);
        // Also guard against the older single-brace leak pattern
        expect(config.systemPrompt).not.toMatch(/\{\{[A-Z_]+\}(?!\})/);
      }
    }
  });

  it("rendered systemPrompts contain no unreplaced }} without opening {{", () => {
    for (const [_name, config] of DEFAULT_AGENTS) {
      if (config.systemPrompt) {
        // Stray closing braces would indicate malformed templates
        const strayClose = config.systemPrompt.match(/\}\}/g);
        // Double closing braces are okay if they are part of a complete {{...}}
        // but we already checked {{ above, so any }} here would be stray
        if (strayClose) {
          const openCount = (config.systemPrompt.match(/\{\{/g) || []).length;
          const closeCount = strayClose.length;
          expect(closeCount).toBe(openCount);
        }
      }
    }
  });

  it("Explore prompt contains expected sections", () => {
    const prompt = DEFAULT_AGENTS.get("Explore")!.systemPrompt;
    expect(prompt).toContain("READ-ONLY");
    expect(prompt).toContain("file search specialist");
    expect(prompt).toContain("search and analyze existing code");
    expect(prompt).toContain("Use Bash ONLY for read-only operations");
  });

  it("Plan prompt contains expected sections", () => {
    const prompt = DEFAULT_AGENTS.get("Plan")!.systemPrompt;
    expect(prompt).toContain("READ-ONLY");
    expect(prompt).toContain("software architect");
    expect(prompt).toContain("Critical Files for Implementation");
  });

  it("Analysis prompt contains expected sections", () => {
    const prompt = DEFAULT_AGENTS.get("Analysis")!.systemPrompt;
    expect(prompt).toContain("READ-ONLY");
    expect(prompt).toContain("data analysis specialist");
    expect(prompt).toContain("ctx_search");
    expect(prompt).toContain("ctx_execute");
  });
});
