import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const settingsRouter = router({
  get: adminProcedure
    .input(z.object({ key: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ value: settings.value })
        .from(settings)
        .where(eq(settings.key, input.key))
        .limit(1);
      return row?.value ?? null;
    }),

  update: adminProcedure
    .input(z.object({
      key: z.string().min(1),
      value: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(settings)
        .values({ key: input.key, value: input.value })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: input.value, updatedAt: new Date() },
        });
      return { success: true };
    }),
});