const { getRemoteDb, initializeRemoteSchema } = require('./src/db/remote');
const remoteSchema = require('./src/db/remote-schema');
const { eq } = require('drizzle-orm');

async function run() {
  await initializeRemoteSchema();
  const db = getRemoteDb();
  
  const user = await db.select().from(remoteSchema.users).where(eq(remoteSchema.users.email, 'pablo@minube.com')).limit(1);
  if (!user.length) {
    console.log('User not found');
    return;
  }
  const userId = user[0].id;
  console.log('Found user:', userId);

  const promptRows = await db.select().from(remoteSchema.prompts).where(eq(remoteSchema.prompts.userId, userId));
  console.log('Prompts count:', promptRows.length);
  if (promptRows.length > 0) {
    console.log('First prompt:', promptRows[0].systemId);
  }
}

run().catch(console.error);
