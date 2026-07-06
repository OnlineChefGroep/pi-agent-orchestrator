import { describe, expect, it } from "vitest";
import {
  checkAllUpdates,
  checkForUpdate,
  getTemplateInfo,
  listInstalledTemplates,
  listTemplates,
} from "../src/agent-templates.js";

describe("agent-templates", () => {
  describe("listTemplates", () => {
    it("returns all 6 built-in templates", async () => {
      const templates = await listTemplates();
      expect(templates).toHaveLength(6);

      const names = templates.map((t) => t.name).sort();
      expect(names).toEqual([
        "adversarial-validator",
        "handoff-chain-implementer",
        "handoff-chain-researcher",
        "scheduled-explorer",
        "validator-chain-reviewer",
        "worktree-isolated-editor",
      ]);
    });

    it("each template has required metadata fields", async () => {
      const templates = await listTemplates();
      for (const t of templates) {
        expect(t.name).toBeTruthy();
        expect(t.displayName).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.version).toBe("1.0.0");
        expect(t.category).toBeTruthy();
        expect(Array.isArray(t.tags)).toBe(true);
        expect(t.tags.length).toBeGreaterThan(0);
      }
    });
  });

  describe("getTemplateInfo", () => {
    it("returns a template by name", async () => {
      const info = await getTemplateInfo("adversarial-validator");
      expect(info).toBeDefined();
      expect(info!.name).toBe("adversarial-validator");
      expect(info!.category).toBe("security");
    });

    it("returns undefined for unknown template", async () => {
      const info = await getTemplateInfo("nonexistent");
      expect(info).toBeUndefined();
    });
  });

  describe("listInstalledTemplates", () => {
    it("returns empty when nothing is installed", async () => {
      // Using a non-existent cwd to ensure nothing is installed
      const installed = await listInstalledTemplates("/tmp/nonexistent-project");
      expect(installed).toEqual([]);
    });
  });

  describe("checkForUpdate", () => {
    it("returns null when template is not installed", async () => {
      const result = await checkForUpdate("adversarial-validator", "/tmp/nonexistent-project");
      expect(result).toBeNull();
    });
  });

  describe("checkAllUpdates", () => {
    it("returns empty array when nothing is installed", async () => {
      const updates = await checkAllUpdates("/tmp/nonexistent-project");
      expect(updates).toEqual([]);
    });
  });

  describe("compare versions", () => {
    it("getTemplateInfo returns correct versions", async () => {
      const info = await getTemplateInfo("scheduled-explorer");
      expect(info).toBeDefined();
      expect(info!.version).toBe("1.0.0");
    });

    it("all templates are at version 1.0.0", async () => {
      const templates = await listTemplates();
      for (const t of templates) {
        expect(t.version).toBe("1.0.0");
      }
    });
  });
});
