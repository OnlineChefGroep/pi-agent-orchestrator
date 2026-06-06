# Theme Colors Reference

## Premium Theme (Default)

Tokyo Night inspired palette with RGB truecolor support.

### Foreground Colors

| Name | Hex | ANSI | Usage |
|------|-----|------|-------|
| border | `#FF6464` | `\x1b[38;2;255;100;100m` | Panel borders |
| title | `#DCDCDC` | `\x1b[1;38;2;220;220;220m` | Section titles |
| dim | `#646478` | `\x1b[38;2;100;100;120m` | Secondary text |
| muted | `#A0A0AA` | `\x1b[38;2;160;160;170m` | Tertiary text |
| highlight | `#FFC864` | `\x1b[1;38;2;255;200;100m` | Emphasis |
| accent | `#78B4FF` | `\x1b[1;38;2;120;180;255m` | Links, actions |
| success | `#50DC8C` | `\x1b[1;38;2;80;220;140m` | Success states |
| error | `#FF6478` | `\x1b[1;38;2;255;100;120m` | Error states |

### Background Colors

| Name | Hex | Usage |
|------|-----|-------|
| bgCard | `#191928` | Card backgrounds |
| bgSelected | `#232337` | Selected row |
| bgHeader | `#141423` | Header bar |

## Retro Theme

Classic ANSI 16-color palette for compatibility.

| Name | ANSI Code | Color |
|------|-----------|-------|
| border | `\x1b[31m` | Red |
| title | `\x1b[1;37m` | White bold |
| dim | `\x1b[2m` | Dim |
| muted | `\x1b[37m` | White |
| highlight | `\x1b[1;33m` | Yellow bold |
| accent | `\x1b[1;36m` | Cyan bold |
| success | `\x1b[1;32m` | Green bold |
| error | `\x1b[1;31m` | Red bold |

## Plain Theme

No colors or formatting. All color functions return text unchanged.

Use when:
- Terminal doesn't support ANSI codes
- Output is being piped or logged
- Accessibility requires no color

## Box Drawing Characters

### Premium

```
╭──────────────────────────────╮
│  Box drawing with Unicode    │
├──────────────────────────────┤
│  Corners: ╭ ╮ ╰ ╯          │
│  Vertical: │                 │
│  Horizontal: ─               │
│  Junctions: ├ ┤             │
╰──────────────────────────────╯
```

### Retro

```
+------------------------------+
|  ASCII box drawing           |
+----------+----------+--------+
|  Corners: + + + +            |
|  Vertical: |                 |
|  Horizontal: -               |
|  Junctions: + +               |
+------------------------------+
```

### Plain

```
                                
   No box drawing              
                                
   Just spaces and text        
                                
```

## Terminal Compatibility

| Terminal | Premium | Retro | Plain |
|----------|---------|-------|-------|
| iTerm2 | Yes | Yes | Yes |
| Windows Terminal | Yes | Yes | Yes |
| VS Code integrated | Yes | Yes | Yes |
| xterm | Yes* | Yes | Yes |
| PuTTY | Yes* | Yes | Yes |
| Basic cmd.exe | No | Yes | Yes |
| Docker/CI logs | No | Yes | Yes |

*May need `COLORTERM=truecolor` or `TERM=xterm-256color`

## Custom Theme

To create a custom theme, modify `getThemeColors()` in `src/ui/theme.ts`:

```typescript
export function getThemeColors() {
  const style = getUiStyle();
  if (style === "my-theme") {
    return {
      border: "\x1b[38;2;255;0;255m",    // Magenta
      title: "\x1b[1;38;2;255;255;255m", // White bold
      dim: "\x1b[38;2;128;128;128m",      // Gray
      muted: "\x1b[38;2;192;192;192m",    // Light gray
      highlight: "\x1b[1;38;2;255;255;0m", // Yellow
      accent: "\x1b[1;38;2;0;255;255m",   // Cyan
      success: "\x1b[1;38;2;0;255;0m",    // Green
      error: "\x1b[1;38;2;255;0;0m",      // Red
      reset: "\x1b[0m",
      bgCard: "\x1b[48;2;30;30;30m",
      bgSelected: "\x1b[48;2;40;40;40m",
      bgHeader: "\x1b[48;2;20;20;20m",
    };
  }
  // ... existing themes
}
```

Add to `uiStyle` options in `src/settings.ts`.
