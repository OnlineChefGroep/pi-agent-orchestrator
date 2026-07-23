import { describe, expect, it } from "vitest";
import {
  buildAgentSystemPrompt,
  normalizeWizardName,
  parseAgentSystemBlueprint,
} from "../src/ui/agent-blueprint.js";

function agentContent(description = "Primary test agent"): string {
  return `---
description: ${description}
tools: read, bash, grep
disallowed_tools: write, edit
prompt_mode: replace
---

Perform the requested work and return evidence.
`;
}

describe("normalizeWizardName", () => {
  it("removes terminal control characters including DEL", () => {
    expect(normalizeWizardName("\u007fC\u007fh\u007fe\u007ffSys\u0008tem")).toBe("ChefSystem");
  });

  it("rejects spaces and paths", () => {
    expect(() => normalizeWizardName("bad name")).toThrow(/no spaces or paths/);
    expect(() => normalizeWizardName("../escape")).toThrow(/no spaces or paths/);
  });
});

describe("parseAgentSystemBlueprint", () => {
  it("parses fenced JSON and assigns the requested agent as primary", () => {
    const raw = `\`\`\`json
${JSON.stringify({
  summary: "One read-only specialist",
  warnings: [],
  agents: [{ name: "ChefSystem", content: agentContent(), primary: false }],
  skills: [],
  schedule: null,
})}
\`\`\``;

    const result = parseAgentSystemBlueprint(raw, "ChefSystem");
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].primary).toBe(true);
    expect(result.schedule).toBeUndefined();
  });

  it("parses companion agents, skills, and a schedule", () => {
    const result = parseAgentSystemBlueprint(JSON.stringify({
      summary: "Scheduled validation loop",
      warnings: ["Scheduler is session-scoped"],
      agents: [
        { name: "ChefSystem", primary: true, content: agentContent() },
        { name: "ChefReviewer", primary: false, content: agentContent("Reviewer") },
      ],
      skills: [{
        name: "evidence-check",
        content: `---
name: evidence-check
description: Verify evidence
---

Require file paths and concrete verification.
`,
      }],
      schedule: {
        name: "ChefSystem-hourly",
        description: "Hourly validation",
        schedule: "1h",
        prompt: "Inspect the current project and validate the target.",
        thinking: "high",
        max_turns: 20,
        isolation: "worktree",
      },
    }), "ChefSystem");

    expect(result.agents.map((agent) => agent.name)).toEqual(["ChefSystem", "ChefReviewer"]);
    expect(result.skills[0].name).toBe("evidence-check");
    expect(result.schedule?.schedule).toBe("1h");
    expect(result.schedule?.thinking).toBe("high");
  });

  it("rejects a missing requested primary agent", () => {
    expect(() => parseAgentSystemBlueprint(JSON.stringify({
      agents: [{ name: "Other", primary: true, content: agentContent() }],
      skills: [],
    }), "ChefSystem")).toThrow(/must contain the requested primary agent/);
  });

  it("rejects duplicate or unsafe resource names", () => {
    expect(() => parseAgentSystemBlueprint(JSON.stringify({
      agents: [
        { name: "ChefSystem", primary: true, content: agentContent() },
        { name: "ChefSystem", primary: false, content: agentContent() },
      ],
      skills: [],
    }), "ChefSystem")).toThrow(/Duplicate agent name/);

    expect(() => parseAgentSystemBlueprint(JSON.stringify({
      agents: [{ name: "ChefSystem", primary: true, content: agentContent() }],
      skills: [{ name: "../escape", content: agentContent() }],
    }), "ChefSystem")).toThrow(/no spaces or paths/);
  });

  it("rejects definitions without frontmatter and instruction bodies", () => {
    expect(() => parseAgentSystemBlueprint(JSON.stringify({
      agents: [{ name: "ChefSystem", primary: true, content: "plain text" }],
      skills: [],
    }), "ChefSystem")).toThrow(/must start with YAML frontmatter/);

    expect(() => parseAgentSystemBlueprint(JSON.stringify({
      agents: [{ name: "ChefSystem", primary: true, content: "---\ndescription: empty\n---\n" }],
      skills: [],
    }), "ChefSystem")).toThrow(/instruction body/);
  });
});

describe("buildAgentSystemPrompt", () => {
  it("describes supported agents, skills, loops, and schedule output without granting file writes", () => {
    const prompt = buildAgentSystemPrompt({
      requestedName: "ChefSystem",
      description: "Build a scheduled review and repair loop",
      architecture: "full",
      autonomy: "full",
      skillPolicy: "always",
      scheduleHint: 'Create a cron schedule using exactly "0 9 * * 1-5".',
      targetAgentDir: "/repo/.pi/agents",
      targetSkillDir: "/repo/.pi/skills",
    });

    expect(prompt).toContain("REQUESTED PRIMARY AGENT NAME: ChefSystem");
    expect(prompt).toContain("validators:");
    expect(prompt).toContain("handoff:");
    expect(prompt).toContain("schedule");
    expect(prompt).toContain("/repo/.pi/skills/<name>/SKILL.md");
    expect(prompt).toContain("You must NOT call write/edit or create files yourself.");
    expect(prompt).toContain("Return strict JSON only.");
  });
});
