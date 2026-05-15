import "dotenv/config";
import express from "express";
import type { RequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import * as XLSX from "xlsx";
import { z } from "zod";
import { Prisma, Role, type Order } from "@prisma/client";
import { prisma } from "./prisma";
import { authRequired, companyRequired, requireRoles } from "./middleware";
import type { JwtPayload } from "./types";
import { mergeOperatorPermissions } from "./operatorPermissions";
import { registerBusinessModules } from "./registerBusinessModules";
import { importProductosExcel } from "./importProductosExcel";
import { importPedidosExcel } from "./importPedidosExcel";
import { importCarteraExcel } from "./importCarteraExcel";
import { importMapeoEstadosExcel } from "./importMapeoEstadosExcel";
import { importCpaExcel } from "./importCpaExcel";
import { remapearPedidos } from "./remapearPedidos";
import { wipeCpaForCompany, wipeImportedForCompany } from "./wipeImported";
import {
  buildOrderOrderBy,
  buildPrismaOrderWhere,
  narrowOrderIdsByCastFilters,
  orderExportBodySchema,
  flattenParams,
  orderListQuerySchema,
} from "./orderListFilters";
import {
  queryCiudadesComparativa,
  queryComparativaGeografica,
  queryEfectividadTransportadoras,
} from "./reportesLogistica";
import { getDashboardMetrics } from "./dashboardMetrics";
import { createCpaRecord, deleteCpaRecord, updateCpaRecord } from "./cpaRecordService";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const JWT_SECRET = process.env.JWT_SECRET ?? "change_me";
const PORT = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

const usernameSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/, "Solo letras, números, punto, guion y guion bajo.");

const registerSchema = z.object({
  username: usernameSchema,
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  companyName: z.string().min(2),
  companySlug: z.string().min(2),
});

app.post("/api/auth/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Payload inválido.", errors: parsed.error.flatten() });
  }
  const { email, password, fullName, companyName, companySlug } = parsed.data;
  const username = normalizeUsername(parsed.data.username);

  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    return res.status(409).json({ message: "El email ya existe." });
  }

  const existingUsername = await prisma.user.findUnique({ where: { username } });
  if (existingUsername) {
    return res.status(409).json({ message: "El nombre de usuario ya existe." });
  }

  const companyExists = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (companyExists) {
    return res.status(409).json({ message: "El slug de empresa ya existe." });
  }

  const hash = await bcrypt.hash(password, 10);
  const result = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: { name: companyName, slug: companySlug },
    });

    const user = await tx.user.create({
      data: { username, email, passwordHash: hash, fullName, activeCompany: company.id },
    });

    await tx.userCompany.create({
      data: { userId: user.id, companyId: company.id, role: Role.ADMIN },
    });

    return { user, company };
  });

  return res.status(201).json({
    user: {
      id: result.user.id,
      username: result.user.username,
      email: result.user.email,
      fullName: result.user.fullName,
    },
    company: result.company,
  });
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(8),
  companyId: z.string().min(1).optional(),
});

app.post("/api/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Credenciales inválidas." });
  }

  const { password, companyId } = parsed.data;
  const username = normalizeUsername(parsed.data.username);

  const user = await prisma.user.findUnique({
    where: { username },
    include: { memberships: { include: { company: true } } },
  });

  if (!user) return res.status(401).json({ message: "Credenciales inválidas." });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Credenciales inválidas." });

  const selectedMembership =
    user.memberships.find((m) => m.companyId === companyId) ??
    user.memberships.find((m) => m.companyId === user.activeCompany) ??
    user.memberships[0];

  if (!selectedMembership) {
    return res.status(403).json({ message: "Usuario sin empresas asignadas." });
  }

  const payload: JwtPayload = {
    userId: user.id,
    username: user.username ?? username,
    email: user.email,
    companyId: selectedMembership.companyId,
    role: selectedMembership.role,
  };
  if (selectedMembership.role !== Role.ADMIN) {
    payload.operatorPerms = mergeOperatorPermissions(
      selectedMembership.role,
      selectedMembership.operatorPermissions,
    );
  }

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
  return res.json({
    accessToken: token,
    user: {
      id: user.id,
      username: user.username ?? username,
      email: user.email,
      fullName: user.fullName,
      role: selectedMembership.role,
      activeCompany: selectedMembership.companyId,
      companies: user.memberships.map((m) => ({
        companyId: m.companyId,
        name: m.company.name,
        role: m.role,
      })),
    },
  });
});

