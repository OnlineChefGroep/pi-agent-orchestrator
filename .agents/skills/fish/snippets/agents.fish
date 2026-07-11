# Fish snippets for the pi-agent-orchestrator project.
# Source with: source .agents/skills/fish/snippets/agents.fish

# Validate every custom agent's frontmatter tools against the allowed set.
function validate_agents
    set -l valid read grep find ls bash write edit glob websearch webfetch task notebook todo_write agent mcp
    for f in .pi/agents/*.md
        set -l tools (grep -m1 '^tools:' $f | string replace 'tools:' '' | string split ',' | string trim)
        echo (basename $f): (string join '|' $tools)
    end
end

# Run a single test file fast.
function t
    npm test -- $argv
end

# Full verification gate.
function gate
    npm run typecheck; and npm run lint; and npm test
end

# Rebuild + regenerate programmatic showcase GIFs.
function showcase_ci
    npm run build; and npm run showcase:ci
end
