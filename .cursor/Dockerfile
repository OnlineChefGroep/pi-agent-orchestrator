# Cursor Cloud base image for pi-agent-orchestrator.
#
# Debian bookworm + Node pinned to the repository's .nvmrc / package.json
# engines (22.19.0), so a compliant `node` is the default on PATH for every
# shell — including bare interactive shells, not just the cursor-cloud-* scripts.
# Debian-based per Cursor's computer-use requirement. Does not COPY the project;
# Cursor manages the workspace checkout.
FROM node:22.19.0-bookworm

# Tools Cursor Cloud expects: git (repo clone), sudo, curl, CA certs.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        sudo \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Non-root user Cursor Cloud runs as, with passwordless sudo. The official node
# image already uses uid 1000 for its `node` user, so `ubuntu` takes the next id.
RUN id -u ubuntu >/dev/null 2>&1 || useradd -m -s /bin/bash ubuntu \
    && groupadd -f docker && usermod -aG docker ubuntu \
    && usermod -aG sudo ubuntu \
    && echo "ubuntu ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/ubuntu \
    && chmod 0440 /etc/sudoers.d/ubuntu

USER ubuntu
