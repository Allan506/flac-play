export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class UpstreamError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

export class PreviewOnlyError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'PreviewOnlyError';
    this.status = 422;
    this.details = details;
  }
}

export function toPublicError(error) {
  if (error instanceof HttpError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
    };
  }

  if (error instanceof PreviewOnlyError) {
    return {
      status: 422,
      body: {
        error: {
          code: 'PREVIEW_ONLY',
          message: error.message,
          details: error.details,
        },
      },
    };
  }

  if (error instanceof UpstreamError) {
    return {
      status: error.status,
      body: { error: { code: 'UPSTREAM_UNAVAILABLE', message: error.message } },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Algo falló en la cabina. Vuelve a intentarlo en unos segundos.',
      },
    },
  };
}
