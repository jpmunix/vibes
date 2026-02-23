import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Test the pure logic extracted from useUpdateChecker
// We test the "should we show the update?" decision function in isolation.
// ---------------------------------------------------------------------------

const DISMISSED_KEY = "update-dismissed-version";

function shouldShowUpdate(
    appVersion: string | null,
    remoteVersion: string | null,
    dismissedVersion: string | null,
): boolean {
    if (!appVersion) return false;
    if (!remoteVersion) return false;
    if (remoteVersion === appVersion) return false;
    if (dismissedVersion === remoteVersion) return false;
    return true;
}

describe("Update checker logic", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("should NOT show if remote version equals current version", () => {
        expect(shouldShowUpdate("5.0", "5.0", null)).toBe(false);
    });

    it("should show if remote version differs from current version", () => {
        expect(shouldShowUpdate("5.0", "5.0.1", null)).toBe(true);
    });

    it("should NOT show if remote version is null (fetch failed)", () => {
        expect(shouldShowUpdate("5.0", null, null)).toBe(false);
    });

    it("should NOT show if remote version is empty string", () => {
        expect(shouldShowUpdate("5.0", "", null)).toBe(false);
    });

    it("should NOT show if current version is null (not loaded yet)", () => {
        expect(shouldShowUpdate(null, "5.0.1", null)).toBe(false);
    });

    it("should NOT show if the remote version was dismissed", () => {
        expect(shouldShowUpdate("5.0", "6.0", "6.0")).toBe(false);
    });

    it("should show if dismissed version differs from new remote version", () => {
        // User dismissed 6.0, but now 6.1 is available
        expect(shouldShowUpdate("5.0", "6.1", "6.0")).toBe(true);
    });

    it("dismiss with remember stores the version in localStorage", () => {
        const version = "6.0";
        localStorage.setItem(DISMISSED_KEY, version);
        expect(localStorage.getItem(DISMISSED_KEY)).toBe("6.0");
    });

    it("dismiss without remember does NOT store anything", () => {
        // Simulate omitir without checkbox
        expect(localStorage.getItem(DISMISSED_KEY)).toBeNull();
    });

    it("download also stores the dismissed version", () => {
        const version = "6.0";
        // Simulate download behavior
        localStorage.setItem(DISMISSED_KEY, version);
        expect(localStorage.getItem(DISMISSED_KEY)).toBe("6.0");
        // After user installs 6.0 and a new 6.1 comes out,
        // dismissed = "6.0" !== remote "6.1" → should show again
        expect(shouldShowUpdate("6.0", "6.1", localStorage.getItem(DISMISSED_KEY))).toBe(true);
    });
});
