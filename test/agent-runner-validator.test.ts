import { describe, expect, it, vi } from "vitest";
import type { AgentSession, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  ResumeAgentFn,
  RunAgentFn,
  ValidationDeps,
} from "../src/agent-runner-validator.js";
import { runAdversarialValidation } from "../src/agent-runner-validator.js";
import type { AgentConfig } from "../src/types.js";

function makeConfig(
  validators: { agentId: string; criteria: readonly string[] }[],
): AgentConfig {
  const config = {
    name: "main",
    displayName: "Main Agent",
    description: "does the work",
    systemPrompt: "be helpful",
    promptMode: "replace",
    builtinToolNames: ["bash"],
    extensions: false,
    skills: false,
    validators,
  } satisfies AgentConfig;

  return config;
}

function passDeps(overrides: Partial<ValidationDeps> = {}): ValidationDeps {
  return {
    pi: {} as ValidationDeps["pi"],
    runAgent: (async () => ({ responseText: "" })) as RunAgentFn,
    resumeAgent: (async () => "fixed output") as ResumeAgentFn,
    ...overrides,
  };
}

const session = {} as unknown as AgentSession;
const ctx = {} as unknown as ExtensionContext;

const FENCE = "```";

function passJson(): string {
  return `${FENCE}json\n${JSON.stringify({ overallPassed: true, summary: "good" })}\n${FENCE}`;
}

function failJson(): string {
  return `${FENCE}json\n${JSON.stringify({ overallPassed: false, summary: "nope" })}\n${FENCE}`;
}

describe("runAdversarialValidation", () => {
  it("skips validation when no validators are configured", async () => {
    const runAgent = vi.fn() as unknown as RunAgentFn;
    const out = await runAdversarialValidation(
      session,
      ctx,
      "original",
      makeConfig([]),
      "agent-1",
      passDeps({ runAgent }),
    );
    expect(runAgent).not.toHaveBeenCalled();
    expect(out.responseText).toBe("original");
    expect(out.validated).toBeUndefined();
    expect(out.validationResults).toBeUndefined();
  });

  it("returns the text unchanged and validated=true when all validators pass", async () => {
    const runAgent = (vi.fn(async () => ({ responseText: passJson() })) as unknown) as RunAgentFn;
    const resumeAgent = vi.fn() as unknown as ResumeAgentFn;
    const out = await runAdversarialValidation(
      session,
      ctx,
      "original",
      makeConfig([{ agentId: "v1", criteria: ["is correct"] }]),
      "agent-1",
      passDeps({ runAgent, resumeAgent }),
    );
    expect(out.validated).toBe(true);
    expect(out.responseText).toBe("original");
    expect(resumeAgent).not.toHaveBeenCalled();
    expect(out.validationResults?.every((r) => r.passed)).toBe(true);
  });

  it("self-heals via resumeAgent when a validator fails, then passes", async () => {
    let call = 0;
    const runAgent = (vi.fn(async () => {
      call++;
      return { responseText: call === 1 ? failJson() : passJson() };
    }) as unknown) as RunAgentFn;
    const resumeAgent = vi.fn(async () => "self-healed response") as unknown as ResumeAgentFn;
    const onValidationComplete = vi.fn();
    const out = await runAdversarialValidation(
      session,
      ctx,
      "original",
      makeConfig([{ agentId: "v1", criteria: ["is correct"] }]),
      "agent-1",
      passDeps({ runAgent, resumeAgent, onValidationComplete }),
    );
    expect(resumeAgent).toHaveBeenCalledTimes(1);
    expect(out.responseText).toBe("self-healed response");
    expect(out.validated).toBe(true);
    expect(onValidationComplete).toHaveBeenCalled();
  });

  it("stops after VALIDATION_MAX_RETRIES and keeps the last text when still failing", async () => {
    const runAgent = (vi.fn(async () => ({ responseText: failJson() })) as unknown) as RunAgentFn;
    const resumeAgent = vi.fn(async () => "attempt output") as unknown as ResumeAgentFn;
    const out = await runAdversarialValidation(
      session,
      ctx,
      "original",
      makeConfig([{ agentId: "v1", criteria: ["is correct"] }]),
      "agent-1",
      passDeps({ runAgent, resumeAgent }),
    );
    // 1 initial round + 2 retries = 2 resume calls (VALIDATION_MAX_RETRIES = 2)
    expect(resumeAgent).toHaveBeenCalledTimes(2);
    expect(out.validated).toBe(false);
    expect(out.responseText).toBe("attempt output");
  });

  it("treats a validator error as a failure and keeps retrying", async () => {
    const runAgent = (vi.fn(async () => {
      throw new Error("validator crashed");
    }) as unknown) as RunAgentFn;
    const resumeAgent = vi.fn(async () => "recovered") as unknown as ResumeAgentFn;
    const out = await runAdversarialValidation(
      session,
      ctx,
      "original",
      makeConfig([{ agentId: "v1", criteria: ["is correct"] }]),
      "agent-1",
      passDeps({ runAgent, resumeAgent }),
    );
    expect(out.validated).toBe(false);
    expect(resumeAgent).toHaveBeenCalledTimes(2);
  });

  it("stops the retry loop if resumeAgent throws", async () => {
    const runAgent = (vi.fn(async () => ({ responseText: failJson() })) as unknown) as RunAgentFn;
    const resumeAgent = (vi.fn(async () => {
      throw new Error("resume failed");
    }) as unknown) as ResumeAgentFn;
    const onValidationComplete = vi.fn();
    const out = await runAdversarialValidation(
      session,
      ctx,
      "original",
      makeConfig([{ agentId: "v1", criteria: ["is correct"] }]),
      "agent-1",
      passDeps({ runAgent, resumeAgent, onValidationComplete }),
    );
    expect(resumeAgent).toHaveBeenCalledTimes(1);
    expect(onValidationComplete).toHaveBeenCalled();
    expect(out.validated).toBe(false);
  });

  it("dispatches validation:start and validation:end hooks", async () => {
    const hooks = {
      dispatch: vi.fn(async () => {}),
    };
    const runAgent = (vi.fn(async () => ({ responseText: passJson() })) as unknown) as RunAgentFn;
    await runAdversarialValidation(
      session,
      ctx,
      "original",
      makeConfig([{ agentId: "v1", criteria: ["is correct"] }]),
      "agent-1",
      passDeps({ runAgent, hooks: hooks as unknown as ValidationDeps["hooks"] }),
    );
    const dispatched = hooks.dispatch.mock.calls.map((c) => c[0]);
    expect(dispatched).toContain("validation:start");
    expect(dispatched).toContain("validation:end");
  });

  it("runs all configured validators in parallel", async () => {
    let count = 0;
    const runAgent = (vi.fn(async () => {
      count++;
      return { responseText: passJson() };
    }) as unknown) as RunAgentFn;
    await runAdversarialValidation(
      session,
      ctx,
      "original",
      makeConfig([
        { agentId: "v1", criteria: ["a"] },
        { agentId: "v2", criteria: ["b"] },
        { agentId: "v3", criteria: ["c"] },
      ]),
      "agent-1",
      passDeps({ runAgent }),
    );
    expect(count).toBe(3);
  });
});
