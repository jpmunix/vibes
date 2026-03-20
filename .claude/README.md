# Claude Code Configuration

This directory contains Claude Code configuration for the Vibes project.

## Commands

Slash commands are invoked with `/vibes:<command>`. Available commands:

| Command                 | Description                                                    | Uses                                |
| ----------------------- | -------------------------------------------------------------- | ----------------------------------- |
| `/vibes:plan-to-issue`   | Convert a plan to a GitHub issue                               | -                                   |
| `/vibes:fix-issue`       | Fix a GitHub issue                                             | `pr-push`                           |
| `/vibes:pr-fix`          | Fix PR issues from CI failures or review comments              | `pr-fix:comments`, `pr-fix:actions` |
| `/vibes:pr-fix:comments` | Address unresolved PR review comments                          | `lint`, `pr-push`                   |
| `/vibes:pr-fix:actions`  | Fix failing CI checks and GitHub Actions                       | `e2e-rebase`, `pr-push`             |
| `/vibes:pr-rebase`       | Rebase the current branch                                      | `pr-push`                           |
| `/vibes:pr-push`         | Push changes and create/update a PR                            | -                                   |
| `/vibes:lint`            | Run all pre-commit checks (formatting, linting, type-checking) | -                                   |
| `/vibes:e2e-rebase`      | Rebase E2E test snapshots                                      | -                                   |
| `/vibes:deflake-e2e`     | Deflake flaky E2E tests                                        | -                                   |
| `/vibes:session-debug`   | Debug session issues                                           | -                                   |
