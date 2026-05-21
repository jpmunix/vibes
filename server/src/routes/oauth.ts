/**
 * OAuth Callback Routes — HTTP endpoints that replace Electron deep links.
 *
 * In Electron, OAuth providers redirect to `dyad://supabase-oauth-return?token=...`.
 * In web mode, they redirect to `https://vibes.example.com/api/oauth/callback/supabase?token=...`.
 *
 * These routes call the same handler functions and emit the same Socket.io events.
 */
import type { FastifyInstance } from "fastify";
import type { Server as SocketIOServer } from "socket.io";

export function registerOAuthRoutes(app: FastifyInstance, io: SocketIOServer) {
  // ─── Supabase OAuth Return ────────────────────────────────────────────────
  app.get<{
    Querystring: { token?: string; refreshToken?: string; expiresIn?: string };
  }>("/api/oauth/callback/supabase", async (request, reply) => {
    const { token, refreshToken, expiresIn } = request.query;

    if (!token || !refreshToken || !expiresIn) {
      reply.code(400).send({ error: "Missing token, refreshToken, or expiresIn" });
      return;
    }

    try {
      const { handleSupabaseOAuthReturn } = await import(
        "../../../src/supabase_admin/supabase_return_handler.ts"
      );
      await handleSupabaseOAuthReturn({
        token,
        refreshToken,
        expiresIn: Number(expiresIn),
      });

      const userId = (request as any).userId;
      if (userId) {
        io.to(userId).emit("deep-link-received", { type: "supabase-oauth-return" });
      }

      reply.redirect("/settings?oauth=supabase&status=success");
    } catch (err: any) {
      app.log.error("[OAuth/Supabase] Error:", err);
      reply.redirect("/settings?oauth=supabase&status=error");
    }
  });

  // ─── Neon OAuth Return ────────────────────────────────────────────────────
  app.get<{
    Querystring: { token?: string; refreshToken?: string; expiresIn?: string };
  }>("/api/oauth/callback/neon", async (request, reply) => {
    const { token, refreshToken, expiresIn } = request.query;

    if (!token || !refreshToken || !expiresIn) {
      reply.code(400).send({ error: "Missing parameters" });
      return;
    }

    try {
      const { handleNeonOAuthReturn } = await import(
        "../../../src/neon_admin/neon_return_handler.ts"
      );
      await handleNeonOAuthReturn({ token, refreshToken, expiresIn: Number(expiresIn) });

      const userId = (request as any).userId;
      if (userId) {
        io.to(userId).emit("deep-link-received", { type: "neon-oauth-return" });
      }

      reply.redirect("/settings?oauth=neon&status=success");
    } catch (err: any) {
      app.log.error("[OAuth/Neon] Error:", err);
      reply.redirect("/settings?oauth=neon&status=error");
    }
  });

  // ─── Firebase OAuth Return ────────────────────────────────────────────────
  app.get<{
    Querystring: { code?: string };
  }>("/api/oauth/callback/firebase", async (request, reply) => {
    const { code } = request.query;

    if (!code) {
      reply.code(400).send({ error: "Missing code parameter" });
      return;
    }

    try {
      const { handleFirebaseOAuthReturn } = await import(
        "../../../src/firebase_admin/firebase_return_handler.ts"
      );
      await handleFirebaseOAuthReturn({ code });

      const userId = (request as any).userId;
      if (userId) {
        io.to(userId).emit("deep-link-received", { type: "firebase-oauth-return" });
      }

      reply.redirect("/settings?oauth=firebase&status=success");
    } catch (err: any) {
      app.log.error("[OAuth/Firebase] Error:", err);
      reply.redirect("/settings?oauth=firebase&status=error");
    }
  });
}
