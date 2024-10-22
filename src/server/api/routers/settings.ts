import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import predmeti from "~/data/predmeti.json"
import { TRPCError } from "@trpc/server";

function year_to_int(year) {
  switch (year) {
    case "year1":
      return 0
    case "year2":
      return 1
    case "year3":
      return 2
    case "year4":
      return 3
    default:
      return -1;
  }
}

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
    console.log(input.year, "\n\n\n\n\n\n-------------------------")

    const predmeti_list = predmeti[input.year][input.smer]
    let yearInt;
    switch (input.year) {
      case "year1":
        yearInt = 0
        break
      case "year2":
        yearInt = 1
          break
      case "year3":
        yearInt = 2
        break
      case "year4":
        yearInt = 3
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
  }),
  addClass: publicProcedure.input(z.object({
    userId: z.string(),
    year: z.string(),
    ime: z.string(),
  })).mutation(async  ({input, ctx}) => {
    const classes = await ctx.db.predmeti.findMany({where: {
      userId: input.userId
    }})
    const isti = classes.find((el => (el.godina == year_to_int(input.year) && el.ime == input.ime)))
    if (isti) throw new TRPCError({code: "CONFLICT", message: "Pred vec izabran!"})
    await ctx.db.predmeti.create({
      data: {
        userId: input.userId,
        godina: year_to_int(input.year),
        ime: input.ime
      }
    })
  })
});
