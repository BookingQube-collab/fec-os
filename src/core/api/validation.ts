import { z } from "zod";

/** Thrown by API query/body parsers; mapped to HTTP 400 in `createApiRoute`. */
export class ApiValidationError extends Error {
  readonly status = 400 as const;

  constructor(message: string) {
    super(message);
    this.name = "ApiValidationError";
  }
}

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
}

export function parseWithSchema<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiValidationError(formatZodError(result.error));
  }
  return result.data;
}

export function searchParamsToObject(params: URLSearchParams): Record<string, string> {
  return Object.fromEntries(params.entries());
}

export const dashboardPeriodSchema = z.enum(["today", "yesterday", "week", "month"]);

export const optionalLocationIdSchema = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

export const dashboardKpisQuerySchema = z.object({
  period: dashboardPeriodSchema.default("today"),
  locationId: optionalLocationIdSchema,
  view: z.string().optional(),
});

const currentYear = () => new Date().getFullYear();

function optionalFiniteNumber(fallback?: number) {
  return z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return fallback;
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    });
}

export const dashboardSecondaryQuerySchema = z.object({
  include: z
    .string()
    .min(1, "include query param required (charts, complianceKpis, renewals)")
    .transform((raw) =>
      new Set(
        raw
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
      ),
    )
    .refine((set) => set.size > 0, "include query param required"),
  locationId: optionalLocationIdSchema,
  year: optionalFiniteNumber(currentYear()),
  utilityBase: optionalFiniteNumber(undefined),
  renewalsLimit: optionalFiniteNumber(50),
  locationCode: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export const complianceKpisQuerySchema = z.object({
  locationId: optionalLocationIdSchema,
});
