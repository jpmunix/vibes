/**
 * Webhook Routes — GitHub auto-deploy on push to main.
 *
 * POST /api/webhooks/github-deploy
 *   → Verifies GitHub signature, triggers deploy script.
 */
import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";
const DEPLOY_SCRIPT = process.env.DEPLOY_SCRIPT || "/data/vibes/scripts/deploy.sh";

function verifyGitHubSignature(
  payload: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!secret || !signature) return false;
  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function registerWebhookRoutes(app: FastifyInstance) {
  app.post("/api/webhooks/github-deploy", {
    config: {
      rawBody: true,
    },
    handler: async (request, reply) => {
      if (!WEBHOOK_SECRET) {
        reply.code(503).send({ error: "Webhook secret not configured" });
        return;
      }

      const signature = request.headers["x-hub-signature-256"] as string | undefined;
      const rawBody = JSON.stringify(request.body);

      if (!verifyGitHubSignature(rawBody, signature, WEBHOOK_SECRET)) {
        reply.code(403).send({ error: "Invalid signature" });
        return;
      }

      const body = request.body as any;
      if (body.ref !== "refs/heads/main") {
        reply.send({ skipped: true, reason: "Not main branch" });
        return;
      }

      app.log.info(`[Deploy] Triggered by push to main: ${body.head_commit?.message || "unknown"}`);

      // Fire-and-forget: run deploy script
      const child = spawn("bash", [DEPLOY_SCRIPT], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();

      reply.send({ deploying: true, commit: body.head_commit?.id });
    },
  });
}
