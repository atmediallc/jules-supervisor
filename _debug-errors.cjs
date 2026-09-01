const fs = require("fs");
const path = require("path");
const dirs = fs.readdirSync("test-results").filter(d => d.includes("Brow"));
for (const d of dirs) {
  const f = path.join("test-results", d, "error-context.md");
  if (fs.existsSync(f)) {
    const content = fs.readFileSync(f, "utf8");
    console.log("=== " + d.slice(0, 60));
    // Print error section
    const m = content.match(/```\n([\s\S]*?)\n```/);
    if (m) console.log(m[1].slice(0, 800));
    console.log();
  }
}
