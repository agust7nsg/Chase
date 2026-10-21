/** Bound headers AND body reads; a timed-out account request cannot hold a form forever. */
export function accountFetch(transport: typeof fetch = globalThis.fetch, timeoutMs = 15_000): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let interrupt: (() => void) | undefined;
    const failure = new Promise<never>((_resolve, reject) => {
      interrupt = () => { controller.abort(); reject(new Error('Account request interrupted.')); };
      init?.signal?.addEventListener('abort', interrupt, { once: true });
      timer = setTimeout(interrupt, timeoutMs);
      if (init?.signal?.aborted) interrupt();
    });
    try {
      const response = await Promise.race([transport(input, { ...init, signal: controller.signal }), failure]);
      if (Number(response.headers.get('content-length')) > 262_144) throw new Error('Account response is too large.');
      const text = await Promise.race([response.text(), failure]);
      if (text.length > 262_144) throw new Error('Account response is too large.');
      return new Response([204, 205, 304].includes(response.status) ? null : text,
        { status: response.status, statusText: response.statusText, headers: response.headers });
    } finally { if (timer) clearTimeout(timer); if (interrupt) init?.signal?.removeEventListener('abort', interrupt); }
  };
}
