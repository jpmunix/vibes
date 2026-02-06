import log from "electron-log";

export const logger = log.scope("retryWithRateLimit");

/**
 * Custom error class for rate limit errors thrown from fetch responses.
 * This allows retryWithRateLimit to detect and retry on 429 responses.
 */
export class RateLimitError extends Error {
  public readonly status = 429;
  public readonly response: Response;

  constructor(message: string, response: Response) {
    super(message);
    this.name = "RateLimitError";
    this.response = response;
  }
}

/**
 * Checks if an error is a rate limit error (HTTP 429).
 */
export function isRateLimitError(error: any): boolean {
  // Check for RateLimitError instance
  if (error instanceof RateLimitError) {
    return true;
  }
  // Check for status property directly on error (e.g., RateLimitError)
  if (error?.status === 429) {
    return true;
  }
  // Check for nested response.status (legacy pattern)
  const status = error?.response?.status;
  return status === 429;
}

/**
 * Checks if an error is a network error that should be retried.
 * Includes timeouts, connection errors, DNS errors, etc.
 */
export function isNetworkError(error: any): boolean {
  // Check for fetch failure errors
  if (error instanceof TypeError && error.message === "fetch failed") {
    return true;
  }

  // Check for common network error codes
  const code = error?.code || error?.cause?.code;
  if (code) {
    const retryableCodes = [
      "ETIMEDOUT",
      "ECONNRESET",
      "ECONNREFUSED",
      "ENOTFOUND",
      "ENETUNREACH",
      "EHOSTUNREACH",
    ];
    return retryableCodes.includes(code);
  }

  return false;
}

/**
 * Checks if an error should be retried (rate limit or network error).
 */
export function isRetryableError(error: any): boolean {
  return isRateLimitError(error) || isNetworkError(error);
}

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 8,
  baseDelay: 2_000, // 2 seconds
  maxDelay: 30_000, // 30 seconds
  jitterFactor: 0.1, // 10% jitter
};

export interface RetryWithRateLimitOptions {
  /** Maximum number of retries */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff */
  baseDelay?: number;
  /** Maximum delay in ms */
  maxDelay?: number;
}

/**
 * Retries an async operation with exponential backoff on rate limit errors (429).
 * Uses exponential backoff.
 *
 * @param operation - The async operation to retry
 * @param context - A descriptive context string for logging
 * @param options - Optional retry configuration
 */
export async function retryWithRateLimit<T>(
  operation: () => Promise<T>,
  context: string,
  options?: RetryWithRateLimitOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? RETRY_CONFIG.maxRetries;
  const baseDelay = options?.baseDelay ?? RETRY_CONFIG.baseDelay;
  const maxDelay = options?.maxDelay ?? RETRY_CONFIG.maxDelay;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      if (attempt > 0) {
        logger.info(`${context}: Success after ${attempt + 1} attempts`);
      }
      return result;
    } catch (error: any) {
      lastError = error;

      // Only retry on retryable errors (rate limit or network errors)
      if (!isRetryableError(error)) {
        throw error;
      }

      // Don't retry if we've exhausted all attempts
      if (attempt === maxRetries) {
        const errorType = isRateLimitError(error)
          ? "rate limit"
          : "network error";
        logger.error(
          `${context}: Failed after ${maxRetries + 1} attempts due to ${errorType}`,
        );
        throw error;
      }

      let delay: number;

      // Use exponential backoff with jitter
      const exponentialDelay = baseDelay * Math.pow(2, attempt);
      const jitter =
        exponentialDelay * RETRY_CONFIG.jitterFactor * Math.random();
      delay = Math.min(exponentialDelay + jitter, maxDelay);

      const errorType = isRateLimitError(error)
        ? "Rate limited"
        : "Network error";
      logger.warn(
        `${context}: ${errorType} (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Wrapper around fetch that automatically retries on rate limit (429) responses.
 * Uses exponential backoff via retryWithRateLimit.
 *
 * @param input - The fetch input (URL or Request)
 * @param init - Optional fetch init options
 * @param context - A descriptive context string for logging
 * @param retryOptions - Optional retry configuration
 * @returns The fetch Response (will not be a 429 response unless retries exhausted)
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  context: string,
  retryOptions?: RetryWithRateLimitOptions,
): Promise<Response> {
  return retryWithRateLimit(
    async () => {
      const response = await fetch(input, init);
      if (response.status === 429) {
        throw new RateLimitError(
          `Rate limited (429): ${response.statusText}`,
          response,
        );
      }
      return response;
    },
    context,
    retryOptions,
  );
}
