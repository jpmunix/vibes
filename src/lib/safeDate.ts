/**
 * Normalizes a date value that may come from the database as:
 * - A Date object (from Drizzle ORM structured clone)
 * - A number in seconds (Unix timestamp, correct)
 * - A number in milliseconds (bug: some records stored Date.now() instead of seconds)
 * - An ISO string (from JSON serialization in web mode)
 *
 * The bug: Drizzle ORM with `mode: "timestamp"` expects integer seconds in SQLite,
 * but some records were stored with millisecond values. When Drizzle reads these,
 * it does `new Date(millis * 1000)` producing dates in year ~58,000.
 *
 * This function detects and corrects the mismatch.
 */
export function safeDate(value: unknown): Date {
  if (value instanceof Date) {
    // If the Date is absurdly far in the future (year > 3000),
    // it's likely a millis-as-seconds bug from Drizzle.
    // Reconstruct from the underlying timestamp.
    if (value.getFullYear() > 3000) {
      return new Date(value.getTime() / 1000);
    }
    return value;
  }
  if (typeof value === "number") {
    // Values > 1e12 are milliseconds (e.g., 1779353447031)
    // Values <= 1e12 are seconds (e.g., 1779353447)
    if (value > 1e12) {
      return new Date(value);
    }
    return new Date(value * 1000);
  }
  if (typeof value === "string") {
    return new Date(value);
  }
  return new Date();
}
