import { describe, expect, it } from "vitest";
import {
  buildLinearDescription,
  githubMarker,
  normalizeGithubEntity,
  selectLinearState,
} from "../scripts/linear-github-sync.mjs";

const repository = "OnlineChefGroep/pi-agent-orchestrator";

describe("linear GitHub sync mapping", () => {
  it("maps a ready pull request to Linear review state", () => {
    const entity = normalizeGithubEntity(
      {
        pull_request: {
          number: 253,
          title: "Add validator coverage",
          html_url: "https://github.com/OnlineChefGroep/pi-agent-orchestrator/pull/253",
          state: "open",
          draft: false,
          merged: false,
          body: "Coverage for validator paths.",
          user: { login: "contributor" },
          labels: [{ name: "area: tests" }],
          head: { ref: "test/validator" },
          updated_at: "2026-07-12T00:00:00Z",
        },
      },
      repository,
    );

    expect(entity.stateKey).toBe("in-review");
    expect(entity.marker).toBe(
      "<!-- github-pr:OnlineChefGroep/pi-agent-orchestrator#253 -->",
    );
    expect(entity.labels).toEqual(["area: tests"]);
  });

  it("maps draft, merged, and closed pull requests to distinct states", () => {
    const base = {
      number: 12,
      title: "Example",
      html_url: "https://example.test/pr/12",
      body: "",
      user: { login: "contributor" },
      labels: [],
      head: { ref: "example" },
      updated_at: "2026-07-12T00:00:00Z",
    };

    expect(
      normalizeGithubEntity(
        { pull_request: { ...base, state: "open", draft: true, merged: false } },
        repository,
      ).stateKey,
    ).toBe("in-progress");
    expect(
      normalizeGithubEntity(
        { pull_request: { ...base, state: "closed", draft: false, merged: true } },
        repository,
      ).stateKey,
    ).toBe("done");
    expect(
      normalizeGithubEntity(
        { pull_request: { ...base, state: "closed", draft: false, merged: false } },
        repository,
      ).stateKey,
    ).toBe("canceled");
  });

  it("maps GitHub issues to backlog, done, or canceled", () => {
    const base = {
      number: 7,
      title: "Contributor task",
      html_url: "https://example.test/issues/7",
      body: "Task body",
      user: { login: "contributor" },
      labels: [{ name: "good first issue" }],
      updated_at: "2026-07-12T00:00:00Z",
    };

    expect(
      normalizeGithubEntity(
        { issue: { ...base, state: "open", state_reason: null } },
        repository,
      ).stateKey,
    ).toBe("backlog");
    expect(
      normalizeGithubEntity(
        { issue: { ...base, state: "closed", state_reason: "completed" } },
        repository,
      ).stateKey,
    ).toBe("done");
    expect(
      normalizeGithubEntity(
        { issue: { ...base, state: "closed", state_reason: "not_planned" } },
        repository,
      ).stateKey,
    ).toBe("canceled");
  });

  it("prefers exact workflow names and falls back to state types", () => {
    const states = [
      { id: "1", name: "Queue", type: "backlog" },
      { id: "2", name: "In Progress", type: "started" },
      { id: "3", name: "Review", type: "started" },
      { id: "4", name: "Completed", type: "completed" },
    ];

    expect(selectLinearState(states, "in-progress").id).toBe("2");
    expect(selectLinearState(states, "in-review").id).toBe("3");
    expect(selectLinearState(states, "backlog").id).toBe("1");
    expect(selectLinearState(states, "done").id).toBe("4");
  });

  it("builds an idempotency marker and preserves source metadata", () => {
    const marker = githubMarker(repository, "issue", 44);
    const description = buildLinearDescription(
      {
        kind: "issue",
        number: 44,
        title: "GitHub issue #44: Example",
        url: "https://example.test/issues/44",
        author: "contributor",
        body: "Useful task details",
        labels: ["good first issue", "help wanted"],
        stateKey: "backlog",
        status: "open",
        branch: null,
        marker,
        updatedAt: "2026-07-12T00:00:00Z",
      },
      repository,
    );

    expect(description).toContain(marker);
    expect(description).toContain("good first issue, help wanted");
    expect(description).toContain("Useful task details");
  });
});
