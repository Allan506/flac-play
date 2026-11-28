// Búsqueda de una copia verificable cuando el FLAC del catálogo pedido no pasa
// el análisis de espectro. La decisión de entregar o no sigue siendo del
// verificador; esto sólo amplía el abanico de candidatos antes de rendirse.

export function twinPlatform(platform) {
  if (platform === 'kuwo') return 'wyy';
  if (platform === 'wyy') return 'kuwo';
  return null;
}

export function rescueKeyword(meta) {
  return [meta?.artist, meta?.name]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 120);
}

export function normalizeRescueTitle(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\((?!feat)[^)]*\)|\[[^\]]*\]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .trim();
}

// Versiones que no son la pista pedida aunque compartan el título.
const MARCADORES_FALSOS =
  /karaoke|tribute|originally performed|in the style of|made famous|instrumental|backing track|playback|homenaje/i;

/**
 * Ordena las copias disponibles por parecido con la pista pedida.
 * Exige título equivalente, FLAC disponible y una duración compatible: sin eso
 * una "copia" es otra canción y verificarla no aporta nada.
 */
export function rankTwinCandidates(
  meta,
  list,
  { expectedDuration = 0, tolerance = 6, limit = 3, excludeId = '' } = {},
) {
  const objetivo = normalizeRescueTitle(meta?.name);
  if (!objetivo) return [];
  const duracion = Number(expectedDuration) || Number(meta?.duration) || 0;

  return (Array.isArray(list) ? list : [])
    .filter((track) => Array.isArray(track?.minfo) && track.minfo.some((item) => item.format === 'flac'))
    .filter((track) => String(track.id) !== String(excludeId))
    .filter((track) => !MARCADORES_FALSOS.test(String(track.name ?? '')))
    .map((track) => {
      const titulo = normalizeRescueTitle(track.name);
      const exacto = titulo === objetivo;
      const equivalente = exacto || titulo.includes(objetivo) || objetivo.includes(titulo);
      const desvio = duracion && track.duration ? Math.abs(Number(track.duration) - duracion) : 0;
      return { track, exacto, equivalente, desvio };
    })
    .filter((item) => item.equivalente && item.desvio <= tolerance)
    .sort((a, b) => (a.exacto === b.exacto ? a.desvio - b.desvio : a.exacto ? -1 : 1))
    .slice(0, limit)
    .map((item) => item.track);
}
