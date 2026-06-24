/**
 * detect-shift-in-loop.mjs — P5 detector from the overdrive pattern catalogue.
 *
 * Scans TypeScript/JavaScript source files for `Array.prototype.shift()`
 * called inside a loop body. `shift()` is `O(N)` (re-indexes the entire
 * array on every pop), so a BFS or hot loop using `shift()` becomes at
 * least `O(N²)`.
 *
 * The canonical anti-pattern:
 *   const queue = [...];
 *   while (queue.length > 0) {
 *     const item = queue.shift()!;  // O(N) per pop
 *     // ...
 *   }
 *
 * The fix is to use a head index:
 *   let head = 0;
 *   while (head < queue.length) {
 *     const item = queue[head++];  // O(1) per pop
 *     // ...
 *   }
 *
 * The detector tracks loop depth with a simple state machine: it counts
 * brace depth and tracks whether we're inside a `for`/`while`/`for...of`/
 * `do...while` body. A `.shift()` call inside a loop body is flagged.
 *
 * Usage:
 *   import { detectShiftInLoop } from './detect-shift-in-loop.mjs';
 *   const findings = detectShiftInLoop(sourceText, { filePath: 'src/foo.ts' });
 */

const LOOP_KEYWORDS = /\b(for|while|do)\b/;
const SHIFT_CALL = /\.shift\s*\(\s*\)/g;

/**
 * @param {string} source
 * @param {{ filePath?: string }} [opts]
 * @returns {Array<{ rule: string, file: string, line: number, column: number, snippet: string, message: string }>}
 */
export function detectShiftInLoop(source, opts = {}) {
	const filePath = opts.filePath ?? "<input>";
	const findings = [];
	const lines = source.split("\n");

	// State: stack of { loopStartLine, enterDepth }
	// enterDepth = brace depth at the moment we entered the loop's header line.
	// The loop body lives between enterDepth and (enterDepth + 1).
	const stack = [];
	let braceDepth = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNum = i + 1;
		const trimmed = line.trim();

		// Skip pure comments
		if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

		// Detect loop start (for/while/do keyword as a statement-level token)
		if (LOOP_KEYWORDS.test(trimmed)) {
			stack.push({ loopStartLine: lineNum, enterDepth: braceDepth });
		}

		// Count braces on this line, respecting strings and comments
		const { openBraces, closeBraces } = countBraces(line);
		const newDepth = braceDepth + openBraces - closeBraces;

		// Pop loop frames whose body has ended (closeBrace brought depth back to enterDepth or below)
		if (closeBraces > 0) {
			while (stack.length > 0 && braceDepth <= stack[stack.length - 1].enterDepth) {
				stack.pop();
			}
		}

		braceDepth = newDepth;

		// Check for .shift() calls while inside at least one loop
		if (stack.length > 0) {
			for (const match of line.matchAll(SHIFT_CALL)) {
				findings.push({
					rule: "detect-shift-in-loop",
					file: filePath,
					line: lineNum,
					column: match.index + 1,
					snippet: trimmed.slice(0, 200),
					message:
						`Array.shift() called inside a loop (started at line ${stack[stack.length - 1].loopStartLine}). ` +
						`shift() is O(N) per pop, making this loop O(N²). ` +
						`Use a head index: \`let head = 0; const item = queue[head++];\` ` +
						`and check \`head < queue.length\` for termination. See overdrive pattern P5.`,
				});
			}
		}
	}

	return findings;
}

/**
 * Count open/close braces on a line, respecting strings and comments.
 * @param {string} line
 * @returns {{ openBraces: number, closeBraces: number }}
 */
function countBraces(line) {
	let openBraces = 0;
	let closeBraces = 0;
	let inString = null;

	for (let c = 0; c < line.length; c++) {
		const ch = line[c];
		const next = line[c + 1];

		// Skip line comments (everything after // is ignored)
		if (!inString && ch === "/" && next === "/") break;
		// Skip block comments (single-line only; multi-line blocks would need a
		// separate state, but the detector's heuristic is line-based)
		if (!inString && ch === "/" && next === "*") {
			c++;
			continue;
		}
		// String handling
		if (inString) {
			if (ch === "\\") {
				c++; // skip escaped char
				continue;
			}
			if (ch === inString) inString = null;
			continue;
		}
		if (ch === '"' || ch === "'" || ch === "`") {
			inString = ch;
			continue;
		}
		if (ch === "{") openBraces++;
		else if (ch === "}") closeBraces++;
	}

	return { openBraces, closeBraces };
}