app.get("/api/auth/me", authRequired, async (req, res) => {
  const userPayload = (req as express.Request & { user?: JwtPayload }).user;
  const user = await prisma.user.findUnique({
    where: { id: userPayload?.userId },
    include: { memberships: { include: { company: true } } },
  });
  if (!user) return res.status(404).json({ message: "Usuario no encontrado." });
  const membership = user.memberships.find((m) => m.companyId === userPayload?.companyId);
  const operatorPerms =
    membership && membership.role !== Role.ADMIN
      ? mergeOperatorPermissions(membership.role, membership.operatorPermissions)
      : null;
  const companySettings = await prisma.company.findUnique({
    where: { id: userPayload!.companyId },
    select: { name: true, slug: true, operationalExpenseEnabled: true },
  });
  return res.json({
    id: user.id,
    username: user.username ?? "",
    email: user.email,
    fullName: user.fullName,
    activeCompany: userPayload?.companyId,
    role: userPayload?.role,
    operatorPerms,
    companySettings,
    companies: user.memberships.map((m) => ({
      companyId: m.companyId,
      name: m.company.name,
      role: m.role,
      isActive: m.company.isActive,
    })),
  });
});

const switchCompanySchema = z.object({ companyId: z.string().min(1) });

app.post("/api/auth/switch-company", authRequired, async (req, res) => {
  const existing = (req as express.Request & { user?: JwtPayload }).user!;
  const parsed = switchCompanySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "companyId inválido." });
  }
  const membership = await prisma.userCompany.findUnique({
    where: {
      userId_companyId: { userId: existing.userId, companyId: parsed.data.companyId },
    },
  });
  if (!membership) {
    return res.status(403).json({ message: "No perteneces a esa empresa." });
  }
  await prisma.user.update({
    where: { id: existing.userId },
    data: { activeCompany: membership.companyId },
  });
  const dbUser = await prisma.user.findUnique({ where: { id: existing.userId } });
  if (!dbUser) {
    return res.status(404).json({ message: "Usuario no encontrado." });
  }
  const payload: JwtPayload = {
    userId: existing.userId,
    username: dbUser.username ?? normalizeUsername(dbUser.email.split("@")[0] ?? ""),
    email: dbUser.email,
    companyId: membership.companyId,
    role: membership.role,
  };
  if (membership.role !== Role.ADMIN) {
    payload.operatorPerms = mergeOperatorPermissions(membership.role, membership.operatorPermissions);
  }
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
  return res.json({ accessToken, companyId: membership.companyId, role: membership.role });
});

app.get("/api/companies", authRequired, async (_req, res) => {
  const companies = await prisma.company.findMany({ orderBy: { createdAt: "desc" } });
  return res.json(companies);
});

