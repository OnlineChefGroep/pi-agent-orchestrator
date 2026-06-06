#!/bin/bash
set -e

# Test script for Prompt Compression feature using tmux
# Properly navigates the TUI menus to test settings and agent spawning

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

# Function to send a single key
send_key() {
    tmux send-keys -t "$SESSION" "$1"
    sleep 0.2
}

# Initial capture
capture "01_initial"

# Helper: Navigate to Settings and change prompt compression
change_prompt_compression() {
    local level=$1  # minimal, balanced, aggressive
    local level_index=$2  # 0=minimal, 1=balanced, 2=aggressive
    
    echo "Changing prompt compression to: $level"
    
    # Open agents menu
    send_keys "/agents" "Enter"
    sleep 1
    
    # Navigate to Settings (4th option, index 3 - Down 3 times)
    send_key "Down"
    send_key "Down"
    send_key "Down"
    send_key "Enter"
    sleep 1
    
    # Navigate to Prompt compression (11th option, index 10 - Down 10 times)
    for i in {1..10}; do send_key "Down"; done
    send_key "Enter"
    sleep 0.5
    
    # Select the desired level
    # Options are: minimal (0), balanced (1), aggressive (2)
    # Current selection might be at any position, so navigate to top first
    for i in {1..3}; do send_key "Up"; done
    # Then go down to desired level
    for i in $(seq 1 $((level_index + 1))); do send_key "Down"; done
    send_key "Enter"
    sleep 1
    
    # Exit settings menu (Escape)
    send_key "Escape"
    sleep 0.5
}

# Helper: Spawn an agent via TUI menu
spawn_agent_via_menu() {
    local agent_type=$1
    local prompt=$2
    local test_name=$3
    
    echo "Spawning $agent_type agent with prompt: $prompt"
    
    # Open agents menu
    send_keys "/agents" "Enter"
    sleep 1
    
    # Select "Agent types" (1st option)
    send_key "Enter"
    sleep 0.5
    
    # Navigate to the desired agent type
    case $agent_type in
        "explore")
            # Explore is 2nd in list (index 1) - Down once
            send_key "Down"
            ;;
        "plan")
            # Plan is 3rd in list (index 2) - Down twice
            send_key "Down"
            send_key "Down"
            ;;
        "analysis")
            # Analysis is 4th in list (index 3) - Down 3 times
            send_key "Down"
            send_key "Down"
            send_key "Down"
            ;;
        "test-agent")
            # test-agent is 5th in list (index 4) - Down 4 times
            send_key "Down"
            send_key "Down"
            send_key "Down"
            send_key "Down"
            ;;
    esac
    send_key "Enter"
    sleep 0.5
    
    # Enter prompt in the editor
    tmux send-keys -t "$SESSION" "$prompt"
    sleep 0.5
    # Submit with Ctrl+Enter or just Enter depending on editor
    send_key "Enter"
    sleep 0.5
    # Might need another Enter to confirm
    send_key "Enter"
    sleep 1
    
    # Wait for agent to complete (foreground)
    local timeout=60
    local elapsed=0
    while [ $elapsed -lt $timeout ]; do
        tmux capture-pane -t "$SESSION" -p > "$RESULTS_DIR/current.txt"
        # Check for completion indicators
        if grep -q "completed\|Done\|Agent completed" "$RESULTS_DIR/current.txt" 2>/dev/null; then
            break
        fi
        if grep -q "Error\|Aborted\|Failed" "$RESULTS_DIR/current.txt" 2>/dev/null; then
            echo "Agent may have failed"
            break
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
    
    capture "$test_name"
}

# Test 1: Set to aggressive and spawn explore
change_prompt_compression "aggressive" 2
capture "02_after_aggressive_setting"
spawn_agent_via_menu "explore" "explain the codebase in one sentence" "03_aggressive_explore"

# Test 2: Set to balanced and spawn explore
change_prompt_compression "balanced" 1
capture "04_after_balanced_setting"
spawn_agent_via_menu "explore" "explain the codebase in one sentence" "05_balanced_explore"

# Test 3: Set to minimal and spawn explore
change_prompt_compression "minimal" 0
capture "06_after_minimal_setting"
spawn_agent_via_menu "explore" "explain the codebase in one sentence" "07_minimal_explore"

# Test 4: Per-agent override - spawn test-agent (which has minimal override)
# First set global to aggressive to verify override works
change_prompt_compression "aggressive" 2
capture "08_global_aggressive_for_override_test"
spawn_agent_via_menu "test-agent" "test" "09_custom_agent_override"

# Cleanup
cleanup

echo "Test complete. Results saved to $RESULTS_DIR"
ls -la "$RESULTS_DIR"