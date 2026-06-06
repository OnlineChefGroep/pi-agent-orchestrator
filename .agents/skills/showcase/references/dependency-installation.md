# Dependency Installation Guide

## Core Dependencies (Required for All Pipelines)

### Node.js

**Required:** Node 18+ (project uses ESM modules)

**Installation:**

**macOS:**
```bash
brew install node
```

**Linux (Debian/Ubuntu):**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

**Linux (Arch):**
```bash
sudo pacman -S nodejs npm
```

**Windows:**
```powershell
winget install OpenJS.NodeJS.LTS
```

**Verify:**
```bash
node --version  # Should be v18.x or higher
npm --version
```

### ffmpeg

**Required:** All pipelines use ffmpeg for GIF→MP4 conversion

**Installation:**

**macOS:**
```bash
brew install ffmpeg
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt update
sudo apt install ffmpeg
```

**Linux (Arch):**
```bash
sudo pacman -S ffmpeg
```

**Windows:**
```powershell
winget install Gyan.FFmpeg
```

**Verify:**
```bash
ffmpeg -version
```

**Check for drawtext filter:**
```bash
ffmpeg -filters | grep drawtext
```

If `drawtext` is missing, ffmpeg was compiled without libfreetype. Install full version or use `--no-titles`.

### agg (asciinema GIF generator)

**Required:** Programmatic, Live, Tmux pipelines

**Installation:**

**Via pip (Python):**
```bash
pip install asciinema-agg
```

**Via cargo (Rust):**
```bash
cargo install agg
```

**Verify:**
```bash
agg --version
```

## Pipeline-Specific Dependencies

### Tmux Pipeline

#### tmux

**Installation:**

**macOS:**
```bash
brew install tmux
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt install tmux
```

**Linux (Arch):**
```bash
sudo pacman -S tmux
```

**Windows (WSL):**
```bash
sudo apt install tmux
```

**Verify:**
```bash
tmux -V
```

#### asciinema

**Installation:**

**macOS:**
```bash
brew install asciinema
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt install asciinema
```

**Linux (Arch):**
```bash
sudo pacman -S asciinema
```

**Verify:**
```bash
asciinema --version
```

#### pi CLI

**Required:** Tmux pipeline runs the actual pi CLI

**Installation:**
```bash
# From npm
npm install -g @earendil-works/pi-cli

# Or from source
cd /path/to/pi-cli
npm install -g .
```

**Verify:**
```bash
pi --version
```

### Live Pipeline

#### asciinema

(See Tmux Pipeline above)

### VHS Pipeline

#### VHS (Go tool)

**Installation:**

**macOS:**
```bash
brew install charmbracelet/tap/vhs
```

**Linux:**
```bash
go install github.com/charmbracelet/vhs@latest
```

**Windows:**
```powershell
go install github.com/charmbracelet/vhs@latest
```

**Verify:**
```bash
vhs version
```

### Remotion Pipeline

#### pi-agent-control-extension

**Required:** Remotion post-production

**Installation:**
```bash
git clone https://github.com/OnlineChefGroep/pi-agent-control-extension.git
cd pi-agent-control-extension
npm install
```

**Environment:**
```bash
export DROID_PLUGIN_ROOT=/path/to/pi-agent-control-extension
```

## Optional Dependencies

### DejaVu Fonts (for drawtext)

**Installation:**

**Linux (Debian/Ubuntu):**
```bash
sudo apt install fonts-dejavu-core fonts-dejavu-extra
```

**Linux (Arch):**
```bash
sudo pacman -S ttf-dejavu
```

**macOS:**
```bash
brew install font-dejavu
```

**Verify:**
```bash
fc-list | grep DejaVu
```

### ffprobe (for verification)

**Installation:**
Usually included with ffmpeg.

**Verify:**
```bash
ffprobe -version
```

## CI/CD Setup

### GitHub Actions

```yaml
name: Showcase

on:
  push:
    branches: [main]
  pull_request:

jobs:
  showcase:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install ffmpeg
        run: sudo apt install ffmpeg

      - name: Install agg
        run: pip install asciinema-agg

      - name: Install project dependencies
        run: npm ci

      - name: Build project
        run: npm run build

      - name: Generate showcase (CI-safe)
        run: npm run showcase:ci
        env:
          SHOWCASE_FIDELITY: compact

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: showcase-assets
          path: docs/images/showcase*.gif
```

### GitLab CI

```yaml
showcase:
  image: node:20
  before_script:
    - apt update && apt install -y ffmpeg python3-pip
    - pip install asciinema-agg
    - npm ci
    - npm run build
  script:
    - npm run showcase:ci
  artifacts:
    paths:
      - docs/images/showcase*.gif
```

## Troubleshooting Installation

### Node.js version too old

**Error:** `SyntaxError: Cannot use import statement outside a module`

**Fix:** Upgrade to Node 18+

### ffmpeg not found

**Error:** `ffmpeg: command not found`

**Fix:** Install ffmpeg (see above)

### agg fails to install

**Error:** `pip: command not found`

**Fix:** Install Python and pip first

**macOS:**
```bash
brew install python
```

**Linux:**
```bash
sudo apt install python3-pip
```

### tmux not found (Windows)

**Error:** `tmux: command not found`

**Fix:** Use WSL or Git Bash with tmux

### pi CLI not found

**Error:** `pi: command not found`

**Fix:** Install pi CLI globally or add to PATH

```bash
# If installed via npm
export PATH="$PATH:$(npm config get prefix)/bin"
```

### drawtext filter missing

**Error:** `No such filter: 'drawtext'`

**Fix:** Install full ffmpeg with libfreetype or use `--no-titles`

```bash
# Ubuntu: install full ffmpeg
sudo apt install ffmpeg libavcodec-extra

# Or skip titles
SHOWCASE_NO_TITLES=1 npm run showcase:tmux
```

## Version Compatibility Matrix

| Tool | Minimum Version | Recommended |
|------|----------------|-------------|
| Node.js | 18.0.0 | 20.x LTS |
| ffmpeg | 4.0 | 6.0+ |
| agg | 1.0 | Latest |
| tmux | 3.0 | 3.3+ |
| asciinema | 2.0 | 2.4+ |
| VHS | 0.5 | Latest |