app.post("/api/companies", authRequired, requireRoles([Role.ADMIN]), async (req, res) => {
  const schema = z.object({ name: z.string().min(2), slug: z.string().min(2) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
  const company = await prisma.company.create({ data: parsed.data });
  return res.status(201).json(company);
});

app.post("/api/companies/:companyId/users", authRequired, requireRoles([Role.ADMIN]), async (req, res) => {
  const companyId = String(req.params.companyId);
  const schema = z
    .object({
      email: z.string().email().optional(),
      username: z.string().min(2).optional(),
      role: z.nativeEnum(Role),
    })
    .refine((b) => Boolean(b.email) || Boolean(b.username), {
      message: "Indica email o nombre de usuario.",
    });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
  const { email, username: usernameRaw, role } = parsed.data;
  const user = email
    ? await prisma.user.findUnique({ where: { email } })
    : await prisma.user.findUnique({ where: { username: normalizeUsername(usernameRaw!) } });
  if (!user) return res.status(404).json({ message: "Usuario no encontrado." });
  const membership = await prisma.userCompany.upsert({
    where: { userId_companyId: { userId: user.id, companyId } },
    update: { role },
    create: { userId: user.id, companyId, role },
  });
  return res.json(membership);
});

const createCompanyUserSchema = z.object({
  username: usernameSchema,
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  role: z.nativeEnum(Role),
});

/** Crea una cuenta nueva y la vincula a la empresa (solo ADMIN). */
app.post("/api/companies/:companyId/users/create", authRequired, requireRoles([Role.ADMIN]), async (req, res) => {
  const companyId = String(req.params.companyId);
  const parsed = createCompanyUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Payload inválido.", errors: parsed.error.flatten() });
  }
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    return res.status(404).json({ message: "Empresa no encontrada." });
  }

  const username = normalizeUsername(parsed.data.username);
  const { email, fullName, role } = parsed.data;

  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    return res.status(409).json({ message: "El email ya existe." });
  }
  const existingUsername = await prisma.user.findUnique({ where: { username } });
  if (existingUsername) {
    return res.status(409).json({ message: "El nombre de usuario ya existe." });
  }

  const hash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        username,
        email,
        passwordHash: hash,
        fullName,
        activeCompany: companyId,
      },
    });
    await tx.userCompany.create({
      data: { userId: u.id, companyId, role },
    });
    return u;
  });

  return res.status(201).json({
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role,
    companyId,
  });
});

function serializeOrder(o: Order) {
  const row = o as Order & { notasManuales?: string | null };
  return {
    id: o.id,
    id_dropi: o.externalOrderId,
    fecha: o.fecha?.toISOString() ?? null,
    cliente: o.cliente,
    transportadora: o.transportadora,
    estado_operativo: o.estadoOperativo,
    guia: o.guia,
    departamento: o.departamento,
    ciudad: o.ciudad,
    direccion: o.direccion,
    telefono: o.telefono,
    notas: o.notas,
    notas_manuales: row.notasManuales ?? null,
    venta: o.venta != null ? Number(o.venta) : null,
    ganancia_calc: o.gananciaCalc != null ? Number(o.gananciaCalc) : null,
    flete: o.flete != null ? Number(o.flete) : null,
    costo_devolucion_estimado: o.costoDevolucionEstimado != null ? Number(o.costoDevolucionEstimado) : null,
    costo_proveedor: o.costoProveedor != null ? Number(o.costoProveedor) : null,
    cartera: o.cartera != null ? Number(o.cartera) : null,
    cartera_aplicada: o.carteraAplicada != null ? Number(o.carteraAplicada) : null,
    estado_cartera: o.estadoCartera,
    estado_unificado: o.estadoUnificado,
    estatus_original: o.estatusOriginal,
    ultimo_mov: o.ultimoMov,
    fecha_ult_mov: o.fechaUltMov?.toISOString() ?? null,
    dias_desde_ult_mov: o.diasDesdeUltMov,
    created_at: o.createdAt.toISOString(),
    updated_at: o.updatedAt.toISOString(),
  };
}

app.get("/api/orders", authRequired, companyRequired, async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  try {
    const parsed = orderListQuerySchema.safeParse(flattenParams(req.query as Record<string, unknown>));
    if (!parsed.success) {
      console.warn("[GET /api/orders] query inválida", parsed.error.flatten());
      return res.status(400).json({ message: "Parámetros inválidos." });
    }
    const f = parsed.data;
    const skip = (f.page - 1) * f.limit;

    const narrowed = await narrowOrderIdsByCastFilters(prisma, user.companyId, f);
    if (narrowed && narrowed.length === 0) {
      return res.json({ data: [], total: 0, page: f.page, limit: f.limit });
    }

    const where = buildPrismaOrderWhere(user.companyId, f, narrowed);
    const orderBy = buildOrderOrderBy(f);

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy,
        skip,
        take: f.limit,
      }),
      prisma.order.count({ where }),
    ]);

    return res.json({
      data: orders.map(serializeOrder),
      total,
      page: f.page,
      limit: f.limit,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/orders]", err);
    return res.status(500).json({ message: msg });
  }
});

