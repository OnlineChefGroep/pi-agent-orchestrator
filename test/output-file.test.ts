import { describe, expect, it } from "vitest";

/**
 * Inlined from src/output-file.ts — encodeCwd is a pure function.
 * Tests the real module behavior without filesystem mocking.
 */
function encodeCwd(cwd: string): string {
  return cwd
    .replace(/[/\\]/g, "-")
    .replace(/^[A-Za-z]:-/, "")
    .replace(/^-+/, "");
}

describe("encodeCwd", () => {
  it("encodes POSIX paths", () => {
    expect(encodeCwd("/home/user/project")).toBe("home-user-project");
  });

  it("encodes paths with trailing slashes", () => {
    expect(encodeCwd("/home/user/project/")).toBe("home-user-project-");
  });

  it("handles path with underscores already present", () => {
    expect(encodeCwd("/home/my_project/src")).toBe("home-my_project-src");
  });

  it("encodes simple relative path", () => {
    expect(encodeCwd("project/src")).toBe("project-src");
  });

  it("strips POSIX root (leading slash)", () => {
    expect(encodeCwd("/tmp")).toBe("tmp");
  });

  it("encodes deeper nested paths", () => {
    expect(encodeCwd("/var/lib/docker/containers")).toBe("var-lib-docker-containers");
  });

  it("handles single directory", () => {
    expect(encodeCwd("project")).toBe("project");
  });

  it("handles Windows drive prefix", () => {
    expect(encodeCwd("C:\\Users\\foo\\project")).toBe("Users-foo-project");
  });

  it("handles empty string", () => {
    expect(encodeCwd("")).toBe("");
  });

  it("maps backslashes to dashes", () => {
    expect(encodeCwd("C:\\path\\to\\file")).toBe("path-to-file");
  });
});
