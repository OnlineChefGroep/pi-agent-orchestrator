# HOWTO: Performance Debugging met `/perf`

Een korte quick-start voor het gebruik van de live render metrics in de agent dashboard.

---

## 1. Open de perf panel

Druk `/` in de agent dashboard om command mode te openen, typ:

```
/perf
```

Er verschijnt een overlay met live render metrics van de **dashboard**-component.  
Druk `q` of `esc` om te sluiten.

## 2. Schakel tussen dashboard en widget metrics

```bash
/perf widget      # toon render metrics van de editor widget
/perf dashboard   # toon render metrics van de dashboard zelf (default)
```

De bron staat linksboven in de panel: `⬡ dashboard` of `⌂ widget`.

## 3. Reset de tellers

```bash
/perf reset       # zet alle render counters terug naar 0
```

Resettet alleen de metrics van de **huidige** view (dashboard of widget).

## 4. Metrics interpreteren

### Render Duration

| Veld | Betekenis | Gezond | Waarschuwing |
|---|---|---|---|
| **last** | Tijd van de meest recente render | — | — |
| **mean** | Gemiddelde over alle renders | Dashboard: < 50ms | > 50ms = traag |
| | | Widget: < 16ms | > 16ms = onder 60fps |
| **min / max** | Snelste / traagste render ooit | — | — |

### Debounce Effectiveness

| Veld | Betekenis | Doel |
|---|---|---|
| **requested renders** | Hoe vaak `requestRender()` is aangeroepen | — |
| **actual renders** | Hoe vaak `render()` daadwerkelijk is uitgevoerd | — |
| **skipped (debounced)** | `requested - actual` | Hoe hoger, hoe beter de debounce werkt |
| **request/actual ratio** | Requests per echte render | > 2x = debounce effectief |

**Voorbeeld**: 100 requested, 30 actual, 70 skipped, ratio 3.33x.  
→ De rate limiter en dirty check voorkomen 70% onnodige renders.

### Agent Context

| Veld | Betekenis |
|---|---|
| **current agents** | Aantal agents op moment van laatste render |
| **mean agents/render** | Gemiddeld aantal agents per render |
| **min / max agents** | Laagste / hoogste aantal tijdens meting |

### Timing

| Veld | Betekenis |
|---|---|
| **time to first visible** | Tijd tussen eerste spawn en eerste render in dashboard |
| **renders/sec** | Gemiddeld aantal renders per seconde |
| **elapsed** | Totale tijd sinds start van metrics tracking |

## 5. Debug logging inschakelen

Voor gedetailleerde logging van _elke_ trage render:

```bash
export PI_SUBAGENTS_LOG_LEVEL=debug
```

De `RenderMetrics` class logt dan een JSON-regel voor elke render die de threshold overschrijdt:

```
render-metrics: slow dashboard-render {
  "durationMs": 87.32,
  "thresholdMs": 50,
  "renderCount": 42,
  "skipped": 128,
  "activeAgents": 7,
  "meanMs": 23.14
}
```

De `record()` methode retourneert `true` voor trage renders, zodat callers zelf kunnen reageren.

### Thresholds

| Component | Threshold | Bij overschrijding |
|---|---|---|
| Dashboard `render()` | 50ms | Log + `record()` returnt `true` |
| Widget `renderWidget()` | 16ms | Log + `record()` returnt `true` |

## 6. CI benchmark checks

De CI draait de render benchmark tests en controleert of gemeten waardes binnen de drempel blijven. De **benchmarks-job is blocking** in de required CI gate.

```bash
# Volledige benchmark suite + threshold tabel
node scripts/check-benchmark-thresholds.mjs

# Enkele benchmark file
npm test -- test/widget-render-perf.test.ts
```

**Benchmark test files** (alle gebruiken `test/helpers/benchmark-log.ts`):

| File | Meet |
|---|---|
| `test/widget-render-perf.test.ts` | Widget render + debounce |
| `test/dashboard-render-perf.test.ts` | Dashboard `render()` throughput |
| `test/dashboard.benchmark.test.ts` | 50k-agent body build |
| `test/spawn-latency-bench.test.ts` | Spawn pipeline micro-ops |
| `test/spawn-latency-e2e-bench.test.ts` | End-to-end spawn setup |
| `test/handoff-v2.test.ts` | `parseHandoff` parse time |

Het script draait vitest met `--retry=0`, parseert `[BENCHMARK]` regels, en faalt als vitest zelf faalt of een threshold wordt overschreden.

De checker toont een tabel met alle benchmarks:

```
 ═══ Render Benchmark Threshold Check ═══

 Results
 ─────────────────────────────────────────────────────────
 Benchmark                     Measured        Threshold       %     Status
 ─────────────────────────────────────────────────────────
 renderAgentWidget 10 mixed    0.290ms         0.600ms         48%   OK
 renderAgentWidget 50 mixed    1.240ms         3.000ms         41%   OK
 buildSnapshot 200 agents      0.120µs         0.200µs         60%   OK
 ...
 ─────────────────────────────────────────────────────────
 Summary: 12 OK, 1 WARN, 0 FAIL
```

- **OK** — binnen threshold
- **WARN** — > 80% van threshold (nadert limiet)
- **FAIL** — threshold overschreden (exit code 1)

## 7. Snelle checklist

| Symptoom | Check |
|---|---|
| Dashboard voelt traag | `/perf` → mean > 50ms? |
| Widget hapert bij veel agents | `/perf widget` → mean > 16ms? |
| Dashboard render te vaak | `/perf` → ratio < 1.5x? Dan werkt debounce niet |
| Lange time-to-first-visible | `/perf` → `timeToFirstVisible` > 1000ms? |
| CI benchmark faalt | `node scripts/check-benchmark-thresholds.mjs` lokaal |
| Wil alle trage renders zien | `PI_SUBAGENTS_LOG_LEVEL=debug` en check stdout |

## 8. Voorbeeld: performance regression opsporen

```bash
# 1. Debug logging inschakelen (vóór de sessie)
export PI_SUBAGENTS_LOG_LEVEL=debug
# Start de sessie hierna

# 2. In de dashboard: reset counters
/perf reset

# 3. Voer actie uit die traag aanvoelt (bv. spawn 10 agents)

# 4. Open perf panel
/perf

# 5. Check of mean > threshold
#    Zo ja: check of het de dashboard of widget is
/perf widget   # widget metrics
/perf          # terug naar dashboard metrics
```

---

*Zie `PERFORMANCE.md` voor de volledige performance architectuur documentatie.*
