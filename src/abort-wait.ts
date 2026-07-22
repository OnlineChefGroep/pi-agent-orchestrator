/**
 * Abort-aware promise waiting shared by tool execute paths.
 * Cancelling the wait must not permanently consume a future agent result;
 * callers own that policy around this helper.
 */

export function createAbortError(signal: AbortSignal, fallbackMessage = "Operation aborted"): Error {
  const reason = signal.reason;
  if (reason instanceof Error && reason.name === "AbortError") return reason;

  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : fallbackMessage;
  return new DOMException(message, "AbortError");
}

/**
 * Recognize AbortError-shaped values, including DOMException from createAbortError().
 * Do not require `instanceof Error` — some hosts expose AbortError DOMExceptions
 * that fail that check, which would make Esc-cancel look like a settled result.
 */
export function isAbortError(error: unknown): error is { name: "AbortError" } {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/**
 * Await `promise`, or reject with AbortError when `signal` aborts first.
 * Already-aborted signals reject immediately without racing the promise.
 * Preserves the resolved value of `promise`.
 */
export async function waitForPromiseOrAbort<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
  fallbackMessage = "Operation aborted",
): Promise<T> {
  if (!signal) {
    return await promise;
  }

  if (signal.aborted) throw createAbortError(signal, fallbackMessage);

  return await new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => settle(() => reject(createAbortError(signal, fallbackMessage)));

    signal.addEventListener("abort", onAbort, { once: true });

    // Close the race between the initial aborted check and listener registration.
    if (signal.aborted) {
      onAbort();
      return;
    }

    promise.then(
      value => settle(() => resolve(value)),
      error => settle(() => reject(error)),
    );
  });
}
