import log from "electron-log";

const logger = log.scope("lock_utils");

const locks = new Map<number | string, Promise<void>>();

/**
 * Acquires a lock for an app operation
 * @param lockId The app ID to lock
 * @returns An object with release function and promise
 */
export function acquireLock(lockId: number | string): {
  release: () => void;
  promise: Promise<void>;
} {
  let release: () => void = () => { };

  const promise = new Promise<void>((resolve) => {
    release = () => {
      // Only delete if we're still the current lock holder
      if (locks.get(lockId) === promise) {
        locks.delete(lockId);
      }
      resolve();
    };
  });

  locks.set(lockId, promise);
  return { release, promise };
}

/**
 * Executes a function with a lock on the lock ID.
 *
 * Uses promise-chaining to guarantee mutual exclusion:
 * our lock is registered in the Map synchronously (before any await),
 * so subsequent callers always queue behind us.
 *
 * @param lockId The lock ID to lock
 * @param fn The function to execute with the lock
 * @returns Result of the function
 */
export async function withLock<T>(
  lockId: number | string,
  fn: () => Promise<T>,
): Promise<T> {
  // Capture existing lock (if any) SYNCHRONOUSLY before registering ours
  const existingLock = locks.get(lockId);

  // Register our lock SYNCHRONOUSLY so the next caller queues behind us
  let release!: () => void;
  const myLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(lockId, myLock);

  // NOW await the previous holder (if any)
  if (existingLock) {
    logger.debug(`withLock: waiting for lock ${lockId}`);
    await existingLock;
  }

  try {
    const result = await fn();
    return result;
  } finally {
    // Only clean up our entry if nobody else has replaced it
    if (locks.get(lockId) === myLock) {
      locks.delete(lockId);
    }
    release();
  }
}
