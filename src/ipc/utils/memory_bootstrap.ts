/**
 * Memory Bootstrap — DISABLED
 *
 * The cold-start bootstrap pipeline has been removed.
 * All functions are kept as no-op stubs for backward compatibility.
 */

interface ProjectDNA {
    hasSignificantContent: boolean;
    configFiles: string[];
    configSnippets: Record<string, string>;
    directoryTree: string;
}

interface BootstrapResult {
    phase1Count: number;
    phase2Count: number;
}

export async function collectProjectDNA(
    _projectDir: string,
): Promise<ProjectDNA> {
    return {
        hasSignificantContent: false,
        configFiles: [],
        configSnippets: {},
        directoryTree: "",
    };
}

export async function runMemoryBootstrap(_params: {
    appId: number;
    userId: string;
    projectDir: string;
    appName?: string;
}): Promise<BootstrapResult> {
    return { phase1Count: 0, phase2Count: 0 };
}

export async function needsBootstrap(_appId: number, _userId: string): Promise<boolean> {
    return false;
}
