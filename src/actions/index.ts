import { defineAction, ActionError, type ActionAPIContext } from "astro:actions";
import { z } from "astro:schema";
import {
  MemeCaptions,
  MemeIdeas,
  MemeTemplates,
  and,
  db,
  eq,
  or,
} from "astro:db";

function requireUser(context: ActionAPIContext) {
  const locals = context.locals as App.Locals | undefined;
  const user = locals?.user;

  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action.",
    });
  }

  return user;
}

async function ensureTemplateAccessible(templateId: string, userId: string) {
  const [template] = await db
    .select()
    .from(MemeTemplates)
    .where(eq(MemeTemplates.id, templateId));

  if (!template) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: "Template not found.",
    });
  }

  if (template.userId && template.userId !== userId) {
    throw new ActionError({
      code: "FORBIDDEN",
      message: "You do not have access to this template.",
    });
  }

  return template;
}

async function getOwnedIdea(ideaId: string, userId: string) {
  const [idea] = await db
    .select()
    .from(MemeIdeas)
    .where(and(eq(MemeIdeas.id, ideaId), eq(MemeIdeas.userId, userId)));

  if (!idea) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: "Meme idea not found.",
    });
  }

  return idea;
}

export const server = {
  createTemplate: defineAction({
    input: z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      imageUrl: z.string().optional(),
      layoutType: z.string().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const now = new Date();

      const [template] = await db
        .insert(MemeTemplates)
        .values({
          id: crypto.randomUUID(),
          userId: user.id,
          name: input.name,
          description: input.description,
          imageUrl: input.imageUrl,
          layoutType: input.layoutType,
          isSystem: false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return { success: true, data: { template } };
    },
  }),

  listTemplates: defineAction({
    input: z.object({}).optional(),
    handler: async (_input, context) => {
      const user = requireUser(context);

      const templates = await db
        .select()
        .from(MemeTemplates)
        .where(or(eq(MemeTemplates.userId, user.id), eq(MemeTemplates.userId, null)));

      return { success: true, data: { items: templates, total: templates.length } };
    },
  }),

  createMemeIdea: defineAction({
    input: z.object({
      templateId: z.string().optional(),
      context: z.string().optional(),
      topic: z.string().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      if (input.templateId) {
        await ensureTemplateAccessible(input.templateId, user.id);
      }

      const [idea] = await db
        .insert(MemeIdeas)
        .values({
          id: crypto.randomUUID(),
          userId: user.id,
          templateId: input.templateId,
          context: input.context,
          topic: input.topic,
          createdAt: new Date(),
        })
        .returning();

      return { success: true, data: { idea } };
    },
  }),

  listMemeIdeas: defineAction({
    input: z.object({}).optional(),
    handler: async (_input, context) => {
      const user = requireUser(context);

      const ideas = await db
        .select()
        .from(MemeIdeas)
        .where(eq(MemeIdeas.userId, user.id));

      return { success: true, data: { items: ideas, total: ideas.length } };
    },
  }),

  createMemeCaption: defineAction({
    input: z.object({
      memeIdeaId: z.string().min(1),
      variantLabel: z.string().optional(),
      topText: z.string().optional(),
      bottomText: z.string().optional(),
      extraText: z.string().optional(),
      isFavorite: z.boolean().optional(),
      isUsed: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedIdea(input.memeIdeaId, user.id);

      const [caption] = await db
        .insert(MemeCaptions)
        .values({
          id: crypto.randomUUID(),
          memeIdeaId: input.memeIdeaId,
          variantLabel: input.variantLabel,
          topText: input.topText,
          bottomText: input.bottomText,
          extraText: input.extraText,
          isFavorite: input.isFavorite ?? false,
          isUsed: input.isUsed ?? false,
          createdAt: new Date(),
        })
        .returning();

      return { success: true, data: { caption } };
    },
  }),

  updateMemeCaption: defineAction({
    input: z
      .object({
        id: z.string().min(1),
        memeIdeaId: z.string().min(1),
        variantLabel: z.string().optional(),
        topText: z.string().optional(),
        bottomText: z.string().optional(),
        extraText: z.string().optional(),
        isFavorite: z.boolean().optional(),
        isUsed: z.boolean().optional(),
      })
      .refine(
        (input) =>
          input.variantLabel !== undefined ||
          input.topText !== undefined ||
          input.bottomText !== undefined ||
          input.extraText !== undefined ||
          input.isFavorite !== undefined ||
          input.isUsed !== undefined,
        { message: "At least one field must be provided to update." }
      ),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedIdea(input.memeIdeaId, user.id);

      const [existing] = await db
        .select()
        .from(MemeCaptions)
        .where(
          and(
            eq(MemeCaptions.id, input.id),
            eq(MemeCaptions.memeIdeaId, input.memeIdeaId)
          )
        );

      if (!existing) {
        throw new ActionError({ code: "NOT_FOUND", message: "Meme caption not found." });
      }

      const [caption] = await db
        .update(MemeCaptions)
        .set({
          ...(input.variantLabel !== undefined ? { variantLabel: input.variantLabel } : {}),
          ...(input.topText !== undefined ? { topText: input.topText } : {}),
          ...(input.bottomText !== undefined ? { bottomText: input.bottomText } : {}),
          ...(input.extraText !== undefined ? { extraText: input.extraText } : {}),
          ...(input.isFavorite !== undefined ? { isFavorite: input.isFavorite } : {}),
          ...(input.isUsed !== undefined ? { isUsed: input.isUsed } : {}),
        })
        .where(eq(MemeCaptions.id, input.id))
        .returning();

      return { success: true, data: { caption } };
    },
  }),

  deleteMemeCaption: defineAction({
    input: z.object({
      id: z.string().min(1),
      memeIdeaId: z.string().min(1),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedIdea(input.memeIdeaId, user.id);

      const result = await db
        .delete(MemeCaptions)
        .where(
          and(
            eq(MemeCaptions.id, input.id),
            eq(MemeCaptions.memeIdeaId, input.memeIdeaId)
          )
        );

      if (result.rowsAffected === 0) {
        throw new ActionError({ code: "NOT_FOUND", message: "Meme caption not found." });
      }

      return { success: true };
    },
  }),

  listMemeCaptions: defineAction({
    input: z.object({
      memeIdeaId: z.string().min(1),
      favoritesOnly: z.boolean().default(false),
      usedOnly: z.boolean().default(false),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedIdea(input.memeIdeaId, user.id);

      const filters = [eq(MemeCaptions.memeIdeaId, input.memeIdeaId)];
      if (input.favoritesOnly) {
        filters.push(eq(MemeCaptions.isFavorite, true));
      }
      if (input.usedOnly) {
        filters.push(eq(MemeCaptions.isUsed, true));
      }

      const captions = await db.select().from(MemeCaptions).where(and(...filters));

      return { success: true, data: { items: captions, total: captions.length } };
    },
  }),
};
