import { registerThemesHandlers } from "../pro/main/ipc/handlers/themes_handlers";
import { registerVisualEditingHandlers } from "../pro/main/ipc/handlers/visual_editing_handlers";
import { registerAppEnvVarsHandlers } from "./handlers/app_env_vars_handlers";
import { registerAppHandlers } from "./handlers/app_handlers";
import { registerAppUpgradeHandlers } from "./handlers/app_upgrade_handlers";
import { registerCapacitorHandlers } from "./handlers/capacitor_handlers";
import { registerChatHandlers } from "./handlers/chat_handlers";
import { registerChatLogsHandlers } from "./handlers/chat_logs_handlers";
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
import { registerProposalHandlers } from "./handlers/proposal_handlers";
import { registerReleaseNoteHandlers } from "./handlers/release_note_handlers";
import { registerSessionHandlers } from "./handlers/session_handlers";
import { registerSettingsHandlers } from "./handlers/settings_handlers";
import { registerShellHandlers } from "./handlers/shell_handler";
import { registerSupabaseHandlers } from "./handlers/supabase_handlers";
import { registerTemplateHandlers } from "./handlers/template_handlers";
import { registerTodoHandlers } from "./handlers/todo_handlers";
import { registerTokenCountHandlers } from "./handlers/token_count_handlers";
import { registerTokenStatsHandlers } from "./handlers/token_stats_handlers";
import { registerUploadHandlers } from "./handlers/upload_handlers";
import { registerVercelHandlers } from "./handlers/vercel_handlers";
import { registerVersionHandlers } from "./handlers/version_handlers";
import { registerWindowHandlers } from "./handlers/window_handlers";
// import { registerDebateHandlers } from "./handlers/debate_handlers";
// import { registerDebateStreamHandlers } from "./handlers/debate_stream_handlers";
import { registerBackupHandlers } from "./handlers/backup_handlers";
// Knowledge Base — REMOVED (replaced by OpenCode AGENTS.md)
import { registerAiQueryLogHandlers } from "./handlers/ai_query_log_handlers";

import { registerConsoleHandlers } from "./handlers/console_handlers";
import { registerUpdateCheckerHandlers } from "./handlers/update_checker_handler";
import { registerAuthHandlers } from "./handlers/auth_handlers";

import { registerOpenCodeDiagnosticHandlers } from "./handlers/opencode_diagnostic_handlers";
import { registerPreferencesHandlers } from "./handlers/preferences_handlers";
import { registerQuestionHandler } from "./handlers/opencode_adapter";

export function registerIpcHandlers() {
  // Register all IPC handlers by category
  registerAuthHandlers();

  registerAppHandlers();
  registerChatHandlers();
  registerTodoHandlers();
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
  registerAppUpgradeHandlers();
  registerCapacitorHandlers();
  registerAppEnvVarsHandlers();
  registerTemplateHandlers();
  registerThemesHandlers();
  registerPortalHandlers();
  registerPromptHandlers();
  registerVisualEditingHandlers();
  registerTokenStatsHandlers();
  registerChatLogsHandlers();

  // registerDebateHandlers();     // Feature hidden
  // registerDebateStreamHandlers(); // Feature hidden
  registerBackupHandlers();
  // registerKnowledgeHandlers(); // KB removed — replaced by OpenCode AGENTS.md
  registerAiQueryLogHandlers();

  registerConsoleHandlers();
  registerUpdateCheckerHandlers();

  registerPreferencesHandlers();

  // OpenCode AI integration — diagnostic & test handlers
  registerOpenCodeDiagnosticHandlers();

  // OpenCode question tool — bridges VibesAskUser UI to SDK question.reply()
  registerQuestionHandler();
}
