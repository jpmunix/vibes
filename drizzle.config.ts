import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/remote-schema.ts",
  out: "./drizzle-remote",
  dialect: "sqlite",
  dbCredentials: {
    url: "libsql://01KJ783WM1SD8X465A3VPAGHG6-minube-vibes.lite.bunnydb.net/",
    token: "eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.eyJwIjp7InJvIjpudWxsLCJydyI6eyJucyI6WyJtaW51YmUtdmliZXMiXSwidGFncyI6bnVsbH0sInJvYSI6bnVsbCwicndhIjpudWxsLCJkZGwiOm51bGx9LCJpYXQiOjE3NzE5MTc0MDl9.m-5EAVWjKG0kPM72fPFpeAg25seNnUY65gtSzTJlhnD697C1mmCRoXZWkmcreHoV9vTRw22supEVIp342D_2CA"
  },
} satisfies Config;
