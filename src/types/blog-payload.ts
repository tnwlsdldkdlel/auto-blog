import { z } from 'zod';

export const BlogSectionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), value: z.string() }),
  z.object({
    type: z.literal('image'),
    index: z.number().int().nonnegative(),
    caption: z.string().optional(),
  }),
]);

export const BlogPayloadSchema = z.object({
  title: z.string().min(1).max(100),
  tags: z.array(z.string()).max(10),
  categoryCode: z.string().default(''),
  place: z
    .object({
      name: z.string(),
      address: z.string(),
      latitude: z.number(),
      longitude: z.number(),
    })
    .optional(),
  sections: z.array(BlogSectionSchema).min(1),
  options: z
    .object({
      commentAllow: z.boolean(),
      sympathyAllow: z.boolean(),
      isPublic: z.enum(['all', 'private']),
    })
    .default({
      commentAllow: true,
      sympathyAllow: true,
      isPublic: 'all',
    }),
});

export type BlogSection = z.infer<typeof BlogSectionSchema>;
export type BlogPayload = z.infer<typeof BlogPayloadSchema>;
