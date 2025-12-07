/**
 * AI Meme Creator - generate meme ideas + captions using templates.
 *
 * Design goals:
 * - Support a library of meme templates (image-based, with typical top/bottom text).
 * - Allow user-specific meme ideas referencing a template.
 * - Track generated captions and which ones were used.
 *
 * Note: actual image files likely stored on object storage (S3, etc.),
 * here we only keep template IDs and image URLs.
 */

import { defineTable, column, NOW } from "astro:db";

export const MemeTemplates = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    // userId optional: null/system = global templates
    userId: column.text({ optional: true }),
    name: column.text(),                               // e.g. "Distracted Boyfriend", "Drake Hotline"
    description: column.text({ optional: true }),
    imageUrl: column.text({ optional: true }),         // where template image lives
    layoutType: column.text({ optional: true }),       // "top-bottom", "two-panel", etc.
    isSystem: column.boolean({ default: false }),
    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
});

export const MemeIdeas = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(),
    templateId: column.text({
      references: () => MemeTemplates.columns.id,
      optional: true,                                  // some memes may not use a known template
    }),
    context: column.text({ optional: true }),          // description of situation / idea
    topic: column.text({ optional: true }),            // e.g. "coding", "office life"
    createdAt: column.date({ default: NOW }),
  },
});

export const MemeCaptions = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    memeIdeaId: column.text({
      references: () => MemeIdeas.columns.id,
    }),
    variantLabel: column.text({ optional: true }),     // "A", "B"
    topText: column.text({ optional: true }),
    bottomText: column.text({ optional: true }),
    extraText: column.text({ optional: true }),        // for multi-panel memes or alt text
    isFavorite: column.boolean({ default: false }),
    isUsed: column.boolean({ default: false }),        // whether user marked it as used
    createdAt: column.date({ default: NOW }),
  },
});

export const tables = {
  MemeTemplates,
  MemeIdeas,
  MemeCaptions,
} as const;