app.patch("/api/orders/:id", authRequired, companyRequired, async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  if (user.role === Role.LECTOR) {
    return res.status(403).json({ message: "No autorizado." });
  }
  const id = String(req.params.id);
  const schema = z
    .object({
      cliente: z.string().nullable().optional(),
      notas: z.string().nullable().optional(),
      notas_manuales: z.string().nullable().optional(),
      telefono: z.string().nullable().optional(),
      direccion: z.string().nullable().optional(),
      ciudad: z.string().nullable().optional(),
      departamento: z.string().nullable().optional(),
      transportadora: z.string().nullable().optional(),
      guia: z.string().nullable().optional(),
      estado_operativo: z.string().nullable().optional(),
      estado_unificado: z.string().nullable().optional(),
      estado_cartera: z.string().nullable().optional(),
    })
    .partial();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
  const existing = await prisma.order.findFirst({ where: { id, companyId: user.companyId } });
  if (!existing) return res.status(404).json({ message: "No encontrado." });
  const d = parsed.data;
  const data: Record<string, unknown> = {};
  if (d.cliente !== undefined) data.cliente = d.cliente;
  if (d.notas !== undefined) data.notas = d.notas;
  if (d.notas_manuales !== undefined) data.notasManuales = d.notas_manuales;
  if (d.telefono !== undefined) data.telefono = d.telefono;
  if (d.direccion !== undefined) data.direccion = d.direccion;
  if (d.ciudad !== undefined) data.ciudad = d.ciudad;
  if (d.departamento !== undefined) data.departamento = d.departamento;
  if (d.transportadora !== undefined) data.transportadora = d.transportadora;
  if (d.guia !== undefined) data.guia = d.guia;
  if (d.estado_operativo !== undefined) data.estadoOperativo = d.estado_operativo;
  if (d.estado_unificado !== undefined) data.estadoUnificado = d.estado_unificado;
  if (d.estado_cartera !== undefined) data.estadoCartera = d.estado_cartera;
  const updated = await prisma.order.update({
    where: { id },
    data: data as Prisma.OrderUpdateInput,
  });
  return res.json(serializeOrder(updated));
});

app.get("/api/product-details", authRequired, companyRequired, async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  const pedidoIdDropi = String(req.query.pedidoIdDropi ?? "").trim();
  if (!pedidoIdDropi) {
    return res.status(400).json({ message: "Parámetro pedidoIdDropi requerido." });
  }
  const rows = await prisma.productDetail.findMany({
    where: { companyId: user.companyId, pedidoIdDropi: pedidoIdDropi },
    orderBy: { id: "asc" },
  });
  return res.json(
    rows.map((r) => ({
      id: r.id,
      pedido_id_dropi: r.pedidoIdDropi,
      producto_nombre: r.productoNombre,
      sku: r.sku,
      variacion: r.variacion,
      cantidad: r.cantidad,
      precio_proveedor: r.precioProveedor != null ? Number(r.precioProveedor) : null,
    })),
  );
});

app.post("/api/orders", authRequired, companyRequired, async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  const schema = z.object({
    externalOrderId: z.string().min(1),
    cliente: z.string().optional(),
    ciudad: z.string().optional(),
    estadoOperativo: z.string().optional(),
    venta: z.number().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
  const { externalOrderId, cliente, ciudad, estadoOperativo, venta } = parsed.data;
  const order = await prisma.order.upsert({
    where: {
      companyId_externalOrderId: {
        companyId: user.companyId,
        externalOrderId,
      },
    },
    update: {
      cliente: cliente ?? null,
      ciudad: ciudad ?? null,
      estadoOperativo: estadoOperativo ?? null,
      venta: venta !== undefined ? new Prisma.Decimal(String(venta)) : null,
    },
    create: {
      companyId: user.companyId,
      externalOrderId,
      cliente: cliente ?? null,
      ciudad: ciudad ?? null,
      estadoOperativo: estadoOperativo ?? null,
      venta: venta !== undefined ? new Prisma.Decimal(String(venta)) : null,
    },
  });
  return res.status(201).json(order);
});

const importExcelMiddleware: RequestHandler[] = [
  authRequired,
  companyRequired,
  requireRoles([Role.ADMIN, Role.OPERADOR]),
  upload.single("file"),
];

async function importPedidosHandler(req: express.Request, res: express.Response) {
  if (!req.file) {
    return res.status(400).json({ message: "Se requiere un archivo Excel (.xlsx)" });
  }
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  try {
    const result = await importPedidosExcel(prisma, user.companyId, req.file.buffer);
    return res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Sheet1")) {
      return res.status(400).json({ message: msg });
    }
    return res.status(500).json({ message: msg });
  }
}

