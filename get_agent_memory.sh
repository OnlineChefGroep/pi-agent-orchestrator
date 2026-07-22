#!/bin/bash
if [ -f ".jules/agent-memory.md" ]; then
    cat .jules/agent-memory.md
else
    echo "Memory not found"
fi
