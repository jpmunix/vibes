import * as fs from "fs";

async function main() {
  const res = await fetch("https://openrouter.ai/api/v1/models");
  const data = await res.json();
  const kimi = data.data.find((m: any) => m.id === "moonshotai/kimi-k2.7-code");
  console.log(JSON.stringify(kimi, null, 2));
}

main().catch(console.error);
