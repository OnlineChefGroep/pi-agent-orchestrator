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

export function isAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Await `promise`, or reject with AbortError when `signal` aborts first.
 * Already-aborted signals reject immediately without racing the promise.
 */
export async function waitForPromiseOrAbort(
  promise: Promise<unknown>,
  signal?: AbortSignal,
  fallbackMessage = "Operation aborted",
): Promise<void> {
  if (!signal) {
    await promise;
    return;
  }

  if (signal.aborted) throw createAbortError(signal, fallbackMessage);

  await new Promise<void>((resolve, reject) => {
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
      () => settle(resolve),
      error => settle(() => reject(error)),
    );
  });
}
