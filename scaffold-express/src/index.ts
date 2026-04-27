import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { router as apiRouter } from "./routes/api.js";

const app = express();
const PORT = Number(process.env.PORT) || 8080;

// ── Middleware ──
app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

// ── Routes ──
app.use("/api", apiRouter);

// ── Health check ──
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Start server ──
app.listen(PORT, "::", () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API available at http://localhost:${PORT}/api`);
});

export default app;
