import { getRemoteDb } from "../src/db/remote";
import * as remoteSchema from "../src/db/remote-schema";
import { eq } from "drizzle-orm";

async function test() {
  const db = getRemoteDb();
  // list categories
  const cats = await db.select().from(remoteSchema.promptsCategories);
  console.log("Categories:", cats.length);
  const prmpts = await db.select().from(remoteSchema.prompts);
  console.log("Prompts:", prmpts.length);
  
  if (cats.length > 0) {
      console.log("First Category:", cats[0]);
  }
  if (prmpts.length > 0) {
      console.log("First Prompt:", {
          id: prmpts[0].id,
          userId: prmpts[0].userId,
          categoryId: prmpts[0].categoryId,
          systemId: prmpts[0].systemId,
          title: prmpts[0].title
      });
  }
}
test().catch(console.error);
