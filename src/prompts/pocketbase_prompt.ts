/**
 * System prompts for PocketBase integration (Auth, DB, Realtime, Storage)
 * Follows the same pattern as bunny_prompt.ts — credentials are injected directly.
 */

export interface PocketBasePromptConfig {
  url: string;
  adminEmail: string;
  adminPassword: string;
}

export function getPocketBaseAvailableSystemPrompt(config: PocketBasePromptConfig): string {
  return `
# PocketBase Integration Guidelines

This project uses **PocketBase** as a Backend-as-a-Service (BaaS). PocketBase integrates a SQLite database, authentication, realtime subscriptions, and file storage in a single binary.

### Connection details
- **URL**: \`${config.url}\`
- **Superuser Email**: \`${config.adminEmail}\`
- **Superuser Password**: \`${config.adminPassword}\`

## 1. Authentication & Connecting

Install the dependency if not already present:
\`\`\`bash
npm install pocketbase
\`\`\`

Create the client file at \`src/integrations/pocketbase/client.ts\` (or the most appropriate path for the project structure) with this code:

\`\`\`typescript
import PocketBase from 'pocketbase';

const pb = new PocketBase("${config.url}");

// Authenticate as superuser (for server-side/agentic tasks)
await pb.collection('_superusers').authWithPassword(
  "${config.adminEmail}",
  "${config.adminPassword}"
);

export default pb;
\`\`\`

- The SDK automatically handles token persistence and refreshing in the background.
- For agentic or server-side tasks, use **Superuser** credentials to bypass API rules.
- For client-side user authentication, use \`pb.collection('users').authWithPassword(email, password)\`.

## 2. Using the SDK
Always use the official \`pocketbase\` npm package for operations.
- **Fetch Records**: \`const records = await pb.collection('posts').getFullList({ sort: '-created' });\`
- **Filter/Search**: \`const results = await pb.collection('posts').getList(1, 50, { filter: 'status = "active"' });\`
- **Create**: \`const record = await pb.collection('posts').create({ title: 'Hello', status: 'active' });\`
- **Update**: \`const record = await pb.collection('posts').update('RECORD_ID', { title: 'New Title' });\`
- **Delete**: \`await pb.collection('posts').delete('RECORD_ID');\`

## 3. Realtime Subscriptions (SSE)
PocketBase provides seamless realtime updates using Server-Sent Events (SSE).
- Subscribe to a collection:
  \`\`\`javascript
  pb.collection('posts').subscribe('*', function (e) {
      console.log(e.action); // 'create', 'update', 'delete'
      console.log(e.record); // the updated/created record
  });
  \`\`\`
- To unsubscribe: \`pb.collection('posts').unsubscribe('*');\`

## 4. Collection Management (Schema)
**IMPORTANT (v0.23.0+):** When creating or updating collections, use the \`fields\` array. The old \`schema\` field is deprecated.
- **Example: Creating a Collection**
  \`\`\`javascript
  await pb.collections.create({
    name: 'feedback',
    type: 'base',
    fields: [
      { name: 'id', type: 'text', primaryKey: true },
      { name: 'user', type: 'text', required: true },
      { name: 'message', type: 'text' },
      { name: 'created', type: 'autodate' },
      { name: 'updated', type: 'autodate' }
    ],
    listRule: 'id = @request.auth.id', // Optional API Rules
  });
  \`\`\`

## 5. Storage & Files
PocketBase handles files as fields within a collection record.
- **Uploading Files**: Use \`FormData\` or an object with \`File\`/\`Blob\` instances.
  \`\`\`javascript
  // Create record with files
  const record = await pb.collection('example').create({
      title: 'Doc',
      'documents': [
          new File(['content 1'], 'file1.txt'),
          new File(['content 2'], 'file2.txt'),
      ]
  });
  
  // Add files to existing record (using '+' prefix)
  await pb.collection('example').update('RECORD_ID', {
      "documents+": new File(["extra content"], "file3.txt")
  });
  \`\`\`
- **Deleting Files**:
  \`\`\`javascript
  // Delete individual files (using '-' suffix)
  await pb.collection('example').update('RECORD_ID', {
      'documents-': ["file1.txt"]
  });
  // Clear all files in a field
  await pb.collection('example').update('RECORD_ID', { 'documents': [] });
  \`\`\`
- **Getting URLs**:
  \`\`\`javascript
  // Pattern: ${config.url}/api/files/COLLECTION_ID_OR_NAME/RECORD_ID/FILENAME
  const url = pb.files.getURL(record, record.documents[0], { 'thumb': '100x250' });
  \`\`\`
- **Protected Files**: Mark the field as "Protected" and use a short-lived token.
  \`\`\`javascript
  const token = await pb.files.getToken();
  const url = pb.files.getURL(record, record.secretFile, { 'token': token });
  \`\`\`

## 6. Best Practices
- Avoid raw SQL queries when interacting with PocketBase. Always use the SDK's Collection API.
- For files and storage, use the \`File\` or \`Blob\` objects within the standard record update/create calls.
- To discover collections, schema and existing files, use the \`get_pocketbase_info\` and \`get_pocketbase_storage_info\` tools!
- PocketBase storage defaults to local \`pb_data/storage\`, but supports S3-compatible backends via settings.
`.trim();
}

export const POCKETBASE_NOT_AVAILABLE_SYSTEM_PROMPT = `
If the user wants to use PocketBase, or wants a self-hosted backend-as-a-service with Auth, Database, Realtime and Storage,
tell them they can add PocketBase to their app.

The following response will show a button that allows the user to add PocketBase to their app.

<dyad-add-integration provider="pocketbase"></dyad-add-integration>
`;
