interface ShutdownDeps {
  server: { close(cb: (err?: Error) => void): void };
  stopTimers: () => void;
  disconnect: () => Promise<void>;
  exit: (code: number) => void;
  log?: (msg: string) => void;
  timeoutMs?: number;
}

/** Drain requests before disconnecting stores, with a deadline for the entire shutdown. */
export function createShutdown({
  server,
  stopTimers,
  disconnect,
  exit,
  log,
  timeoutMs = 10_000,
}: ShutdownDeps): (signal: string) => Promise<void> {
  let shuttingDown = false;
  return async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    let exited = false;
    const finish = (code: number) => {
      if (exited) return;
      exited = true;
      clearTimeout(timer);
      exit(code);
    };
    const timer = setTimeout(() => finish(1), timeoutMs);
    timer.unref();

    try {
      log?.(`Received ${signal}; shutting down`);
      stopTimers();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      if (exited) return;
      await disconnect();
      finish(0);
    } catch {
      finish(1);
    }
  };
}
