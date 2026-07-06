/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // UI modules must not import from core orchestrator internals (only via index/public-api)
    {
      name: "ui-to-core-internal",
      comment: "UI modules should depend on exported types and helpers, not core orchestrator internals",
      severity: "warn",
      from: { path: "^src/ui/" },
      to: { path: ["^src/agent-runner\\.ts$", "^src/swarm-join\\.ts$", "^src/schedule\\.ts$", "^src/handoff\\.ts$"] },
    },
    // Tools must not import from UI rendering layer
    // tui-shim, agent-format, and animation are shared utilities, not rendering code
    {
      name: "tools-to-ui",
      comment: "Tool implementations should not depend on UI rendering code",
      severity: "error",
      from: { path: "^src/tools/" },
      to: { path: ["^src/ui/(?!tui-shim|agent-format|animation)"] },
    },
    // Tests must not import private internals (only exported APIs)
    {
      name: "test-to-internal",
      comment: "Tests should import from public API surface, not private internals",
      severity: "warn",
      from: { path: "^test/" },
      to: { path: ["^src/debug-capture\\.ts$"] },
    },
    // No circular dependencies within src/
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies create maintenance and initialization issues",
      from: {},
      to: { circular: true },
    },
    // No orphan modules (modules nothing imports)
    {
      name: "no-orphans",
      severity: "warn",
      comment: "Orphan modules are dead code candidates",
      from: {
        orphan: true,
        path: "^src/",
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      extensions: [".js", ".ts"],
    },
    exclude: {
      path: "^dist/",
    },
  },
};
