import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, checkQualities, downloadTrack, readApiError } from '../api';
import type {
  ActualAudioFormat,
  AudioFormat,
  Platform,
  Quality,
  QualityCheck,
  Track,
} from '../types';
import {
  formatBytes,
  formatDuration,
  formatQuality,
  safeFilename,
  sourceTrackUrl,
} from '../lib/format';
import { platformName, platformOverline } from '../lib/platforms';
import { Modal } from './Modal';
import {
  AlertIcon,
  CheckIcon,
  DownloadIcon,
  ExternalIcon,
  LoaderIcon,
  LockIcon,
} from './Icons';

interface DownloadModalProps {
  open: boolean;
  onClose: () => void;
  track: Track | null;
  platform: Platform;
  strictLossless?: boolean;
  onToast: (message: string, kind?: 'success' | 'error' | 'info') => void;
}

interface Progress {
  received: number;
  total: number;
}

type CheckStatus =
  | 'checking'
  | 'full'
  | 'preview'
  | 'unavailable'
  | 'rejected'
  | 'mismatch'
  | 'unknown';

function actualFormatLabel(format: ActualAudioFormat | undefined): string {
  if (format === 'flac') return 'FLAC';
  if (format === 'mp3') return 'MP3';
  if (format === 'm4a') return 'M4A/AAC';
  if (format === 'ogg') return 'OGG';
  return 'formato desconocido';
}

function formatKhz(hz: number): string {
  if (!hz) return '—';
  return `${(hz / 1000).toFixed(1).replace('.', ',')} kHz`;
}

function parseFilename(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      return fallback;
    }
  }
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1] : fallback;
}

function checkStatus(check: QualityCheck | null, checking: boolean): CheckStatus {
  if (check) {
    if (check.likelyPreview) return 'preview';
    if (!check.available) return 'unavailable';
    if (check.format === 'flac' && check.spectrum && check.spectrum.verdict !== 'lossless') {
      return 'rejected';
    }
    if (check.formatMismatch && check.actualFormat !== 'flac') return 'mismatch';
    return 'full';
  }
  return checking ? 'checking' : 'unknown';
}

const STATUS_LABEL: Record<CheckStatus, string> = {
  checking: 'Comprobando…',
  full: 'Completa',
  preview: 'Posible vista previa',
  unavailable: 'No disponible',
  rejected: 'No sin pérdida',
  mismatch: 'Formato distinto',
  unknown: 'Sin comprobar',
};

