import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('FLAC Play se encontró con un error inesperado.', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="fatal-error">
          <p className="eyebrow">FLAC PLAY · ERROR</p>
          <h1>La cabina se quedó en silencio.</h1>
          <p>Algo falló al dibujar la interfaz. Recarga la página para volver a empezar.</p>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>
            Recargar FLAC Play
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
