import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import predmeti from "~/data/predmeti.json"

export const settingsRouter = createTRPCRouter({
  getUserClasses: publicProcedure.input(z.object({
    userId: z.string()
  })).query( async ({input, ctx}) => {
    const classes = await ctx.db.predmeti.findMany({where: {
      userId: input.userId
    }})

    return classes
  }),
  addClassesFromSmer: publicProcedure.input(z.object({
    year: z.string(),
    smer: z.string(),
    userId: z.string(),
  })).mutation(async ({input, ctx}) => {
    const classes = await ctx.db.predmeti.findMany({where: {
      userId: input.userId
    }})

    const predmeti_list = predmeti[input.year][input.smer]
    let yearInt;
    switch (input.year) {
      case "year1":
        yearInt == 0
        break
      case "year2":
        yearInt == 1
          break
      case "year3":
        yearInt == 2
        break
      case "year4":
        yearInt == 3
        break
    }

    predmeti_list.forEach(async (predmet) => {
      const isti = classes.find((el => (el.godina == yearInt && el.ime == predmet)))
      if (isti) return
      await ctx.db.predmeti.create({
        data: {
          userId: input.userId,
          godina: yearInt,
          ime: predmet,
        }
      })
    })
  })
});
