import type { AgentSession, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import type {
  ResumeAgentFn,
  RunAgentFn,
  ValidationDeps,
} from "../src/agent-runner-validator.js";
import { runAdversarialValidation } from "../src/agent-runner-validator.js";
import type { AgentConfig } from "../src/types.js";

// Structurally complete AgentConfig fixture: the return-type annotation makes
// the compiler enforce every required field (no `as`/`as unknown` cast), so the
// test keeps working as a sentinel when AgentConfig evolves.
function makeConfig(
  validators: { agentId: string; criteria: readonly string[] }[],
): AgentConfig {
  return {
    name: "main",
    displayName: "Main Agent",
    description: "does the work",
    systemPrompt: "be helpful",
    promptMode: "append",
    extensions: false,
    skills: false,
    builtinToolNames: ["bash"],
    validators,
  };
}

function passDeps(overrides: Partial<ValidationDeps> = {}): ValidationDeps {
  return {
    pi: {} as ValidationDeps["pi"],
    runAgent: vi.fn<RunAgentFn>(async () => ({ responseText: "" })),
    resumeAgent: vi.fn<ResumeAgentFn>(async () => "fixed output"),
    ...overrides,
  };
}

// These are passed straight through to the injected runAgent/resumeAgent fakes
// and never dereferenced, so an empty object typed against the real platform
// shapes is honest (no `as any`; see AGENTS.md rule #8).
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
    const runAgent = vi.fn<RunAgentFn>();
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
    const runAgent = vi.fn<RunAgentFn>(async () => ({ responseText: passJson() }));
    const resumeAgent = vi.fn<ResumeAgentFn>();
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

  it("self-heals via resumeAgent when a validator fails, then re-validates the fixed text", async () => {
    let call = 0;
    const validatorPrompts: string[] = [];
    const runAgent = vi.fn<RunAgentFn>(async (_ctx, _type, prompt) => {
      call++;
      validatorPrompts.push(prompt);
      return { responseText: call === 1 ? failJson() : passJson() };
    });
    const resumeAgent = vi.fn<ResumeAgentFn>(async () => "self-healed response");
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
    // Validators must run again after the self-heal, not short-circuit.
    expect(runAgent).toHaveBeenCalledTimes(2);
    // The first round validates the original text; the second round validates
    // the resumed output, proving the loop re-checks the fixed response rather
    // than re-checking the original or trusting resumeAgent blindly.
    expect(validatorPrompts[0]).toContain("original");
    expect(validatorPrompts[1]).toContain("self-healed response");
    expect(out.responseText).toBe("self-healed response");
    expect(out.validated).toBe(true);
    expect(onValidationComplete).toHaveBeenCalled();
  });

  it("stops after VALIDATION_MAX_RETRIES and keeps the last text when still failing", async () => {
    const validatorPrompts: string[] = [];
    const runAgent = vi.fn<RunAgentFn>(async (_ctx, _type, prompt) => {
      validatorPrompts.push(prompt);
      return { responseText: failJson() };
    });
    const resumeAgent = vi.fn<ResumeAgentFn>(async () => "attempt output");
    const out = await runAdversarialValidation(
      session,
      ctx,
      "original",
      makeConfig([{ agentId: "v1", criteria: ["is correct"] }]),
      "agent-1",
      passDeps({ runAgent, resumeAgent }),
    );
    // 1 initial round + 2 retries = 3 validation rounds, 2 resume calls (VALIDATION_MAX_RETRIES = 2)
    expect(resumeAgent).toHaveBeenCalledTimes(2);
    expect(runAgent).toHaveBeenCalledTimes(3);
    // Each retry re-validates the resumed text, not the original.
    expect(validatorPrompts[0]).toContain("original");
    expect(validatorPrompts[1]).toContain("attempt output");
    expect(validatorPrompts[2]).toContain("attempt output");
    expect(out.validated).toBe(false);
    expect(out.responseText).toBe("attempt output");
  });

  it("treats a validator error as a failure and keeps retrying", async () => {
    const runAgent = vi.fn<RunAgentFn>(async () => {
      throw new Error("validator crashed");
    });
    const resumeAgent = vi.fn<ResumeAgentFn>(async () => "recovered");
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
    const runAgent = vi.fn<RunAgentFn>(async () => ({ responseText: failJson() }));
    const resumeAgent = vi.fn<ResumeAgentFn>(async () => {
      throw new Error("resume failed");
    });
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
    const runAgent = vi.fn<RunAgentFn>(async () => ({ responseText: passJson() }));
    await runAdversarialValidation(
      session,
      ctx,
      "original",
      makeConfig([{ agentId: "v1", criteria: ["is correct"] }]),
      "agent-1",
      // Only `dispatch` is exercised; cast the partial stub to the real registry
      // type (HookRegistry has many unrelated methods not needed here).
      passDeps({ runAgent, hooks: hooks as unknown as ValidationDeps["hooks"] }),
    );
    const dispatched = hooks.dispatch.mock.calls.map((c) => c[0]);
    expect(dispatched).toContain("validation:start");
    expect(dispatched).toContain("validation:end");
  });

  it("runs all configured validators concurrently (fan-out, not sequential)", async () => {
    const validatorCount = 3;
    let inFlight = 0;
    let maxInFlight = 0;
    let started = 0;
    let openGate!: () => void;
    // Resolves once every validator has entered runAgent.
    const allStarted = new Promise<void>((resolve) => {
      openGate = resolve;
    });

    const runAgent = vi.fn<RunAgentFn>(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (++started === validatorCount) openGate();
      // Block until every validator has started. Concurrent fan-out opens the
      // gate immediately; a sequential loop never would, so bound the wait to
      // keep a regression fast (it fails on maxInFlight, not by hanging).
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        allStarted,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 1000);
        }),
      ]);
      if (timer) clearTimeout(timer);
      inFlight--;
      return { responseText: passJson() };
    });

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

    expect(runAgent).toHaveBeenCalledTimes(validatorCount);
    // All three validators were in flight simultaneously, proof of the
    // Promise.all fan-out rather than a sequential await loop (which would
    // cap maxInFlight at 1).
    expect(maxInFlight).toBe(validatorCount);
  });
});
