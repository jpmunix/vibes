/**
 * PreferencesCache — In-memory cache for user preferences (key-value).
 *
 * Replaces the monolithic user-settings.json read/write cycle with a Map
 * that hydrates once from BunnyDB on login and serves all reads from memory.
 *
 * Write path: Map update (instant) → async DB upsert (non-blocking).
 * Read path: Map lookup only (0 queries after hydrate).
 */
import { getRemoteDb } from "../db/remote";
import { userPreferences } from "../db/remote-schema";
import { eq, and } from "drizzle-orm";
import log from "electron-log";
import { resetSettingsCache } from "./settings";

const logger = log.scope("prefs-cache");

export type PreferenceChangeListener = (
  key: string,
  value: string | null,
  appId: number,
) => void;

class PreferencesCache {
  private static instance: PreferencesCache;

  /** Cache: "userId:appId:key" → serialized value string */
  private cache = new Map<string, string>();

  /** Current hydrated userId (null if not hydrated) */
  private hydratedUserId: string | null = null;

  /** Listeners invoked after every successful set() */
  private listeners: PreferenceChangeListener[] = [];

  private constructor() {}

  static getInstance(): PreferencesCache {
    if (!PreferencesCache.instance) {
      PreferencesCache.instance = new PreferencesCache();
    }
    return PreferencesCache.instance;
  }

  // ── Cache key helper ───────────────────────────────────────────────────
  private cacheKey(userId: string, key: string, appId: number): string {
    return `${userId}:${appId}:${key}`;
  }

  // ── Hydrate ────────────────────────────────────────────────────────────
  /**
   * Load ALL preferences for a user from DB into the Map.
   * Called once on login / verifySession. Replaces the old
   * forceSyncRemoteSettingsToLocal() function.
   *
   * @returns The number of keys loaded.
   */
  async hydrate(userId: string): Promise<number> {
    const db = getRemoteDb();
    try {
      const rows = await db
        .select({
          appId: userPreferences.appId,
          key: userPreferences.key,
          value: userPreferences.value,
        })
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId));

      // Clear previous cache for this user
      this.cache.clear();
      this.hydratedUserId = userId;

      for (const row of rows) {
        const ck = this.cacheKey(userId, row.key, row.appId);
        this.cache.set(ck, row.value);
      }

      resetSettingsCache();

