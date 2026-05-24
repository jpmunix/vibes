import { getRemoteDb } from "../src/db/remote";
import * as remoteSchema from "../src/db/remote-schema";
import { eq } from "drizzle-orm";

async function checkSettings() {
  const db = getRemoteDb();
  const allUsers = await db.select().from(remoteSchema.users);
  
  for (const user of allUsers) {
    const [userSettingRow] = await db
      .select()
      .from(remoteSchema.userSettings)
      .where(eq(remoteSchema.userSettings.userId, user.id));
      
    if (userSettingRow) {
      console.log(`User: ${user.email} (${user.id})`);
      const settings = JSON.parse(userSettingRow.settingsJson);
      console.log("  customPrompts:", settings.customPrompts);
    }
  }
}

checkSettings().catch(console.error);
