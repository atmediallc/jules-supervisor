import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env["DATABASE_URL"] ||
      "postgresql://jules_user:jules_password@127.0.0.1:5439/jules_supervisor?sslmode=disable",
  },
});
