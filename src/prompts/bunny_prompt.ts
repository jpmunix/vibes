/**
 * System prompts for Bunny.net integration (Database via libSQL + Storage via BunnyStorageSDK)
 */

import type { BunnyConfig } from "@/ipc/types/bunny";

export function getBunnyAvailableSystemPrompt(config: BunnyConfig): string {
  const dbSection =
    config.databases.length > 0
      ? buildDatabasePrompt(config.databases)
      : "";
  const storageSection =
    config.storageZones.length > 0
      ? buildStoragePrompt(config.storageZones)
      : "";

  return `
# Bunny.net Instructions

The user has Bunny.net available for their app. Use it for database and/or storage needs as configured below.

${dbSection}
${storageSection}
`.trim();
}

// ---------------------------------------------------------------------------
// Database prompt (libSQL / @libsql/client)
// ---------------------------------------------------------------------------

function buildDatabasePrompt(
  databases: BunnyConfig["databases"],
): string {
  const dbEntries = databases
    .map(
      (db) => `
- **${db.name}**
  - URL: \`${db.databaseUrl}\`
  - Full-access token: \`${db.fullAccessToken}\`${db.readOnlyToken ? `\n  - Read-only token: \`${db.readOnlyToken}\`` : ""}`,
    )
    .join("\n");

  return `
## Bunny Database (libSQL)

### Available databases
${dbEntries}

### Client Setup

Install the dependency if not already present:
\`\`\`bash
npm install @libsql/client
\`\`\`

Create the client file at \`src/integrations/bunny/db.ts\` (or the most appropriate path for the project structure) with this code:

\`\`\`typescript
import { createClient } from "@libsql/client/web";

const client = createClient({
  url: "${databases[0].databaseUrl}",
  authToken: "${databases[0].fullAccessToken}",
});

export default client;
\`\`\`

### Executing queries

Use \`client.execute()\` for all SQL operations:

\`\`\`typescript
// Simple query
const result = await client.execute("SELECT * FROM users");

// With positional placeholders
const user = await client.execute({
  sql: "SELECT * FROM users WHERE id = ?",
  args: [1],
});

// With named placeholders
const user2 = await client.execute({
  sql: "SELECT * FROM users WHERE email = :email",
  args: { email: "user@example.com" },
});

// Insert
await client.execute({
  sql: "INSERT INTO users (name, email) VALUES (?, ?)",
  args: ["John", "john@example.com"],
});

// Create table
await client.execute(\`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
\`);
\`\`\`

### Important notes
- Bunny Database uses **libSQL** (SQLite-compatible dialect). Use SQLite syntax for queries.
- The \`execute()\` method returns \`{ rows, columns, rowsAffected, lastInsertRowid }\`.
- For frontend apps, always import from \`@libsql/client/web\` (not \`@libsql/client\`).
- Always use parameterized queries (\`?\` or \`:name\`) to prevent SQL injection.

### Quick access via bash (for inspecting schema & debugging)
Environment variables are available: \`BUNNY_DB_URL\`, \`BUNNY_DB_TOKEN\`.
Use these in bash to inspect the database before writing code:
\`\`\`bash
# List all tables
curl -s -X POST "$BUNNY_DB_URL" -H "Authorization: Bearer $BUNNY_DB_TOKEN" -H "Content-Type: application/json" -d '{"statements":["SELECT name FROM sqlite_master WHERE type=\\"table\\""]}' | jq .

# Describe a table
curl -s -X POST "$BUNNY_DB_URL" -H "Authorization: Bearer $BUNNY_DB_TOKEN" -H "Content-Type: application/json" -d '{"statements":["PRAGMA table_info(TABLE_NAME)"]}' | jq .

# Quick query
curl -s -X POST "$BUNNY_DB_URL" -H "Authorization: Bearer $BUNNY_DB_TOKEN" -H "Content-Type: application/json" -d '{"statements":["SELECT * FROM TABLE_NAME LIMIT 5"]}' | jq .
\`\`\`
**Always inspect the schema before writing integration code.**
`;
}

// ---------------------------------------------------------------------------
// Storage prompt (@bunny.net/storage-sdk)
// ---------------------------------------------------------------------------

