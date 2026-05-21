import { z } from 'zod';

export const BlogSectionSchema = z.union([
  z.object({ type: z.literal('text'), value: z.string() }),
  z.object({
    type: z.literal('image'),
    index: z.number().int().nonnegative(),
    caption: z.string().nullable(),
  }),
]);

export const BlogPayloadSchema = z.object({
  title: z.string().min(1).max(100),
  tags: z.array(z.string()).max(10),
  categoryCode: z.string(),
  place: z
    .object({
      name: z.string(),
      address: z.string(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
    })
    .nullable(),
  sections: z.array(BlogSectionSchema).min(1),
  options: z.object({
    commentAllow: z.boolean(),
    sympathyAllow: z.boolean(),
    isPublic: z.enum(['all', 'private']),
  }),
});

export type BlogSection = z.infer<typeof BlogSectionSchema>;
export type BlogPayload = z.infer<typeof BlogPayloadSchema>;
