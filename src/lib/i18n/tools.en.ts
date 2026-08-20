/**
 * Tool translations — English (en).
 *
 * Source of truth for human-facing tool labels and descriptions in the shell
 * (permission pill, settings, tooltips). The runtime (vibes-core) carries no
 * localized strings (P1): it only knows tool ids, categories, risk levels and
 * schemas. Adding a new tool = add an entry here (and in tools.es.ts).
 */

import type { ToolTranslation } from "./tools.es";

export const toolTranslationsEn: Record<string, ToolTranslation> = {
  read_file: {
    label: "Read files",
    description: "Read the contents of project files",
  },
  write_file: {
    label: "Write files",
    description: "Create and overwrite project files",
  },
  edit_file: {
    label: "Edit files",
    description: "Modify existing project files",
  },
  patch: {
    label: "Apply patches",
    description: "Apply changes to multiple files atomically",
  },
  glob: {
    label: "Find files by pattern",
    description: "Find files by name or glob pattern",
  },
  grep: {
    label: "Search content",
    description: "Search text within project files",
  },
  shell: {
    label: "Terminal (bash)",
    description: "Run commands in the project terminal",
  },
  git_log: {
    label: "View git history",
    description: "List commits in the repository",
  },
  git_diff: {
    label: "View git changes",
    description: "Show uncommitted changes in the repository",
  },
  list_dir: {
    label: "List directory",
    description: "List the contents of a directory",
  },
  question: {
    label: "Ask the user",
    description: "Ask you questions when it needs more information",
  },
  todowrite: {
    label: "Task list",
    description: "Manage the agent's task list",
  },
};
