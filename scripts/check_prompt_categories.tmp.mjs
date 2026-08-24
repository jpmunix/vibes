import { createClient } from "@libsql/client";
const url = "libsql://01KWFQXHYHXBKNBY6HXGZ4CK6X-vibes.lite.bunnydb.net/";
const token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.eyJwIjp7InJvIjpudWxsLCJydyI6eyJucyI6WyJ2aWJlcyJdLCJ0YWdzIjpudWxsfSwicm9hIjpudWxsLCJyd2EiOm51bGwsImRkbCI6bnVsbH0sImlhdCI6MTc4MjkzOTgzMX0.GhgK8Ck_uRUx7cl6ekpynAtoXcF0yKeJl6LtVfGBaLGHqkabHTkHX6f2uDnSc5wE9Qsd7t9QT3PqrempxcQLCg";
const client = createClient({ url, authToken: token });
const r = await client.execute("SELECT id, user_id, name, name_key, is_system FROM prompts_categories ORDER BY is_system DESC, name LIMIT 50");
console.log(JSON.stringify(r.rows, null, 2));
process.exit(0);
