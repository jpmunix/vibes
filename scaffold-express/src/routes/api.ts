import { Router } from "express";

export const router = Router();

// ── Example endpoints ──

router.get("/", (_req, res) => {
  res.json({
    message: "¡Hola mundo! Tu API está lista.",
    version: "1.0.0",
    endpoints: {
      health: "GET /health",
      api: "GET /api",
      items: "GET /api/items",
    },
  });
});

// Example: basic CRUD placeholder
const items: { id: number; name: string; createdAt: string }[] = [];
let nextId = 1;

router.get("/items", (_req, res) => {
  res.json(items);
});

router.post("/items", (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "El campo 'name' es obligatorio." });
    return;
  }

  const item = { id: nextId++, name, createdAt: new Date().toISOString() };
  items.push(item);
  res.status(201).json(item);
});

router.delete("/items/:id", (req, res) => {
  const id = Number(req.params.id);
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) {
    res.status(404).json({ error: "Item no encontrado." });
    return;
  }
  items.splice(index, 1);
  res.status(204).send();
});
