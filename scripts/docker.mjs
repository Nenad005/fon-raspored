import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [mode, ...extra] = process.argv.slice(2);
if (extra.length || !["dev", "prod", "down", "database"].includes(mode)) {
  console.error("Usage: node scripts/docker.mjs dev|prod|down|database");
  process.exit(1);
}

function compose(file, ...args) {
  const result = spawnSync("docker", ["compose", "-f", file, ...args], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    stdio: "inherit",
  });
  if (result.error) {
    console.error(
      "Unable to run Docker Compose. Check that Docker is installed and running.",
    );
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (mode === "database") {
  compose("compose.yaml", "up", "-d", "--no-deps", "--wait", "postgres");
} else if (mode === "down") {
  compose("compose.yaml", "down", "--remove-orphans");
  compose("compose.prod.yaml", "down", "--remove-orphans");
} else {
  const development = mode === "dev";
  // Remove opposite-mode containers, never named database volumes.
  compose(
    development ? "compose.prod.yaml" : "compose.yaml",
    "down",
    "--remove-orphans",
  );
  compose(
    development ? "compose.yaml" : "compose.prod.yaml",
    "up",
    "-d",
    "--build",
    ...(development ? ["--renew-anon-volumes"] : []),
  );
}
