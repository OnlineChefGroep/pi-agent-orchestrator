#!/bin/bash
# Test script for Prompt Compression feature
# Uses tmux to automate pi interaction

set -e

SESSION="qa-prompt-compression-$(date +%s)"
PI_EXTENSION="/home/jan/OrgChefgroep/pi-agent-orchestrator/src/index.ts"
WORKDIR="/home/jan/OrgChefgroep/pi-agent-orchestrator"

echo "=== Prompt Compression Test ==="
echo "Session: $SESSION"
echo "Working dir: $WORKDIR"

# Clean up any existing sessions with our pattern
tmux list-sessions 2>/dev/null | grep "qa-prompt-compression" | cut -d: -f1 | xargs -r tmux kill-session -t

# Create new tmux session
tmux new-session -d -s "$SESSION" -c "$WORKDIR"

# Function to send keys and wait
send_keys() {
    tmux send-keys -t "$SESSION" "$1"
    sleep "${2:-0.5}"
}

# Function to capture pane output
capture_pane() {
    tmux capture-pane -t "$SESSION" -p
}

# Wait for pi to start
echo "Starting pi with extension..."
send_keys "pi -e $PI_EXTENSION" 3

# Wait for pi to be ready
echo "Waiting for pi to initialize..."
sleep 5

# Capture initial output
output=$(capture_pane)
echo "--- Initial pi output ---"
echo "$output"

# Send /agents command to open agents menu
echo "Opening /agents menu..."
send_keys "/agents" 2

output=$(capture_pane)
echo "--- After /agents ---"
echo "$output"

# Check if we see the agents menu
if echo "$output" | grep -q "Settings"; then
    echo "✓ Agents menu opened"
else
    echo "✗ Failed to open agents menu"
    tmux kill-session -t "$SESSION"
    exit 1
fi

# Navigate to Settings
echo "Selecting Settings..."
send_keys "Settings" 1

output=$(capture_pane)
echo "--- After selecting Settings ---"
echo "$output"

# Check for prompt compression option
if echo "$output" | grep -q "Prompt compression"; then
    echo "✓ Found Prompt compression setting"
else
    echo "✗ Prompt compression setting not found"
fi

# Select Prompt compression
echo "Selecting Prompt compression..."
send_keys "Prompt compression" 1

output=$(capture_pane)
echo "--- After selecting Prompt compression ---"
echo "$output"

# Test 1: Change to "minimal"
echo "=== Test 1: Setting to minimal ==="
send_keys "minimal" 1

output=$(capture_pane)
echo "--- After selecting minimal ---"
echo "$output"

# Verify notification
if echo "$output" | grep -q "Prompt compression set to minimal"; then
    echo "✓ Setting changed to minimal"
else
    echo "⚠ Notification not clearly visible, checking..."
fi

# Go back to main menu and spawn agent
send_keys "q" 0.5
send_keys "/agents" 1

output=$(capture_pane)
echo "--- Back to agents menu ---"
echo "$output"

# Spawn explore agent with minimal setting
echo "Spawning explore agent (minimal compression)..."
send_keys "spawn explore \"explain the codebase\"" 1

output=$(capture_pane)
echo "--- After spawn command ---"
echo "$output"

# Wait for agent to complete (or at least start)
sleep 10

output=$(capture_pane)
echo "--- After agent run (minimal) ---"
echo "$output"

# Save minimal output for comparison
echo "$output" > /tmp/agent-output-minimal.txt

# Test 2: Change to "balanced"
echo "=== Test 2: Setting to balanced ==="
send_keys "/agents" 1
send_keys "Settings" 1
send_keys "Prompt compression" 1
send_keys "balanced" 1

output=$(capture_pane)
echo "--- After selecting balanced ---"
echo "$output"

# Spawn agent with balanced
send_keys "q" 0.5
send_keys "/agents" 1
send_keys "spawn explore \"explain the codebase\"" 1

sleep 10

output=$(capture_pane)
echo "--- After agent run (balanced) ---"
echo "$output"

echo "$output" > /tmp/agent-output-balanced.txt

# Test 3: Change to "aggressive"
echo "=== Test 3: Setting to aggressive ==="
send_keys "/agents" 1
send_keys "Settings" 1
send_keys "Prompt compression" 1
send_keys "aggressive" 1

output=$(capture_pane)
echo "--- After selecting aggressive ---"
echo "$output"

# Spawn agent with aggressive
send_keys "q" 0.5
send_keys "/agents" 1
send_keys "spawn explore \"explain the codebase\"" 1

sleep 10

output=$(capture_pane)
echo "--- After agent run (aggressive) ---"
echo "$output"

echo "$output" > /tmp/agent-output-aggressive.txt

# Test 4: Per-agent override
echo "=== Test 4: Per-agent override ==="

# Create custom agent file
mkdir -p "$WORKDIR/.pi/agents"
cat > "$WORKDIR/.pi/agents/test-agent.md" << 'EOF'
---
name: test-agent
description: Test agent for prompt compression override
prompt_compression: minimal
---
You are a test agent. Explain what you see.
EOF

echo "Created custom agent file with prompt_compression: minimal"

# Reload custom agents and spawn
send_keys "/agents" 1
send_keys "spawn test-agent \"test\"" 1

sleep 10

output=$(capture_pane)
echo "--- After agent run (per-agent override) ---"
echo "$output"

echo "$output" > /tmp/agent-output-override.txt

# Cleanup
echo "Cleaning up..."
tmux kill-session -t "$SESSION"

echo "=== Test Complete ==="
echo "Outputs saved to /tmp/agent-output-*.txt"
ls -la /tmp/agent-output-*.txt
