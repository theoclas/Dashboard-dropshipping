import { z } from "zod";

export const ordersTableColumnPinSchema = z.enum(["left", "right"]);

export const ordersTableColumnEntrySchema = z.object({
  key: z.string().min(1).max(64),
  visible: z.boolean(),
  pin: ordersTableColumnPinSchema.optional(),
});

export const ordersTableConfigSchema = z.object({
  version: z.literal(1),
  columns: z.array(ordersTableColumnEntrySchema).min(1).max(64),
});

export type OrdersTableConfig = z.infer<typeof ordersTableConfigSchema>;

export function parseOrdersTableConfig(raw: unknown): OrdersTableConfig | null {
  const parsed = ordersTableConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
