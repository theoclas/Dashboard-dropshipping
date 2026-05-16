/**
 * Respaldo SQL restaurable (estructura + datos) leyendo DATABASE_URL de back/.env
 * Uso: node scripts/dump-db.mjs [ruta-salida.sql]
 */
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backRoot = join(__dirname, "..");
const repoRoot = join(backRoot, "..");

function loadDatabaseUrl() {
  const envPath = join(backRoot, ".env");
  const raw = readFile(envPath, "utf8").then((t) => {
    const m = t.match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/m);
    if (!m) throw new Error("DATABASE_URL no encontrada en back/.env");
    return m[1].trim();
  });
  return raw;
}

function parseUrl(url) {
  const u = new URL(url.replace(/^mysql:\/\//, "http://"));
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  };
}

function escId(name) {
  return "`" + String(name).replace(/`/g, "``") + "`";
}

function escVal(v) {
  if (v === null) return "NULL";
  if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace("T", " ")}'`;
  if (Buffer.isBuffer(v)) return `X'${v.toString("hex")}'`;
  if (typeof v === "number") return String(v);
  if (typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  const s = String(v)
    .replace(/\\/g, "\\\\")
    .replace(/\0/g, "\\0")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/'/g, "\\'");
  return `'${s}'`;
}

async function tryConnect(cfg) {
  return mysql.createConnection({
    ...cfg,
    multipleStatements: false,
    charset: "utf8mb4",
  });
}

async function main() {
  let url = await loadDatabaseUrl();
  let cfg = parseUrl(url);

  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15).replace("T", "_");
  const outPath =
    process.argv[2] ||
    join(repoRoot, "backups", `fersua_dashboard_${stamp}.sql`);

  await mkdir(dirname(outPath), { recursive: true });

  let conn;
  const altPorts = [cfg.port, 3306, 3307].filter((p, i, a) => a.indexOf(p) === i);

  for (const port of altPorts) {
    try {
      conn = await tryConnect({ ...cfg, port });
      cfg = { ...cfg, port };
      console.log(`Conectado a ${cfg.host}:${port}/${cfg.database}`);
      break;
    } catch (e) {
      if (port === altPorts[altPorts.length - 1]) throw e;
    }
  }

  const out = createWriteStream(outPath, { encoding: "utf8" });
  const w = (line) => out.write(line + "\n");

  w("-- Fersua Dashboard — respaldo MySQL");
  w(`-- Generado: ${new Date().toISOString()}`);
  w(`-- Base: ${cfg.database}`);
  w("SET NAMES utf8mb4;");
  w("SET FOREIGN_KEY_CHECKS=0;");
  w(`CREATE DATABASE IF NOT EXISTS ${escId(cfg.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  w(`USE ${escId(cfg.database)};`);
  w("");

  const [tables] = await conn.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`,
    [cfg.database],
  );

  if (!tables.length) {
    await conn.end();
    out.end();
    throw new Error(`No hay tablas en ${cfg.database}. ¿Base vacía o credenciales incorrectas?`);
  }

  for (const { TABLE_NAME: table } of tables) {
    const [createRows] = await conn.query(`SHOW CREATE TABLE ${escId(table)}`);
    const createSql = createRows[0]["Create Table"];
    w(`DROP TABLE IF EXISTS ${escId(table)};`);
    w(`${createSql};`);
    w("");

    const [rows] = await conn.query(`SELECT * FROM ${escId(table)}`);
    if (rows.length === 0) continue;

    const cols = Object.keys(rows[0]).map(escId).join(", ");
    const batch = 80;
    for (let i = 0; i < rows.length; i += batch) {
      const chunk = rows.slice(i, i + batch);
      const values = chunk
        .map((row) => `(${Object.values(row).map(escVal).join(", ")})`)
        .join(",\n  ");
      w(`INSERT INTO ${escId(table)} (${cols}) VALUES\n  ${values};`);
    }
    w("");
    console.log(`  ${table}: ${rows.length} filas`);
  }

  w("SET FOREIGN_KEY_CHECKS=1;");
  await conn.end();
  await new Promise((res, rej) => out.end((err) => (err ? rej(err) : res())));

  console.log(`\nRespaldo listo: ${resolve(outPath)}`);
  console.log("Restaurar en VPS: ver scripts/restore-mysql.sh o mysql < archivo.sql");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