      logger.info(`Hydrated ${rows.length} preferences for user ${userId}`);
      return rows.length;
    } catch (err) {
      logger.error("Failed to hydrate preferences cache:", err);
      throw err;
    }
  }

  // ── Read ───────────────────────────────────────────────────────────────
  /**
   * Get a single preference value from the cache.
   * Returns the raw string (caller is responsible for JSON.parse if needed).
   * Returns null if the key doesn't exist.
   */
  get(userId: string, key: string, appId = 0): string | null {
    const ck = this.cacheKey(userId, key, appId);
    return this.cache.get(ck) ?? null;
  }

  /**
   * Get a preference and parse it as JSON.
   * Returns the parsed value, or `defaultValue` if the key is missing or unparseable.
   */
  getParsed<T>(userId: string, key: string, defaultValue: T, appId = 0): T {
    const raw = this.get(userId, key, appId);
    if (raw === null) return defaultValue;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // If it's a plain string that isn't JSON, return it directly if T is string
      return raw as unknown as T;
    }
  }

  /**
   * Get ALL cached preferences as a flat Record<string, string>.
   * Only returns global (appId=0) preferences for the given userId.
   */
  getAll(userId: string, appId = 0): Record<string, string> {
    const prefix = `${userId}:${appId}:`;
    const result: Record<string, string> = {};
    for (const [ck, value] of this.cache.entries()) {
      if (ck.startsWith(prefix)) {
        const key = ck.slice(prefix.length);
        result[key] = value;
      }
    }
    return result;
  }

  // ── Write ──────────────────────────────────────────────────────────────
  /**
   * Set a preference value.
   * 1. Updates the Map immediately (synchronous).
   * 2. Writes to DB asynchronously (non-blocking).
   * 3. Notifies all registered listeners.
   *
   * @param value - The raw string value. Callers should JSON.stringify() objects before passing.
   */
  set(userId: string, key: string, value: string, appId = 0): void {
    const ck = this.cacheKey(userId, key, appId);
    this.cache.set(ck, value);
    resetSettingsCache();

    // Async DB write — fire and forget with error logging
    this.writeToDb(userId, key, value, appId).catch((err) => {
      logger.error(`Failed to persist preference "${key}":`, err);
    });

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(key, value, appId);
      } catch (err) {
        logger.error(`Preference listener error for "${key}":`, err);
      }
    }
  }

  /**
   * Delete a preference.
   */
  delete(userId: string, key: string, appId = 0): void {
    const ck = this.cacheKey(userId, key, appId);
    this.cache.delete(ck);
    resetSettingsCache();

    this.deleteFromDb(userId, key, appId).catch((err) => {
      logger.error(`Failed to delete preference "${key}":`, err);
    });

    for (const listener of this.listeners) {
      try {
        listener(key, null, appId);
      } catch (err) {
        logger.error(`Preference listener error for "${key}" delete:`, err);
      }
    }
  }

  // ── Bulk set (for backward compat with updateSettings) ─────────────────
  /**
   * Set multiple preferences at once.
   * Each key is updated in cache immediately, DB writes are batched async.
   */
  setMany(
    userId: string,
    entries: Record<string, string>,
    appId = 0,
  ): void {
    for (const [key, value] of Object.entries(entries)) {
      if (value == null) continue; // Skip null/undefined — DB column is NOT NULL
      const ck = this.cacheKey(userId, key, appId);
      this.cache.set(ck, value);
    }
    resetSettingsCache();

    // Async batch write
    this.writeManyToDb(userId, entries, appId).catch((err) => {
      logger.error("Failed to persist batch preferences:", err);
    });

    // Notify listeners for each key
    for (const [key, value] of Object.entries(entries)) {
      for (const listener of this.listeners) {
        try {
          listener(key, value, appId);
        } catch (err) {
          logger.error(`Preference listener error for "${key}":`, err);
        }
      }
    }
  }

  // ── Listeners ──────────────────────────────────────────────────────────
  /**
   * Register a callback invoked after every set/delete operation.
   * Returns an unsubscribe function.
   */
  onChange(listener: PreferenceChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  // ── Cache management ───────────────────────────────────────────────────
  /**
   * Clear all cached data (e.g. on logout).
   */
  clear(): void {
    this.cache.clear();
    this.hydratedUserId = null;
    logger.info("Preferences cache cleared");
  }

  get isHydrated(): boolean {
    return this.hydratedUserId !== null;
  }

  get currentUserId(): string | null {
    return this.hydratedUserId;
  }

  // ── Private DB operations ──────────────────────────────────────────────
  private async writeToDb(
    userId: string,
    key: string,
    value: string,
    appId: number,
  ): Promise<void> {
    const db = getRemoteDb();
    const now = new Date();
    await db
      .insert(userPreferences)
      .values({ userId, appId, key, value, updatedAt: now })
      .onConflictDoUpdate({
        target: [
          userPreferences.userId,
          userPreferences.key,
          userPreferences.appId,
        ],
        set: { value, updatedAt: now },
      });
  }

  private async deleteFromDb(
    userId: string,
    key: string,
    appId: number,
  ): Promise<void> {
    const db = getRemoteDb();
    await db
      .delete(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, userId),
          eq(userPreferences.key, key),
          eq(userPreferences.appId, appId),
        ),
      );
  }

  private async writeManyToDb(
    userId: string,
    entries: Record<string, string>,
    appId: number,
  ): Promise<void> {
    const db = getRemoteDb();
    const now = new Date();
    const keys = Object.keys(entries);

    // Batch in groups of 20 to avoid overwhelming the remote DB
    const BATCH_SIZE = 20;
    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      const batch = keys.slice(i, i + BATCH_SIZE);
      const promises = batch
        .filter((key) => entries[key] != null) // Guard: skip null/undefined values (NOT NULL column)
        .map((key) =>
        db
          .insert(userPreferences)
          .values({ userId, appId, key, value: entries[key], updatedAt: now })
          .onConflictDoUpdate({
            target: [
              userPreferences.userId,
              userPreferences.key,
              userPreferences.appId,
            ],
            set: { value: entries[key], updatedAt: now },
          }),
      );
      await Promise.all(promises);
    }
  }
}

/** Convenience export — all consumers use this singleton */
export const preferencesCache = PreferencesCache.getInstance();
