import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const settingsRouter = createTRPCRouter({
  getUserSettings: publicProcedure.input(z.object({
    userId: z.string()
  })).query( ({input, ctx}) => {
    const settings = ctx.db.podesavanja.findUnique({where: {
      userId: input.userId
    }})

    return settings
  }),

  getUserClasses: publicProcedure.input(z.object({
    userId: z.string()
  })).query( async ({input, ctx}) => {
    const classes = await ctx.db.predmeti.findMany({where: {
      userId: input.userId
    }})

    return classes
  })
});
