import { existsSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getModelLabelFromConfig } from "../agent-registry.js";
import { getAgentConfig } from "../agent-types.js";
import type { ModelRegistry } from "../model-resolver.js";
import { resolveModel } from "../model-resolver.js";

export const projectAgentsDir = () => join(process.cwd(), ".pi", "agents");
export const personalAgentsDir = () => join(getAgentDir(), "agents");

/** Find the file path of a custom agent by name (project first, then global). */
export function findAgentFile(name: string): { path: string; location: "project" | "personal" } | undefined {
  const projectPath = join(projectAgentsDir(), `${name}.md`);
  if (existsSync(projectPath)) return { path: projectPath, location: "project" };
  const personalPath = join(personalAgentsDir(), `${name}.md`);
  if (existsSync(personalPath)) return { path: personalPath, location: "personal" };
  return undefined;
}

export function getModelLabel(type: string, registry?: ModelRegistry): string {
  const cfg = getAgentConfig(type);
  if (!cfg?.model) return "inherit";
  // If registry provided, check if the model actually resolves
  if (registry) {
    const resolved = resolveModel(cfg.model, registry);
    if (typeof resolved === "string") return "inherit"; // model not available
  }
  return getModelLabelFromConfig(cfg.model);
}
