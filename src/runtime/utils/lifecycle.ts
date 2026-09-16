let ready: Promise<void> = Promise.resolve()

export function bindDrizzleReady(promise: Promise<void>): void {
  ready = promise
}

export function awaitDrizzleReady(): Promise<void> {
  return ready
}