export function DownloadModal({
  open,
  onClose,
  track,
  platform,
  strictLossless = false,
  onToast,
}: DownloadModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [checks, setChecks] = useState<QualityCheck[]>([]);
  const [recommended, setRecommended] = useState<{
    format: Quality['format'];
    bitrate: string;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [embedMetadata, setEmbedMetadata] = useState(true);
  const [embedCover, setEmbedCover] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<Progress>({ received: 0, total: 0 });
  const [error, setError] = useState('');
  const [previewRejected, setPreviewRejected] = useState(false);
  const [losslessRejected, setLosslessRejected] = useState<{
    verdict: string;
    cutoffHz: number;
    limitHz: number;
    label: string;
  } | null>(null);
  const [formatMismatch, setFormatMismatch] = useState<{
    actualFormat: ActualAudioFormat;
    actualBitrate: number;
    requestedFormat: AudioFormat;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const userPickedRef = useRef(false);

  const qualities = useMemo(() => {
    const all = track?.minfo ?? [];
    return strictLossless ? all.filter((item) => item.format === 'flac') : all;
  }, [track, strictLossless]);
  const quality: Quality | null = qualities[selectedIndex] ?? qualities[0] ?? null;
  const hasCover = Boolean(track?.pic_url);
  const qualitySignature = qualities.map((item) => `${item.format}:${item.bitrate}`).join(',');

  const selectedCheck =
    checks.find(
      (check) => check.format === quality?.format && check.bitrate === quality?.bitrate,
    ) ?? null;
  const status = checkStatus(selectedCheck, checking);
  const selectedUnavailable = status === 'unavailable' || status === 'rejected';
  const selectedRejected = status === 'rejected' ? selectedCheck : null;
  const selectedPreview = status === 'preview';
  const allUnavailable = checks.length > 0 && checks.every((check) => !check.available);
  const selectedMismatchCheck =
    selectedCheck?.formatMismatch && selectedCheck.actualFormat !== 'flac' ? selectedCheck : null;
  const advisoryMismatch = Boolean(selectedMismatchCheck);
  const confirmedMismatch = Boolean(formatMismatch && formatMismatch.actualFormat !== 'flac');
  const showMismatch = advisoryMismatch || confirmedMismatch;
  const mismatchActual: ActualAudioFormat =
    (confirmedMismatch ? formatMismatch?.actualFormat : selectedMismatchCheck?.actualFormat) ??
    'mp3';
  const mismatchBitrate =
    (confirmedMismatch ? formatMismatch?.actualBitrate : selectedMismatchCheck?.actualBitrate) ||
    320;
  const actualOutputFormat: AudioFormat | null = quality
    ? confirmedMismatch
      ? 'mp3'
      : quality.format
    : null;
  const outputQuality: Quality | null =
    quality && actualOutputFormat
      ? {
          ...quality,
          format: actualOutputFormat,
          bitrate:
            actualOutputFormat === 'mp3' && confirmedMismatch
              ? String(mismatchBitrate || 320)
              : quality.bitrate,
        }
      : null;
  const fullAlternativeIndex = checks.findIndex(
    (check) =>
      check.available &&
      !check.likelyPreview &&
      !check.formatMismatch &&
      !(check.format === quality?.format && check.bitrate === quality?.bitrate),
  );
  const fullAlternative = fullAlternativeIndex >= 0 ? qualities[fullAlternativeIndex] : null;
  const expectedBytes =
    track && quality ? track.duration * (Number(quality.bitrate) || 0) * 125 : 0;

  useEffect(() => {
    if (!open || !track) return;
    userPickedRef.current = false;
    setSelectedIndex(0);
    setChecks([]);
    setRecommended(null);
    setCheckError('');
    setEmbedMetadata(true);
    setEmbedCover(Boolean(track.pic_url));
    setError('');
    setPreviewRejected(false);
    setLosslessRejected(null);
    setFormatMismatch(null);
    setProgress({ received: 0, total: 0 });
    setDownloading(false);
    abortRef.current?.abort();
    abortRef.current = null;
  }, [open, track]);

  useEffect(() => {
    if (!open || !track || !qualities.length) return;
    const controller = new AbortController();
    setChecking(true);
    setCheckError('');
    setChecks([]);

    checkQualities(
      {
        platform,
        songid: track.id,
        time: track.time,
        sign: track.sign,
        expectedDurationSeconds: track.duration,
        requireLossless: strictLossless,
        qualities: qualities.map((item) => ({ format: item.format, bitrate: item.bitrate })),
      },
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setChecks(result.qualities);
        setRecommended(result.recommended);
        if (!userPickedRef.current && result.recommended) {
          const index = qualities.findIndex(
            (item) =>
              item.format === result.recommended?.format &&
              item.bitrate === result.recommended?.bitrate,
          );
          if (index >= 0) setSelectedIndex(index);
        }
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setCheckError(
          caught instanceof Error
            ? caught.message
            : 'No se pudieron comprobar las calidades antes de descargar.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });

    return () => controller.abort();
  }, [open, track, platform, qualitySignature, qualities]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [open]);

  if (!track) return null;

  const selectQuality = (index: number) => {
    userPickedRef.current = true;
    setSelectedIndex(index);
    setError('');
    setPreviewRejected(false);
    setFormatMismatch(null);
  };

  const startDownload = async (overrideOutput?: AudioFormat) => {
    if (!quality || downloading || selectedUnavailable) return;
    const outputFormat = overrideOutput ?? actualOutputFormat ?? quality.format;
    const controller = new AbortController();
    abortRef.current = controller;
    setDownloading(true);
    setError('');
    setPreviewRejected(false);
    setProgress({ received: 0, total: 0 });

    try {
      const response = await downloadTrack(
        track,
        platform,
        {
          quality,
          outputFormat,
          requireLossless: strictLossless || outputFormat === 'flac',
          embedMetadata,
          embedCover: embedCover && hasCover,
        },
        controller.signal,
      );

      if (!response.ok) {
        throw await readApiError(response);
      }

      const total = Number(response.headers.get('content-length')) || 0;
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const deliveredFormat = (response.headers.get('x-flacplay-output-format') ??
        outputFormat) as AudioFormat;
      const verified = response.headers.get('x-flacplay-verified') === '1';
      const losslessVerdict = response.headers.get('x-flacplay-lossless-verdict') ?? '';
      const losslessCutoff = Number(response.headers.get('x-flacplay-lossless-cutoff-hz')) || 0;
      const losslessLimit = Number(response.headers.get('x-flacplay-lossless-limit-hz')) || 0;
      const coverResolution = response.headers.get('x-flacplay-cover-resolution') ?? '';
      const filename = parseFilename(
        response.headers.get('content-disposition'),
        `${safeFilename(`${track.artist} - ${track.name}`)}.${deliveredFormat}`,
      );

      if (!response.body) {
        throw new Error('La respuesta no incluyó el archivo de audio.');
      }

      const reader = response.body.getReader();
      const chunks: BlobPart[] = [];
      let received = 0;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value.slice().buffer);
          received += value.byteLength;
          setProgress({ received, total });
        }
      }

      const blob = new Blob(chunks, { type: contentType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

      setProgress({ received, total: total || received });
      const coverNote = coverResolution ? ` · portada ${coverResolution}` : '';
      const losslessNote =
        losslessVerdict === 'lossless'
          ? ` · FLAC verificado (${formatKhz(losslessCutoff)} de ${formatKhz(losslessLimit)})`
          : losslessVerdict === 'high-cut'
            ? ` · FLAC con corte en ${formatKhz(losslessCutoff)}`
            : '';
      const headline =
        losslessVerdict === 'high-cut'
          ? `Archivo ${deliveredFormat.toUpperCase()} descargado con aviso`
          : verified
            ? `Archivo ${deliveredFormat.toUpperCase()} real verificado y descargado`
            : `Archivo ${deliveredFormat.toUpperCase()} descargado`;
      onToast(`${headline}${losslessNote}${coverNote}.`, 'success');
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') {
        setError('Descarga detenida. No se guardó ningún archivo parcial.');
      } else if (caught instanceof ApiError && caught.code === 'SOURCE_FORMAT_MISMATCH') {
        const actualFormat = String(
          caught.details?.actualFormat ?? 'mp3',
        ) as ActualAudioFormat;
        const actualBitrate = Number(caught.details?.actualBitrate) || 0;
        setFormatMismatch({
          actualFormat,
          actualBitrate,
          requestedFormat: quality.format,
        });
        setChecks((previous) =>
          previous.map((check) =>
            check.format === quality.format && check.bitrate === quality.bitrate
              ? {
                  ...check,
                  formatMismatch: true,
                  actualFormat,
                  actualBitrate,
                }
              : check,
          ),
        );
        setError(caught.message);
      } else if (caught instanceof ApiError && caught.code === 'LOSSLESS_NOT_VERIFIED') {
        setLosslessRejected({
          verdict: String(caught.details?.verdict ?? 'unknown'),
          cutoffHz: Number(caught.details?.cutoffHz) || 0,
          limitHz: Number(caught.details?.limitHz) || 0,
          label: String(caught.details?.label ?? ''),
        });
        setError(caught.message);
      } else if (caught instanceof ApiError && caught.code === 'LOSSLESS_INTEGRITY_FAILED') {
        setError(caught.message);
      } else if (caught instanceof ApiError && caught.code === 'PREVIEW_ONLY') {
        setPreviewRejected(true);
        setError(caught.message);
        const previewBytes = Number(caught.details?.contentLength);
        setChecks((previous) =>
          previous.map((check) =>
            check.format === quality.format && check.bitrate === quality.bitrate
              ? {
                  ...check,
                  likelyPreview: true,
                  contentLength:
                    Number.isFinite(previewBytes) && previewBytes > 0
                      ? previewBytes
                      : check.contentLength,
                }
              : check,
          ),
        );
        setRecommended((previous) =>
          previous &&
          previous.format === quality.format &&
          previous.bitrate === quality.bitrate
            ? null
            : previous,
        );
      } else if (caught instanceof Error) {
        setError(caught.message);
      } else {
        setError('No se pudo completar la descarga.');
      }
    } finally {
      setDownloading(false);
      abortRef.current = null;
    }
  };

  const cancel = () => {
    if (downloading) {
      abortRef.current?.abort();
      return;
    }
    onClose();
  };

  const percent = progress.total > 0 ? Math.min(100, (progress.received / progress.total) * 100) : 0;
  const recommendedMatches = (item: Quality) =>
    recommended?.format === item.format && recommended?.bitrate === item.bitrate;

  return (
    <Modal
      open={open}
      onClose={downloading ? () => abortRef.current?.abort() : onClose}
      overline={`FLAC PLAY · DESCARGA · ${platformOverline(platform)}`}
      title={track.name}
      description={`${track.artist}${track.album_name ? ` · ${track.album_name}` : ''} · ${formatDuration(track.duration)}`}
      className="download-modal"
      footer={
        <div className="modal-footer-row">
          <span className="modal-footer-note">
            {outputQuality
              ? `Salida ${formatQuality(outputQuality)}${
                  confirmedMismatch
                    ? ' · formato real confirmado'
                    : advisoryMismatch
                      ? ` · la muestra puede ser ${actualFormatLabel(mismatchActual)}`
                      : selectedRejected
                        ? ' · no verificado como sin pérdida'
                        : selectedPreview
                          ? ' · comprobación orientativa'
                          : ''
                }`
              : 'La fuente no publicó calidades compatibles.'}
          </span>
          <div className="modal-footer-actions">
            <button type="button" className="secondary-button" onClick={cancel}>
              {downloading ? 'Detener' : 'Cancelar'}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => void startDownload()}
              disabled={downloading || !quality || selectedUnavailable}
            >
              {downloading ? <LoaderIcon size={16} /> : <DownloadIcon size={16} />}
              {downloading
                ? 'Preparando…'
                : confirmedMismatch
                  ? 'Descargar MP3 real'
                  : selectedRejected
                    ? 'No se entrega'
                    : selectedPreview
                      ? 'Intentar descarga'
                      : 'Descargar'}
            </button>
          </div>
        </div>
      }
    >
      <div className="download-summary">
        <div className="download-cover">
          {track.pic_url ? <img src={track.pic_url} alt="" referrerPolicy="no-referrer" /> : <LockIcon size={24} />}
        </div>
        <div>
          <p className="download-kicker">ELIGE LA CALIDAD DE ORIGEN</p>
          <div className="quality-options" role="radiogroup" aria-label="Calidad de descarga">
            {qualities.length === 0 ? (
              <span className="quality-empty">
                {strictLossless
                  ? 'Esta pista no publica FLAC: el modo verificado no la descarga.'
                  : 'Sin calidades disponibles'}
              </span>
            ) : null}
            {qualities.map((item, index) => {
              const check =
                checks.find(
                  (candidate) =>
                    candidate.format === item.format && candidate.bitrate === item.bitrate,
                ) ?? null;
              const itemStatus = checkStatus(check, checking);
              return (
                <button
                  key={`${item.format}-${item.bitrate}-${index}`}
                  type="button"
                  role="radio"
                  aria-checked={selectedIndex === index}
                  className={`quality-option quality-option-${itemStatus} ${
                    selectedIndex === index ? 'is-selected' : ''
                  }`}
                  onClick={() => selectQuality(index)}
                  disabled={downloading}
                >
                  <span className="quality-option-main">
                    {item.format === 'flac' ? 'FLAC' : `MP3 ${item.bitrate}`}
                  </span>
                  <span className="quality-option-meta">
                    {item.format === 'flac'
                      ? itemStatus === 'rejected'
                        ? 'espectro recortado'
                        : 'sin pérdida'
                      : `${item.bitrate} kb/s`}
                    {item.size ? ` · ${item.size}` : ''}
                    {check?.sourcePlatform && check.sourcePlatform !== platform ? (
                      <span className="quality-catalog">
                        vía {platformName((check.sourcePlatform as Platform) ?? platform)}
                      </span>
                    ) : null}
                  </span>
                  <span className={`quality-status quality-status-${itemStatus}`}>
                    {itemStatus === 'mismatch' && check
                      ? `Muestra ${actualFormatLabel(check.actualFormat)}`
                      : itemStatus === 'rejected' && check?.spectrum
                        ? `Corte ${formatKhz(check.spectrum.cutoffHz)}`
                        : STATUS_LABEL[itemStatus]}
                  </span>
                  {recommendedMatches(item) ? (
                    <span className="quality-recommended">Recomendada</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        className={`probe-box ${
          selectedPreview || selectedUnavailable || checkError
            ? 'is-warning'
            : status === 'full'
              ? 'is-ok'
              : ''
        }`}
      >
        {checking ? (
          <>
            <LoaderIcon size={16} />
            <span>Comprobando qué calidades entrega la fuente…</span>
          </>
        ) : checkError ? (
          <>
            <AlertIcon size={16} />
            <div>
              <strong>No se pudieron comprobar las calidades.</strong>
              <span>{checkError} Puedes intentar la descarga; la cabina verificará el archivo.</span>
            </div>
          </>
        ) : showMismatch ? (
          <>
            <AlertIcon size={16} />
            <div>
              <strong>
                {confirmedMismatch ? 'La fuente confirmó' : 'La muestra de la fuente es'}{' '}
                {actualFormatLabel(mismatchActual)}
                {mismatchBitrate ? ` ${mismatchBitrate} kb/s` : ''} en lugar de{' '}
                {quality?.format === 'flac' ? 'FLAC' : 'MP3'}.
              </strong>
              <span>
                {selectedPreview ? 'Además, el tamaño sugiere una vista previa. ' : ''}
                {confirmedMismatch
                  ? 'No se renombró a FLAC. Puedes descargar el MP3 real; la duración y el códec ya se verificaron con ffprobe.'
                  : quality?.format === 'flac'
                    ? 'La descarga se reintentará y solo se guardará como FLAC si el archivo real es FLAC. Si la fuente insiste en MP3, no se etiquetará como FLAC.'
                    : 'La descarga convertirá esta muestra a MP3 real; el archivo final se verificará con ffprobe.'}
              </span>
              <button
                type="button"
                className="probe-action"
                onClick={() => void startDownload(confirmedMismatch ? 'mp3' : undefined)}
              >
                {confirmedMismatch ? 'Descargar MP3 real' : 'Descargar y verificar'}{' '}
                <DownloadIcon size={12} />
              </button>
            </div>
          </>
        ) : selectedPreview ? (
          <>
            <AlertIcon size={16} />
            <div>
              <strong>
                {previewRejected
                  ? 'La fuente confirmó una vista previa.'
                  : 'Esta calidad podría ser una vista previa.'}
              </strong>
              <span>
                {previewRejected
                  ? `Sólo se recibieron ${formatBytes(selectedCheck?.contentLength ?? 0)} para una pista de ${formatDuration(track.duration)}. No se guardó ningún archivo parcial.`
                  : `La fuente entrega ${actualFormatLabel(selectedCheck?.actualFormat)} y declara ${formatBytes(selectedCheck?.contentLength ?? 0)} frente a los ${formatBytes(expectedBytes)} esperados. Puedes intentarlo: la cabina mide la duración real y no guardará un archivo incompleto.`}
              </span>
              {fullAlternative && fullAlternativeIndex >= 0 ? (
                <button
                  type="button"
                  className="probe-action"
                  onClick={() => selectQuality(fullAlternativeIndex)}
                >
                  Usar {formatQuality(fullAlternative)} <CheckIcon size={12} />
                </button>
              ) : null}
            </div>
          </>
        ) : selectedUnavailable ? (
          <>
            <AlertIcon size={16} />
            <div>
              <strong>La fuente no confirmó esta calidad.</strong>
              <span>
                {allUnavailable
                  ? 'La fuente no confirmó ninguna calidad. Vuelve a buscar la pista para renovar la sesión o ábrela en la fuente.'
                  : 'Prueba otra calidad o abre la ficha original.'}
              </span>
            </div>
          </>
        ) : status === 'full' ? (
          <>
            <CheckIcon size={16} />
            <div>
              <strong>
                La fuente entrega {actualFormatLabel(selectedCheck?.actualFormat)} real.
              </strong>
              <span>
                {formatBytes(selectedCheck?.contentLength ?? 0)} para esta calidad. El formato se
                detectó en los primeros 64 KB y la duración se verifica de nuevo al preparar el
                archivo.
              </span>
            </div>
          </>
        ) : (
          <>
            <LockIcon size={16} />
            <span>Selecciona una calidad para comprobarla antes de descargar.</span>
          </>
        )}
      </div>

      {selectedCheck?.spectrum ? (
        <div
          className={`lossless-box ${
            selectedCheck.spectrum.verdict === 'lossless'
              ? 'is-ok'
              : selectedCheck.spectrum.verdict === 'high-cut'
                ? 'is-warning'
                : 'is-bad'
          }`}
        >
          {selectedCheck.spectrum.verdict === 'lossless' ? (
            <CheckIcon size={16} />
          ) : (
            <AlertIcon size={16} />
          )}
          <div>
            <strong>
              {selectedCheck.spectrum.verdict === 'lossless'
                ? 'FLAC verificado: espectro completo.'
                : selectedCheck.spectrum.label}
            </strong>
            <span>
              Corte medido en {formatKhz(selectedCheck.spectrum.cutoffHz)} de{' '}
              {formatKhz(selectedCheck.spectrum.limitHz)} ·{' '}
              {selectedCheck.spectrum.bits || 16} bits ·{' '}
              {(selectedCheck.spectrum.sampleRate / 1000).toFixed(1).replace('.', ',')} kHz ·{' '}
              {selectedCheck.spectrum.integrityOk === false
                ? 'integridad MD5 fallida'
                : 'se vuelve a verificar al descargar'}
            </span>
          </div>
        </div>
      ) : null}

      <div className="metadata-options">
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={embedMetadata}
            onChange={(event) => setEmbedMetadata(event.target.checked)}
            disabled={downloading}
          />
          <span className="toggle-copy">
            <strong>Incrustar metadatos</strong>
            <small>Título, artista y álbum en el archivo final.</small>
          </span>
        </label>
        <label className={`toggle-row ${!embedMetadata || !hasCover ? 'is-disabled' : ''}`}>
          <input
            type="checkbox"
            checked={embedMetadata && embedCover && hasCover}
            onChange={(event) => setEmbedCover(event.target.checked)}
            disabled={downloading || !embedMetadata || !hasCover}
          />
          <span className="toggle-copy">
            <strong>Incrustar portada en máxima resolución</strong>
            <small>
              {hasCover
                ? 'Se descarga la portada original y se incrusta en el archivo.'
                : 'La fuente no publicó una portada para esta pista.'}
            </small>
          </span>
        </label>
      </div>

      {downloading ? (
        <div
          className="transfer-panel"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.floor(percent)}
        >
          <div className="transfer-heading">
            <strong>Preparando archivo</strong>
            <span>{progress.total > 0 ? `${Math.floor(percent)}%` : '···'}</span>
          </div>
          <div className={`progress-track ${progress.total > 0 ? '' : 'is-indeterminate'}`}>
            <span style={{ width: progress.total > 0 ? `${percent}%` : '35%' }} />
          </div>
          <p>
            {formatBytes(progress.received)}
            {progress.total > 0 ? ` de ${formatBytes(progress.total)}` : ' recibidos'}
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="download-error" role="alert">
          {error}
        </p>
      ) : null}

      {selectedRejected?.spectrum ? (
        <p className="download-note">
          Esta calidad llega a {formatKhz(selectedRejected.spectrum.cutoffHz)} de{' '}
          {formatKhz(selectedRejected.spectrum.limitHz)}: el contenido no ocupa todo el
          espectro y encaja con audio recodificado con pérdida, así que no se entrega como
          FLAC. Elige otra calidad, otra pista u otro catálogo.
        </p>
      ) : null}

      {losslessRejected ? (
        <p className="download-note">
          La verificación mide {formatKhz(losslessRejected.cutoffHz)} de{' '}
          {formatKhz(losslessRejected.limitHz)} posibles. Un FLAC sólo se entrega con el
          espectro completo: elige otra calidad, otra pista u otro catálogo.
        </p>
      ) : null}

      {previewRejected || selectedPreview ? (
        <a
          className="secondary-button preview-source-link"
          href={sourceTrackUrl(platform, track)}
          target="_blank"
          rel="noreferrer"
        >
          Escuchar la pista completa en la fuente <ExternalIcon size={14} />
        </a>
      ) : null}

      <p className="download-disclaimer">
        Descarga sólo contenido al que tengas derecho de acceso. FLAC Play no aloja audio ni elude
        protecciones de la fuente. La comprobación previa es orientativa; la verificación definitiva
        se hace sobre el archivo descargado y nunca se guarda un fragmento incompleto.
      </p>
    </Modal>
  );
}
