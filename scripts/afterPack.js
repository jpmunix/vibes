const fs = require("fs");
const path = require("path");

/**
 * afterPack hook para Electron Forge
 * Fixes platform-specific issues after packaging:
 * - Linux: restores executable permissions on dugite git binaries
 * - Darwin: logs informational message (no native deps to fix)
 */
exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName === "linux") {
    await fixLinuxGitPermissions(appOutDir);
    return;
  }

  if (electronPlatformName === "darwin") {
    console.log("[afterPack] ✅ Darwin build — no native dependency fixes needed");
    return;
  }

  console.log(`[afterPack] Skipping platform-specific fixes for ${electronPlatformName}`);
};

/**
 * Fixes executable permissions for the dugite git binary on Linux.
 * When Electron Forge packages the app, binaries in extraResource
 * can lose their executable bit. This restores chmod +x on all
 * files under resources/git/bin/ and resources/git/libexec/.
 */
async function fixLinuxGitPermissions(appOutDir) {
  console.log("[afterPack] Fixing git binary permissions for Linux...");

  const gitResourceDir = path.join(appOutDir, "resources", "git");

  if (!fs.existsSync(gitResourceDir)) {
    console.warn(
      `[afterPack] WARNING: Dugite git directory not found at ${gitResourceDir}`,
    );
    return;
  }

  // Directories that contain executables
  const execDirs = ["bin", "libexec"];
  let fixedCount = 0;

  for (const dir of execDirs) {
    const dirPath = path.join(gitResourceDir, dir);
    if (!fs.existsSync(dirPath)) continue;

    chmodRecursive(dirPath);
    fixedCount++;
  }

  console.log(
    `[afterPack] ✅ Fixed executable permissions in ${fixedCount} directories under resources/git/`,
  );
}

/**
 * Recursively sets 0o755 on all files in a directory.
 */
function chmodRecursive(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      fs.chmodSync(fullPath, 0o755);
      chmodRecursive(fullPath);
    } else if (entry.isFile()) {
      fs.chmodSync(fullPath, 0o755);
    }
  }
}