async function importCarteraHandler(req: express.Request, res: express.Response) {
  if (!req.file) {
    return res.status(400).json({ message: "Se requiere un archivo Excel (.xlsx)" });
  }
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  try {
    const result = await importCarteraExcel(prisma, user.companyId, req.file.buffer);
    return res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("HISTORIAL DE CARTERA")) {
      return res.status(400).json({ message: msg });
    }
    return res.status(500).json({ message: msg });
  }
}

app.post("/api/import/pedidos", ...importExcelMiddleware, importPedidosHandler);
app.post("/api/import/pedidos/", ...importExcelMiddleware, importPedidosHandler);
app.post("/api/import/cartera", ...importExcelMiddleware, importCarteraHandler);
app.post("/api/import/cartera/", ...importExcelMiddleware, importCarteraHandler);

async function importProductosHandler(req: express.Request, res: express.Response) {
  if (!req.file) {
    return res.status(400).json({ message: "Se requiere un archivo Excel (.xlsx)" });
  }
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  try {
    const result = await importProductosExcel(prisma, user.companyId, req.file.buffer);
    return res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Sheet1")) {
      return res.status(400).json({ message: msg });
    }
    return res.status(500).json({ message: msg });
  }
}

app.post("/api/import/productos", ...importExcelMiddleware, importProductosHandler);
app.post("/api/import/productos/", ...importExcelMiddleware, importProductosHandler);

async function importMapeoHandler(req: express.Request, res: express.Response) {
  if (!req.file) {
    return res.status(400).json({ message: "Se requiere un archivo Excel (.xlsx)" });
  }
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  try {
    const result = await importMapeoEstadosExcel(prisma, user.companyId, req.file.buffer);
    return res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ message: msg });
  }
}

async function importCpaHandler(req: express.Request, res: express.Response) {
  if (!req.file) {
    return res.status(400).json({ message: "Se requiere un archivo Excel (.xlsx)" });
  }
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  try {
    const result = await importCpaExcel(prisma, user.companyId, req.file.buffer);
    return res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ message: msg });
  }
}

app.post("/api/import/mapeo-estados", ...importExcelMiddleware, importMapeoHandler);
app.post("/api/import/mapeo-estados/", ...importExcelMiddleware, importMapeoHandler);
app.post("/api/import/cpa", ...importExcelMiddleware, importCpaHandler);
app.post("/api/import/cpa/", ...importExcelMiddleware, importCpaHandler);

app.get("/api/mapeo-estados", authRequired, companyRequired, async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  const rows = await prisma.mapeoEstado.findMany({
    where: { companyId: user.companyId },
    orderBy: { updatedAt: "desc" },
  });
  return res.json(rows);
});

app.post("/api/mapeo-estados", authRequired, companyRequired, requireRoles([Role.ADMIN, Role.OPERADOR]), async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  const schema = z.object({
    transportadora: z.string().optional(),
    estatusOriginal: z.string().min(1),
    ultimoMovimiento: z.string().optional(),
    estadoUnificado: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
  const d = parsed.data;
  const row = await prisma.mapeoEstado.upsert({
    where: {
      companyId_transportadora_estatusOriginal_ultimoMovimiento: {
        companyId: user.companyId,
        transportadora: d.transportadora ?? "",
        estatusOriginal: d.estatusOriginal,
        ultimoMovimiento: d.ultimoMovimiento ?? "",
      },
    },
    update: { estadoUnificado: d.estadoUnificado },
    create: {
      companyId: user.companyId,
      transportadora: d.transportadora ?? "",
      estatusOriginal: d.estatusOriginal,
      ultimoMovimiento: d.ultimoMovimiento ?? "",
      estadoUnificado: d.estadoUnificado,
    },
  });
  return res.status(201).json(row);
});

app.patch("/api/mapeo-estados/:id", authRequired, companyRequired, requireRoles([Role.ADMIN, Role.OPERADOR]), async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  const id = String(req.params.id);
  const schema = z.object({ estadoUnificado: z.string().min(1).optional(), transportadora: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
  const existing = await prisma.mapeoEstado.findFirst({ where: { id, companyId: user.companyId } });
  if (!existing) return res.status(404).json({ message: "No encontrado." });
  const row = await prisma.mapeoEstado.update({
    where: { id },
    data: parsed.data,
  });
  return res.json(row);
});

app.delete("/api/mapeo-estados/:id", authRequired, companyRequired, requireRoles([Role.ADMIN, Role.OPERADOR]), async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  const id = String(req.params.id);
  const existing = await prisma.mapeoEstado.findFirst({ where: { id, companyId: user.companyId } });
  if (!existing) return res.status(404).json({ message: "No encontrado." });
  await prisma.mapeoEstado.delete({ where: { id } });
  return res.status(204).send();
});

app.post("/api/import/remapear-estados", authRequired, companyRequired, requireRoles([Role.ADMIN, Role.OPERADOR]), async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  const result = await remapearPedidos(prisma, user.companyId);
  return res.json(result);
});