function buildStoragePrompt(
  storageZones: BunnyConfig["storageZones"],
): string {
  const szEntries = storageZones
    .map(
      (sz) => `
- **${sz.name}**
  - Hostname: \`${sz.hostname}\`
  - Username: \`${sz.username}\`
  - Password: \`${sz.password}\`${sz.readonlyPassword ? `\n  - Read-only password: \`${sz.readonlyPassword}\`` : ""}`,
    )
    .join("\n");

  return `
## Bunny Storage

### Available storage zones
${szEntries}

### Server-side Setup (Node.js)

Install the dependency if not already present:
\`\`\`bash
npm install @bunny.net/storage-sdk
\`\`\`

Create the client file at \`src/integrations/bunny/storage.ts\` (or the most appropriate path) with:

\`\`\`typescript
import * as BunnyStorageSDK from "@bunny.net/storage-sdk";

const storageClient = BunnyStorageSDK.file;

// Configure the SDK
BunnyStorageSDK.setConfig({
  storageZone: "${storageZones[0].username}",
  accessKey: "${storageZones[0].password}",
  endpoint: "${storageZones[0].hostname}",
});

export default storageClient;
\`\`\`

### File operations

\`\`\`typescript
// List files in a directory
const files = await BunnyStorageSDK.file.list(storageZone, "/path/to/dir/");

// Upload a file
await BunnyStorageSDK.file.upload(
  storageZone,
  "/path/to/file.jpg",
  fileStream,
  {
    contentType: "image/jpeg",
  }
);

// Download a file
const { stream, response, length } = await BunnyStorageSDK.file.download(
  storageZone,
  "/path/to/file.jpg",
);

// Get file metadata
const fileInfo = await BunnyStorageSDK.file.get(
  storageZone,
  "/path/to/file.jpg",
);
// fileInfo: { Guid, ObjectName, Path, Length, ContentType, DateCreated, LastChanged, ... }

// Delete a file
await BunnyStorageSDK.file.delete(storageZone, "/path/to/file.jpg");

// Delete a directory
await BunnyStorageSDK.file.removeDirectory(storageZone, "/path/to/dir/");
\`\`\`

### Important notes
- The Storage SDK is a **server-side** library (Node.js). For browser apps, create an API route or edge function that proxies storage operations.
- File paths are relative to the storage zone root.
- The \`file.list()\` response includes metadata: \`Guid\`, \`ObjectName\`, \`Path\`, \`Length\`, \`ContentType\`, \`DateCreated\`, \`LastChanged\`, \`Checksum\`, \`IsDirectory\`, \`ReplicationRegions\`.

### Quick access via bash (for listing files & debugging)
Environment variables are available: \`BUNNY_STORAGE_HOSTNAME\`, \`BUNNY_STORAGE_USERNAME\`, \`BUNNY_STORAGE_PASSWORD\`.
\`\`\`bash
# List files in root
curl -s "https://$BUNNY_STORAGE_HOSTNAME/$BUNNY_STORAGE_USERNAME/" -H "AccessKey: $BUNNY_STORAGE_PASSWORD" | jq .

# List files in a subdirectory
curl -s "https://$BUNNY_STORAGE_HOSTNAME/$BUNNY_STORAGE_USERNAME/images/" -H "AccessKey: $BUNNY_STORAGE_PASSWORD" | jq .
\`\`\`
`;
}

// ---------------------------------------------------------------------------
// Not-available prompt (suggests integration)
// ---------------------------------------------------------------------------

export const BUNNY_NOT_AVAILABLE_SYSTEM_PROMPT = `
If the user wants to use Bunny.net, or wants a database or file storage solution and Supabase is not available,
tell them they can add Bunny.net to their app.

The following response will show a button that allows the user to add Bunny.net to their app.

<vibes-add-integration provider="bunny"></vibes-add-integration>

# Examples

## Example 1: User wants to use Bunny.net

### User prompt

I want to use Bunny.net in my app.

### Assistant response

You need to first add Bunny.net to your app.

<vibes-add-integration provider="bunny"></vibes-add-integration>

## Example 2: User wants file storage

### User prompt

I need to upload and store files in my app.

### Assistant response

You can use Bunny.net Storage for file hosting. Let's add it to your app first.

<vibes-add-integration provider="bunny"></vibes-add-integration>
`;
