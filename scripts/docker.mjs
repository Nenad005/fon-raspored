import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [mode, ...extra] = process.argv.slice(2);
if (
  extra.length ||
  ![
    "dev",
    "prod",
    "down",
    "database",
    "migrate-prod",
    "import-dev",
    "import-prod",
  ].includes(mode)
) {
  console.error(
    "Usage: node scripts/docker.mjs dev|prod|down|database|migrate-prod|import-dev|import-prod",
  );
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

// Vercel/Neon exports this name; Prisma 5 expects DIRECT_URL.
if (!process.env.DIRECT_URL && process.env.DATABASE_URL_UNPOOLED) {
  process.env.DIRECT_URL = process.env.DATABASE_URL_UNPOOLED;
}

function ensureProxyNetwork() {
  const result = spawnSync("docker", ["network", "inspect", "dev-proxy"], {
    stdio: "ignore",
  });
  if (result.status === 0) return;
  const created = spawnSync("docker", ["network", "create", "dev-proxy"], {
    stdio: "inherit",
  });
  if (created.status !== 0) process.exit(created.status ?? 1);
}

if (mode === "database") {
  compose("compose.yaml", "up", "-d", "--no-deps", "--wait", "postgres");
} else if (mode === "down") {
  compose("compose.yaml", "down", "--remove-orphans");
} else if (mode === "migrate-prod") {
  compose(
    "compose.prod.yaml",
    "run",
    "--rm",
    "--build",
    "--no-deps",
    "db-init",
  );
} else if (mode === "import-dev" || mode === "import-prod") {
  compose(
    mode === "import-dev" ? "compose.yaml" : "compose.prod.yaml",
    "run",
    "--rm",
    "--build",
    "--no-deps",
    "db-init",
    "npm",
    "run",
    "db:import",
  );
} else {
  const development = mode === "dev";
  // Validate before stopping the running stack.
  compose(
    development ? "compose.yaml" : "compose.prod.yaml",
    "config",
    "--quiet",
  );
  ensureProxyNetwork();
  // Remove opposite-mode containers, never named database volumes.
  compose("compose.yaml", "down", "--remove-orphans");
  compose(
    development ? "compose.yaml" : "compose.prod.yaml",
    "up",
    "-d",
    "--build",
    ...(development ? ["--renew-anon-volumes"] : []),
  );
}
