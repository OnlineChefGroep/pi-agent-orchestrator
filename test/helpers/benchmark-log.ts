/**
 * Shared benchmark logger for CI threshold parsing.
 *
 * Measured values are always in milliseconds. When unit is "µs", display
 * multiplies by 1000 so sub-millisecond work is not rounded to 0.000.
 */
export function benchmarkLog(
  label: string,
  measuredMs: number,
  thresholdMs: number,
  unit: "ms" | "\u00b5s" = "ms",
): void {
  const pct = thresholdMs > 0 ? (measuredMs / thresholdMs) * 100 : 0;
  let status: string;
  if (measuredMs > thresholdMs) {
    status = "FAIL";
    console.warn(
      `\u26a0\ufe0f  BENCHMARK FAIL: ${label} \u2014 ${measuredMs} exceeds threshold ${thresholdMs}`,
    );
  } else if (pct > 80) {
    status = "WARN";
    console.warn(
      `\u26a0\ufe0f  BENCHMARK WARN: ${label} \u2014 ${measuredMs} approaching threshold ${thresholdMs} (${pct.toFixed(0)}%)`,
    );
  } else {
    status = "OK";
  }

  const measuredStr = unit === "\u00b5s"
    ? `${(measuredMs * 1000).toFixed(1)}\u00b5s`
    : `${measuredMs.toFixed(4)}ms`;
  const thresholdStr = unit === "\u00b5s"
    ? `${(thresholdMs * 1000).toFixed(1)}\u00b5s`
    : `${thresholdMs.toFixed(4)}ms`;

  process.stdout.write(
    `[BENCHMARK] ${label} ${measuredStr}/${thresholdStr} ${pct.toFixed(0)}% ${status}\n`,
  );
}
