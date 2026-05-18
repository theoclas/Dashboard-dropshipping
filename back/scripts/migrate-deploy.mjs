/**
 * Aplica migraciones pendientes en producción / VPS.
 * Si `0_init` quedó marcada como fallida pero la base ya existía, la marca como aplicada y reintenta.
 *
 * Uso (desde back/): npm run prisma:migrate:deploy
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backRoot = join(__dirname, "..");

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: backRoot,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout?.on("data", (d) => {
      const s = d.toString();
      out += s;
      process.stdout.write(s);
    });
    child.stderr?.on("data", (d) => {
      const s = d.toString();
      out += s;
      process.stderr.write(s);
    });
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

async function migrateDeploy() {
  return run("npx", ["prisma", "migrate", "deploy"]);
}

async function migrateResolve(name) {
  const { code } = await run("npx", ["prisma", "migrate", "resolve", "--applied", name]);
  return code;
}

async function main() {
  console.log("→ prisma migrate deploy\n");
  let { code, out } = await migrateDeploy();
  if (code === 0) {
    console.log("\n✓ Migraciones aplicadas.");
    return;
  }

  const p3009 = out.includes("P3009") || out.includes("failed migrations");
  const initFailed = out.includes("0_init");
  if (!p3009 || !initFailed) {
    process.exit(code);
  }

  console.log(
    "\n⚠ 0_init consta como fallida (base creada antes de migrate). Marcándola como aplicada…\n",
  );
  const resolveCode = await migrateResolve("0_init");
  if (resolveCode !== 0) {
    process.exit(resolveCode);
  }

  console.log("\n→ Reintentando migrate deploy…\n");
  ({ code } = await migrateDeploy());
  if (code !== 0) {
    process.exit(code);
  }
  console.log("\n✓ Migraciones aplicadas.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
