import { z } from 'zod';
import { HttpError } from './errors.mjs';

const platform = z.enum(['kuwo', 'wyy'], {
  errorMap: () => ({ message: 'Elige Kuwo o NetEase.' }),
});

const songId = z
  .string({ required_error: 'Falta el identificador de la pista.' })
  .trim()
  .regex(/^\d{1,32}$/, 'El identificador de la pista no es válido.');

const sign = z
  .string()
  .trim()
  .max(128)
  .regex(/^[a-zA-Z0-9]*$/, 'La firma de la pista no es válida.')
  .optional();

const time = z.coerce.number().int().min(0).max(99_999_999_999).optional();

const format = z.enum(['mp3', 'flac'], {
  errorMap: () => ({ message: 'El formato debe ser MP3 o FLAC.' }),
});

const bitrate = z
  .union([z.string(), z.number()])
  .transform((value) => String(value))
  .refine((value) => /^\d{1,7}$/.test(value), 'La tasa de bits no es válida.');

const text = (max = 300) => z.string().trim().max(max).default('');

export const searchSchema = z.object({
  platform,
  keyword: z
    .string({ required_error: 'Escribe una búsqueda.' })
    .trim()
    .min(1, 'Escribe una búsqueda.')
    .max(120, 'La búsqueda puede tener hasta 120 caracteres.'),
  page: z.coerce.number().int().min(1).max(200).default(1),
});

export const resolveSchema = z.object({
  platform,
  songid: songId,
  format,
  bitrate,
  time,
  sign,
  requireLossless: z.boolean().default(false),
});

export const lyricsSchema = z.object({
  platform,
  songid: songId,
  time,
  sign,
});

export const albumSchema = z.object({
  platform,
  id: z
    .string({ required_error: 'Falta el álbum.' })
    .trim()
    .regex(/^(?!0+$)\d{1,32}$/, 'El álbum no es válido.'),
  page: z.coerce.number().int().min(1).max(200).default(1),
  size: z.coerce.number().int().min(1).max(50).default(20),
});

export const downloadSchema = z.object({
  platform,
  songid: songId,
  format,
  outputFormat: format,
  bitrate,
  time,
  sign,
  title: text(300),
  artist: text(300),
  album: text(300),
  coverUrl: z.string().trim().max(2000).default(''),
  expectedDurationSeconds: z.coerce.number().min(0).max(36_000).default(0),
  embedMetadata: z.boolean().default(true),
  embedCover: z.boolean().default(true),
  requireLossless: z.boolean().default(false),
  allowDoubtful: z.boolean().default(false),
});

export const probeSchema = z.object({
  platform,
  songid: songId,
  format,
  bitrate,
  time,
  sign,
  expectedDurationSeconds: z.coerce.number().min(0).max(36_000).default(0),
});

export const checkSchema = z.object({
  platform,
  songid: songId,
  time,
  sign,
  expectedDurationSeconds: z.coerce.number().min(0).max(36_000).default(0),
  requireLossless: z.boolean().default(false),
  qualities: z
    .array(z.object({ format, bitrate }))
    .min(1, 'No hay calidades para comprobar.')
    .max(6, 'Se pueden comprobar hasta 6 calidades a la vez.'),
});

export function parseBody(schema, body) {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join('.');
    throw new HttpError(
      400,
      'INVALID_REQUEST',
      issue.message,
      field ? { field } : undefined,
    );
  }
  return result.data;
}