app.post("/api/import/wipe-imported-tables", authRequired, companyRequired, requireRoles([Role.ADMIN]), async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  const schema = z.object({ password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Contraseña requerida." });
  try {
    const result = await wipeImportedForCompany(prisma, user.companyId, parsed.data.password);
    return res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("Contraseña") ? 401 : msg.includes("deshabilitada") ? 403 : 400;
    return res.status(status).json({ message: msg });
  }
});

app.post("/api/import/wipe-cpa", authRequired, companyRequired, requireRoles([Role.ADMIN]), async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  const schema = z.object({ password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Contraseña requerida." });
  try {
    const result = await wipeCpaForCompany(prisma, user.companyId, parsed.data.password);
    return res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("Contraseña") ? 401 : msg.includes("deshabilitada") ? 403 : 400;
    return res.status(status).json({ message: msg });
  }
});

app.get("/api/cpa-records", authRequired, companyRequired, async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  const rows = await prisma.cpaRecord.findMany({
    where: { companyId: user.companyId },
    orderBy: { fecha: "desc" },
    take: 200,
  });
  return res.json(rows);
});

app.post("/api/cpa-records", authRequired, companyRequired, requireRoles([Role.ADMIN, Role.OPERADOR]), async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  try {
    const row = await createCpaRecord(prisma, user.companyId, req.body);
    return res.status(201).json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ message: msg });
  }
});

app.patch("/api/cpa-records/:id", authRequired, companyRequired, requireRoles([Role.ADMIN, Role.OPERADOR]), async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  const id = String(req.params.id);
  try {
    const row = await updateCpaRecord(prisma, user.companyId, id, req.body);
    return res.json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("no encontrado") ? 404 : 400;
    return res.status(status).json({ message: msg });
  }
});

app.delete("/api/cpa-records/:id", authRequired, companyRequired, requireRoles([Role.ADMIN, Role.OPERADOR]), async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  const id = String(req.params.id);
  try {
    await deleteCpaRecord(prisma, user.companyId, id);
    return res.status(204).send();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("no encontrado") ? 404 : 400;
    return res.status(status).json({ message: msg });
  }
});

