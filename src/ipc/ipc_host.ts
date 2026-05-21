import { registerVisualEditingHandlers } from "../pro/main/ipc/handlers/visual_editing_handlers";
import { registerAppEnvVarsHandlers } from "./handlers/app_env_vars_handlers";
import { registerAppHandlers } from "./handlers/app_handlers";
import { registerCapacitorHandlers } from "./handlers/capacitor_handlers";
import { registerChatHandlers } from "./handlers/chat_handlers";
import registerChatStreamHandlers from "./handlers/chat_stream_handlers";
import { registerFirebaseHandlers } from "./handlers/firebase_handlers";
import { registerBunnyHandlers } from "./handlers/bunny_handlers";
import { registerPocketBaseHandlers } from "./handlers/pocketbase_handlers";
//import { registerProHandlers } from "./handlers/pro_handlers";
import { registerContextPathsHandlers } from "./handlers/context_paths_handlers";
import { registerDebugHandlers } from "./handlers/debug_handlers";
import { registerDependencyHandlers } from "./handlers/dependency_handlers";
import { registerMcpHandlers } from "./handlers/mcp_handlers";

import { registerGithubBranchHandlers } from "./handlers/git_branch_handlers";
import { registerGithubHandlers, registerCommitMessageStreamHandler } from "./handlers/github_handlers";
import { registerImportHandlers } from "./handlers/import_handlers";
import { registerLanguageModelHandlers } from "./handlers/language_model_handlers";
import { registerLocalModelHandlers } from "./handlers/local_model_handlers";
import { registerNeonHandlers } from "./handlers/neon_handlers";
import { registerNodeHandlers } from "./handlers/node_handlers";
import { registerPortalHandlers } from "./handlers/portal_handlers";
import { registerProblemsHandlers } from "./handlers/problems_handlers";
import { registerPromptHandlers } from "./handlers/prompt_handlers";
import { registerCustomAgentHandlers } from "./handlers/custom_agent_handlers";
import { registerProposalHandlers } from "./handlers/proposal_handlers";
import { registerReleaseNoteHandlers } from "./handlers/release_note_handlers";
import { registerSessionHandlers } from "./handlers/session_handlers";
import { registerSettingsHandlers } from "./handlers/settings_handlers";
import { registerShellHandlers } from "./handlers/shell_handler";
import { registerSupabaseHandlers } from "./handlers/supabase_handlers";
import { registerTemplateHandlers } from "./handlers/template_handlers";
import { registerTokenCountHandlers } from "./handlers/token_count_handlers";
import { registerUploadHandlers } from "./handlers/upload_handlers";
import { registerVercelHandlers } from "./handlers/vercel_handlers";
import { registerVersionHandlers } from "./handlers/version_handlers";
import { registerWindowHandlers } from "./handlers/window_handlers";
import { registerBackupHandlers } from "./handlers/backup_handlers";
import { registerMemoryHandlers } from "./handlers/memory_handlers";

import { registerConsoleHandlers } from "./handlers/console_handlers";
import { registerUpdateCheckerHandlers } from "./handlers/update_checker_handler";
import { registerAuthHandlers } from "./handlers/auth_handlers";
import { registerAdminHandlers } from "./handlers/admin_handlers";

import { registerOpenCodeDiagnosticHandlers } from "./handlers/opencode_diagnostic_handlers";
import { registerPreferencesHandlers } from "./handlers/preferences_handlers";
import { registerDesignHandlers } from "./handlers/design_handlers";
import { registerPlaygroundHandlers } from "./handlers/playground_handlers";
import { registerQuestionHandler, registerPermissionHandler } from "./handlers/opencode_adapter";
import { registerMarkdownShareHandlers } from "./handlers/markdown_share_handlers";
import { warmUpScaffoldCache } from "./utils/scaffold_cache";
import log from "electron-log";

export function registerIpcHandlers() {
  // Register all IPC handlers by category
  registerAuthHandlers();
  registerAdminHandlers();

  registerAppHandlers();
  registerChatHandlers();
  registerChatStreamHandlers();
  registerSettingsHandlers();
  registerShellHandlers();
  registerDependencyHandlers();
  registerMcpHandlers();
  registerGithubHandlers();
  registerCommitMessageStreamHandler();
  registerGithubBranchHandlers();
  registerVercelHandlers();
  registerNodeHandlers();
  registerProblemsHandlers();
  registerProposalHandlers();
  registerDebugHandlers();
  registerSupabaseHandlers();
  registerNeonHandlers();
  registerFirebaseHandlers();
  registerBunnyHandlers();
  registerPocketBaseHandlers();
  registerLocalModelHandlers();
  registerTokenCountHandlers();
  registerWindowHandlers();
  registerUploadHandlers();
  registerVersionHandlers();
  registerLanguageModelHandlers();
  registerReleaseNoteHandlers();
  registerImportHandlers();
  registerSessionHandlers();
  //registerProHandlers();
  registerContextPathsHandlers();
  registerCapacitorHandlers();
  registerAppEnvVarsHandlers();
  registerTemplateHandlers();
  registerPortalHandlers();
  registerPromptHandlers();
  registerCustomAgentHandlers();
  registerVisualEditingHandlers();

  registerBackupHandlers();
  registerMemoryHandlers();

  registerConsoleHandlers();
  registerUpdateCheckerHandlers();

  registerPreferencesHandlers();

  // OpenCode AI integration — diagnostic & test handlers
  registerOpenCodeDiagnosticHandlers();

  // OpenCode question tool — bridges VibesAskUser UI to SDK question.reply()
  registerQuestionHandler();

  // OpenCode permission tool — bridges VibesPermissionBanner UI to SDK permission response
  registerPermissionHandler();

  // Design system picker — getdesign CLI integration
  registerDesignHandlers();

  // Playground — model comparison tool
  registerPlaygroundHandlers();

  // Markdown share — md.mnstatic.com document upload
  registerMarkdownShareHandlers();

  // Pre-cache scaffold node_modules in background (non-blocking)
  warmUpScaffoldCache().catch(err =>
    log.error("Scaffold cache warmup failed:", err),
  );
}
