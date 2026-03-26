import { getRemoteDb } from "../../db/remote";
import { messages } from "../../db/remote-schema";
import { eq } from "drizzle-orm";
import { Message } from "@/ipc/types";
import { exec } from "node:child_process";
import { promisify } from "node:util";

export const execPromise = promisify(exec);

export async function executeAddDependency({
  packages,
  message,
  appPath,
}: {
  packages: string[];
  message: Message;
  appPath: string;
}) {
  const packageStr = packages.join(" ");

  const { stdout, stderr } = await execPromise(
    `npm install --legacy-peer-deps ${packageStr}`,
    {
      cwd: appPath,
    },
  );
  const installResults = stdout + (stderr ? `\n${stderr}` : "");

  // Update the message content with the installation results
  const updatedContent = message.content.replace(
    new RegExp(
      `<vibes-add-dependency packages="${packages.join(" ")}">[^<]*</vibes-add-dependency>`,
      "g",
    ),
    `<vibes-add-dependency packages="${packages.join(" ")}">${installResults}</vibes-add-dependency>`,
  );

  // Save the updated message back to the database
  await getRemoteDb()
    .update(messages)
    .set({ content: updatedContent })
    .where(eq(messages.id, message.id));
}
