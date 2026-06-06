# FFmpeg Filters Reference

## Common Filters Used in Showcase Pipeline

### Scale and Pad

```bash
# Scale to 1280x720, preserve aspect ratio, pad with black
-vf "scale=1280:720:flags=lanczos:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x181818"
```

**Parameters:**
- `flags=lanczos` — High-quality resampling
- `force_original_aspect_ratio=decrease` — Never upscale, only downscale
- `pad=1280:720` — Target dimensions
- `(ow-iw)/2` — Center horizontally
- `(oh-ih)/2` — Center vertically
- `color=0x181818` — Padding color (hex RGB, no alpha)

### Speed Change (setpts)

```bash
# Compress time: 133s → 60s (0.45x speed)
-vf "setpts=0.45*PTS"
```

**Formulas:**
- Target duration = original × speed_factor
- Speed factor = target / original
- Example: 60 / 133 ≈ 0.45

### Drawtext (Title Card)

```bash
# Title with fade in/out
-vf "drawtext=fontfile=/path/to/font.ttf:text='Title':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,0.5,3.5)':alpha='if(between(t,0.5,1.2),(t-0.5)/0.7,if(between(t,2.8,3.5),1-(t-2.8)/0.7,1))'"
```

**Parameters:**
- `fontfile` — Path to TTF font file
- `text` — Text to render
- `fontsize` — Size in pixels
- `fontcolor` — Color name or hex
- `x`, `y` — Position (supports expressions)
- `enable` — Time window for display
- `alpha` — Opacity (0-1, supports expressions)

**Position expressions:**
- `(w-text_w)/2` — Center horizontally
- `(h-text_h)/2` — Center vertically
- `x=40` — Fixed left margin
- `y=20` — Fixed top margin

**Alpha fade expressions:**
- `if(between(t,start,end),(t-start)/duration,1)` — Fade in
- `if(between(t,start,end),1-(t-start)/duration,1)` — Fade out

### Combined Filter Chain

```bash
-vf "scale=1280:720:flags=lanczos:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x181818,drawtext=...,drawtext=...,setpts=0.45*PTS"
```

**Order matters:**
1. Scale first (best quality)
2. Pad second (fix dimensions)
3. Drawtext third (overlay on final frame)
4. setpts last (speed change affects all)

## Advanced Filters

### Fade In/Out

```bash
# Fade in first 0.5s, fade out last 0.5s
-vf "fade=t=in:st=0:d=0.5,fade=t=out:st=-0.5:d=0.5"
```

### Overlay Logo

```bash
# Overlay logo.png at bottom-right
-vf "movie=logo.png[logo];[in][logo]overlay=W-w-10:H-h-10"
```

### Gaussian Blur (for sensitive data)

```bash
# Blur bottom 5 rows (for hiding command prompts)
-vf "drawbox=y=iw-5:h=5:w=iw:t=fill:color=black@0.0"
```

## CRF Values for MP4

| CRF | Quality | File Size | Use Case |
|-----|---------|-----------|----------|
| 18 | High | Large | Hero video, final release |
| 20 | Good | Medium | Documentation |
| 23 | Fair | Small | Quick preview |
| 28 | Low | Very small | Low-bandwidth |

**Note:** CRF is inverse — lower = higher quality, larger file.

## Preset Values

| Preset | Speed | Compression | Use Case |
|--------|-------|-------------|----------|
| ultrafast | Fastest | Worst | Testing |
| superfast | Very fast | Poor | Quick preview |
| veryfast | Fast | Fair | CI |
| faster | Medium | Good | Default |
| fast | Medium-Slow | Better | Recommended |
| medium | Slow | Very good | Final output |
| slow | Slower | Best | Recommended |
| slower | Very slow | Excellent | Archival |
| veryslow | Slowest | Near-lossless | Not practical |

## Pixel Format

```bash
-pix_fmt yuv420p
```

**Why yuv420p?**
- Maximum compatibility (web players, mobile devices)
- 4:2:0 chroma subsampling (smaller file)
- Required for QuickTime/Apple devices

## Fast Start

```bash
-movflags +faststart
```

**Purpose:** Moves moov atom to beginning of file
- Enables streaming (play before full download)
- Required for web video
- Slightly slower encoding

## Complete Example

```bash
ffmpeg -y -i input.gif \
  -vf "scale=1280:720:flags=lanczos:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x181818,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='Title':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-40:enable='between(t,0.5,3.5)',setpts=0.45*PTS" \
  -movflags +faststart \
  -pix_fmt yuv420p \
  -preset slow \
  -crf 18 \
  output.mp4
```
