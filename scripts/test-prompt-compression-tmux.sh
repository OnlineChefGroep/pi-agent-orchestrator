#!/bin/bash
set -e

# Test script for Prompt Compression feature using tmux
# Tests global setting changes and per-agent override

SESSION="pi-prompt-compression-test"
WORKDIR="/home/jan/OrgChefgroep/pi-agent-orchestrator"
RESULTS_DIR="/tmp/pi-prompt-test-$(date +%s)"

mkdir -p "$RESULTS_DIR"

# Cleanup function
cleanup() {
    tmux kill-session -t "$SESSION" 2>/dev/null || true
    pkill -9 -f "pi -e" 2>/dev/null || true
    pkill -9 -f "pi " 2>/dev/null || true
}

# Setup
cleanup
cd "$WORKDIR"

echo "Starting pi in tmux session: $SESSION"
tmux new-session -d -s "$SESSION" -c "$WORKDIR" "pi -e ./src/index.ts"

# Wait for pi to fully start and load
sleep 4

# Function to capture pane
capture() {
    local name=$1
    tmux capture-pane -t "$SESSION" -p > "$RESULTS_DIR/${name}.txt"
    echo "=== $name ===" 
    cat "$RESULTS_DIR/${name}.txt"
    echo ""
}

# Function to send keys with delay
send_keys() {
    tmux send-keys -t "$SESSION" "$@"
    sleep 0.3
}

# Function to wait for agent to complete
wait_for_agent() {
    local timeout=30
    local elapsed=0
    while [ $elapsed -lt $timeout ]; do
        tmux capture-pane -t "$SESSION" -p > "$RESULTS_DIR/current.txt"
        # Check if agent completed (look for completion indicators)
        if grep -q "completed\|done\|finished" "$RESULTS_DIR/current.txt" 2>/dev/null; then
            break
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done
    capture "after_wait"
}

# Initial capture
capture "01_initial"

# Test 1: Change to "aggressive"
echo "Test 1: Setting prompt compression to 'aggressive'"
send_keys "/agents settings" "Enter"
sleep 1
capture "02_settings_opened"

# Navigate to Prompt compression (it's the 11th option, index 10)
# Send Down arrow 10 times then Enter
for i in {1..10}; do send_keys "Down"; done
send_keys "Enter"
sleep 0.5
capture "03_prompt_compression_menu"

# Select "aggressive" (3rd option, index 2)
send_keys "Down" "Down" "Enter"
sleep 1
capture "04_after_aggressive"

# Spawn agent to test aggressive compression
echo "Spawning explore agent with aggressive compression..."
send_keys "/agents spawn explore \"explain the codebase in one sentence\"" "Enter"
sleep 8
capture "05_aggressive_agent_output"

# Test 2: Change to "balanced"
echo "Test 2: Setting prompt compression to 'balanced'"
send_keys "/agents settings" "Enter"
sleep 1
for i in {1..10}; do send_keys "Down"; done
send_keys "Enter"
sleep 0.5
# Select "balanced" (2nd option, index 1)
send_keys "Down" "Enter"
sleep 1
capture "06_after_balanced"

# Spawn agent to test balanced compression
echo "Spawning explore agent with balanced compression..."
send_keys "/agents spawn explore \"explain the codebase in one sentence\"" "Enter"
sleep 8
capture "07_balanced_agent_output"

# Test 3: Change to "minimal"
echo "Test 3: Setting prompt compression to 'minimal'"
send_keys "/agents settings" "Enter"
sleep 1
for i in {1..10}; do send_keys "Down"; done
send_keys "Enter"
sleep 0.5
# Select "minimal" (1st option, index 0) - already selected, just press Enter
send_keys "Enter"
sleep 1
capture "08_after_minimal"

# Spawn agent to test minimal compression
echo "Spawning explore agent with minimal compression..."
send_keys "/agents spawn explore \"explain the codebase in one sentence\"" "Enter"
sleep 8
capture "09_minimal_agent_output"

# Test 4: Per-agent override with test-agent (minimal)
echo "Test 4: Per-agent override with test-agent (minimal)"
send_keys "/agents spawn test-agent \"test\"" "Enter"
sleep 8
capture "10_custom_agent_output"

# Cleanup
cleanup

echo "Test complete. Results saved to $RESULTS_DIR"
ls -la "$RESULTS_DIR"
