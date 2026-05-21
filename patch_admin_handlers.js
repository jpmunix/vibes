const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/ipc/handlers/admin_handlers.ts');
let content = fs.readFileSync(file, 'utf8');

// 1. Update getUserPreferences
content = content.replace(
  '        const preferences = rows.map((r) => ({\n            key: r.key,\n            value: r.value,\n            updatedAt: r.updatedAt instanceof Date\n                ? r.updatedAt.toISOString()\n                : r.updatedAt ? String(r.updatedAt) : null,\n        }));\n\n        return { preferences };',
  `        const preferences = rows.map((r) => ({
            key: r.key,
            value: r.value,
            updatedAt: r.updatedAt instanceof Date
                ? r.updatedAt.toISOString()
                : r.updatedAt ? String(r.updatedAt) : null,
        }));

        // Fetch prompts
        const promptRows = await db
            .select({
                systemId: remoteSchema.prompts.systemId,
                content: remoteSchema.prompts.content,
                updatedAt: remoteSchema.prompts.updatedAt,
            })
            .from(remoteSchema.prompts)
            .where(eq(remoteSchema.prompts.userId, input.userId));
            
        for (const pr of promptRows) {
            preferences.push({
                key: "prompt:" + pr.systemId,
                value: pr.content || "",
                updatedAt: pr.updatedAt instanceof Date
                    ? pr.updatedAt.toISOString()
                    : pr.updatedAt ? String(pr.updatedAt) : null,
            });
        }

        return { preferences };`
);

// 2. Update setUserPreference
content = content.replace(
  '        await db\n            .insert(remoteSchema.userPreferences)',
  `        if (input.key.startsWith("prompt:")) {
            const systemId = input.key.substring(7);
            await db.update(remoteSchema.prompts)
                .set({ content: input.value, updatedAt: now })
                .where(
                    and(
                        eq(remoteSchema.prompts.userId, input.userId),
                        eq(remoteSchema.prompts.systemId, systemId)
                    )
                );
            logger.info(\`Admin updated prompt: \${systemId} for user \${input.userId}\`);
            return { success: true };
        }

        await db
            .insert(remoteSchema.userPreferences)`
);

// 3. Update deleteUserPreference
content = content.replace(
  '    createTypedHandler(adminContracts.deleteUserPreference, async (_event, input, context) => {\n        assertAdmin(context);\n        await initializeRemoteSchema();\n        const db = getRemoteDb();\n\n        await db',
  `    createTypedHandler(adminContracts.deleteUserPreference, async (_event, input, context) => {
        assertAdmin(context);
        await initializeRemoteSchema();
        const db = getRemoteDb();

        if (input.key.startsWith("prompt:")) {
            const systemId = input.key.substring(7);
            await db.delete(remoteSchema.prompts)
                .where(
                    and(
                        eq(remoteSchema.prompts.userId, input.userId),
                        eq(remoteSchema.prompts.systemId, systemId)
                    )
                );
            logger.info(\`Admin deleted prompt: \${systemId} for user \${input.userId}\`);
            return { success: true };
        }

        await db`
);

fs.writeFileSync(file, content);
console.log('Patched admin_handlers.ts');
