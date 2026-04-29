import { useAtomValue } from "jotai";
import { userAtom } from "@/atoms/authAtoms";
import { isAdmin as checkAdmin } from "@/lib/admin";

/**
 * React hook to check if the current user is an admin.
 * Reusable across any component.
 */
export function useIsAdmin(): boolean {
    const user = useAtomValue(userAtom);
    return checkAdmin(user?.id);
}
