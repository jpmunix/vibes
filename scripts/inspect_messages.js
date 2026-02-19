
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../userData/sqlite.db');

if (!fs.existsSync(dbPath)) {
    console.error('Database file not found at:', dbPath);
    process.exit(1);
}

const db = new Database(dbPath);

console.log('--- Latest 5 Messages ---');
const messages = db.prepare(`
  SELECT 
    id, 
    role, 
    SUBSTR(content, 1, 50) as snippet, 
    status, 
    previous_response_id,
    datetime(created_at, 'unixepoch', 'localtime') as created 
  FROM messages 
  ORDER BY id DESC 
  LIMIT 5
`).all();

console.table(messages);
db.close();