app.post("/api/orders/export", authRequired, companyRequired, async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  try {
    const parsed = orderExportBodySchema.safeParse(flattenParams((req.body ?? {}) as Record<string, unknown>));
    if (!parsed.success) return res.status(400).json({ message: "Payload inválido." });
    const f = { page: 1, limit: 50, ...parsed.data };
    const narrowed = await narrowOrderIdsByCastFilters(prisma, user.companyId, f);
    if (narrowed && narrowed.length === 0) {
      const ws = XLSX.utils.json_to_sheet([]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      res.setHeader("Content-Disposition", 'attachment; filename="pedidos.xlsx"');
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return res.send(buf);
    }
    const where = buildPrismaOrderWhere(user.companyId, f, narrowed);
    const orderBy = buildOrderOrderBy(f);
    const orders = await prisma.order.findMany({
      where,
      orderBy,
      take: 20_000,
    });
    const flat = orders.map((o) => ({
      id: o.id,
      id_dropi: o.externalOrderId,
      fecha: o.fecha,
      cliente: o.cliente,
      telefono: o.telefono,
      ciudad: o.ciudad,
      departamento: o.departamento,
      direccion: o.direccion,
      transportadora: o.transportadora,
      estado_unificado: o.estadoUnificado,
      estado_operativo: o.estadoOperativo,
      venta: o.venta != null ? Number(o.venta) : null,
      ganancia_calc: o.gananciaCalc != null ? Number(o.gananciaCalc) : null,
      flete: o.flete != null ? Number(o.flete) : null,
      cartera: o.cartera != null ? Number(o.cartera) : null,
      guia: o.guia,
      notas: o.notas,
      notas_manuales: (o as Order & { notasManuales?: string | null }).notasManuales ?? null,
      estatus_original: o.estatusOriginal,
      ultimo_mov: o.ultimoMov,
    }));
    const ws = XLSX.utils.json_to_sheet(flat);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    res.setHeader("Content-Disposition", 'attachment; filename="pedidos.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/orders/export]", err);
    return res.status(500).json({ message: msg });
  }
});

app.get("/api/reports/dashboard", authRequired, companyRequired, async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  const qv = (k: string): string | undefined => {
    const v = req.query[k];
    if (typeof v === "string") return v;
    if (Array.isArray(v) && typeof v[0] === "string") return v[0];
    return undefined;
  };
  const desde = qv("desde");
  const hasta = qv("hasta");
  try {
    const payload = await getDashboardMetrics(prisma, user.companyId, { desde, hasta });
    return res.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/reports/dashboard]", err);
    return res.status(500).json({ message: msg });
  }
});

app.get("/api/reports/rentability", authRequired, companyRequired, async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  const rows = await prisma.order.groupBy({
    by: ["estadoUnificado"],
    _count: { estadoUnificado: true },
    where: { companyId: user.companyId },
  });
  return res.json(rows);
});

app.get("/api/reportes-logistica/efectividad-transportadoras", authRequired, companyRequired, async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  try {
    const rows = await queryEfectividadTransportadoras(prisma, user.companyId, {
      desde: typeof req.query.desde === "string" ? req.query.desde : undefined,
      hasta: typeof req.query.hasta === "string" ? req.query.hasta : undefined,
      transportadora: typeof req.query.transportadora === "string" ? req.query.transportadora : undefined,
    });
    return res.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/reportes-logistica/efectividad-transportadoras]", err);
    return res.status(500).json({ message: msg });
  }
});

app.get("/api/reportes-logistica/ciudades-comparativa", authRequired, companyRequired, async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  try {
    const list = await queryCiudadesComparativa(prisma, user.companyId, {
      desde: typeof req.query.desde === "string" ? req.query.desde : undefined,
      hasta: typeof req.query.hasta === "string" ? req.query.hasta : undefined,
    });
    return res.json(list);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/reportes-logistica/ciudades-comparativa]", err);
    return res.status(500).json({ message: msg });
  }
});

app.get("/api/reportes-logistica/comparativa-geografica", authRequired, companyRequired, async (req, res) => {
  const user = (req as express.Request & { user?: JwtPayload }).user!;
  const dimension = req.query.dimension === "ciudad" ? "ciudad" : "departamento";
  const metrica = req.query.metrica === "devolucion" ? "devolucion" : "efectividad";
  const topRaw = typeof req.query.top === "string" ? Number(req.query.top) : 15;
  const top = Number.isFinite(topRaw) ? topRaw : 15;
  try {
    const body = await queryComparativaGeografica(prisma, user.companyId, {
      dimension,
      metrica,
      top,
      desde: typeof req.query.desde === "string" ? req.query.desde : undefined,
      hasta: typeof req.query.hasta === "string" ? req.query.hasta : undefined,
      ciudad: typeof req.query.ciudad === "string" ? req.query.ciudad : undefined,
    });
    return res.json(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/reportes-logistica/comparativa-geografica]", err);
    return res.status(500).json({ message: msg });
  }
});

registerBusinessModules(app);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  return res.status(500).json({ message: "Error interno del servidor." });
});

app.listen(PORT, () => {
  console.log(`API lista en http://localhost:${PORT}`);
});
