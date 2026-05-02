/**
 * Centralized admin identity check.
 * Single source of truth for the admin user ID.
 */

export const ADMIN_USER_ID = "295703a0-093e-4b1a-9d27-9b8c4e2a2b71";

/**
 * Check if a user ID corresponds to the admin user.
 */
export function isAdmin(userId: string | undefined | null): boolean {
    return !!userId && userId === ADMIN_USER_ID;
}
