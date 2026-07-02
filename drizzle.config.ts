import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/remote-schema.ts",
  out: "./drizzle-remote",
  dialect: "sqlite",
  dbCredentials: {
    url: "libsql://01KWFQXHYHXBKNBY6HXGZ4CK6X-vibes.lite.bunnydb.net/",
    token:
      "eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.eyJwIjp7InJvIjpudWxsLCJydyI6eyJucyI6WyJ2aWJlcyJdLCJ0YWdzIjpudWxsfSwicm9hIjpudWxsLCJyd2EiOm51bGwsImRkbCI6bnVsbH0sImlhdCI6MTc4MjkzOTgzMX0.GhgK8Ck_uRUx7cl6ekpynAtoXcF0yKeJl6LtVfGBaLGHqkabHTkHX6f2uDnSc5wE9Qsd7t9QT3PqrempxcQLCg",
  },
} satisfies Config;
