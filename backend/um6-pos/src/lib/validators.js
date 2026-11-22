import { z } from 'zod';

export const salesSchema = z.object({
  reference: z.string().max(64).optional(),
  items: z.array(
    z.object({
      productId: z.number().int().positive(),
      quantity: z.number().positive()
    })
  ).min(1)
});

export const movementSchema = z.object({
  storeCode: z.string().min(3).optional(),
  type: z.enum(['ADJUSTMENT', 'STOCK_IN', 'STOCK_OUT']),
  reference: z.string().max(64).optional(),
  items: z.array(
    z.object({
      productId: z.number().int().positive(),
      quantity: z.number().positive()
    })
  ).min(1)
});

export const createOrderSchema = z.object({
  storeCode: z.string().min(3),
  suggested: z.boolean().optional(),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.number().int().positive(),
      quantity: z.number().positive()
    })
  ).min(1)
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'IN_TRANSIT', 'REJECTED'])
});

export const planogramCreateSchema = z.object({
  storeCode: z.string().min(3),
  fileUrl: z.string().url(),
  version: z.number().int().positive().optional()
});

export const inventoryLevelsSchema = z.object({
  storeCode: z.string().min(3),
  items: z.array(
    z.object({
      productId: z.number().int().positive(),
      maxLevel: z.number().nonnegative().nullable().optional(),
      minLevel: z.number().nonnegative().nullable().optional()
    })
  ).min(1)
});
