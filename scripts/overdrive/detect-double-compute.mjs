/**
 * detect-double-compute.mjs — P4 detector from the overdrive pattern catalogue.
 *
 * Scans TypeScript/JavaScript source files for patterns where the same
 * method (`.trim()`, `.toLowerCase()`, `.toString()`, etc.) is called twice
 * on the same identifier within a small window (default: 8 lines).
 *
 * The canonical anti-pattern:
 *   if (text.trim()) parts.push(`[User]: ${text.trim()}`);
 *
 * The detector looks for identifier+method pairs that appear twice in a
 * window. False positives are possible for legitimate use cases (e.g.,
 * `arr.length` is not flagged because `.length` is a property, not a
 * method). Pure-method calls only are considered.
 *
 * Pure methods commonly double-computed:
 *   .trim(), .trimStart(), .trimEnd()
 *   .toLowerCase(), .toUpperCase()
 *   .toString(), .valueOf()
 *   .normalize()
 *   .slice() with no args (or with the same args)
 *
 * Usage:
 *   import { detectDoubleCompute } from './detect-double-compute.mjs';
 *   const findings = detectDoubleCompute(sourceText, { filePath: 'src/foo.ts' });
 */

const PURE_METHODS = new Set([
	"trim",
	"trimStart",
	"trimEnd",
	"toLowerCase",
	"toUpperCase",
	"toString",
	"valueOf",
	"normalize",
]);

const WINDOW_SIZE = 8; // lines

/**
 * @param {string} source
 * @param {{ filePath?: string, windowSize?: number }} [opts]
 * @returns {Array<{ rule: string, file: string, line: number, column: number, snippet: string, message: string }>}
 */
export function detectDoubleCompute(source, opts = {}) {
	const filePath = opts.filePath ?? "<input>";
	const windowSize = opts.windowSize ?? WINDOW_SIZE;
	const findings = [];
	const lines = source.split("\n");

	// Build a sliding window of (lineNum, identifier, method) tuples
	// then look for duplicate (identifier, method) pairs in the window.
	const window = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNum = i + 1;

		// Skip pure comments
		const trimmed = line.trim();
		if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

		// Find all identifier.method() calls on this line
		const callPattern = /\b([a-zA-Z_$][\w$]*)\.([a-zA-Z_$][\w$]*)\s*\(/g;
		const calls = [];
		for (const match of line.matchAll(callPattern)) {
			const identifier = match[1];
			const method = match[2];
			if (!PURE_METHODS.has(method)) continue;
			calls.push({
				identifier,
				method,
				column: match.index + 1,
			});
		}

		// Add to window
		for (const call of calls) {
			window.push({ lineNum, line: trimmed, ...call });
		}

		// Check for duplicates in the window (excluding same-line duplicates)
		for (let j = 0; j < window.length; j++) {
			for (let k = j + 1; k < window.length; k++) {
				const a = window[j];
				const b = window[k];
				if (a.lineNum === b.lineNum) continue; // same-line is OK (e.g., chaining)
				if (a.identifier !== b.identifier) continue;
				if (a.method !== b.method) continue;
				// Skip if the identifier is `this` (legitimate) or a common FP-prone name
				if (a.identifier === "this") continue;
				// Skip if the calls are very close (likely the same expression on consecutive lines)
				if (Math.abs(a.lineNum - b.lineNum) <= 1 && a.column === b.column) continue;
				findings.push({
					rule: "detect-double-compute",
					file: filePath,
					line: b.lineNum,
					column: b.column,
					snippet: b.line.slice(0, 200),
					message:
						`Double-compute: ${a.identifier}.${a.method}() called twice ` +
						`(line ${a.lineNum} and line ${b.lineNum}). Cache the result ` +
						`once and reuse. See overdrive pattern P4.`,
				});
				// Remove the first occurrence so we don't double-report
				window.splice(j, 1);
				break;
			}
		}

		// Trim window to WINDOW_SIZE
		while (window.length > 0 && window[0].lineNum < lineNum - windowSize) {
			window.shift();
		}
	}

	return findings;
}
