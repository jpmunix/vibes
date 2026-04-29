import { useAuth } from "@/hooks/useAuth";
import { isAdmin as checkAdmin } from "@/lib/admin";

/**
 * React hook to check if the current user is an admin.
 * Reusable across any component.
 */
export function useIsAdmin(): boolean {
    const { user } = useAuth();
    return checkAdmin(user?.id);
}
