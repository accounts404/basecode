import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    const msg = error?.message || String(error);
    const isTraffic = /traffic volume limit|rate limit|limite de lectura/i.test(msg);
    return {
      hasError: true,
      message: isTraffic
        ? 'Se alcanzó el límite de lecturas de datos. Espera unos segundos e inténtalo de nuevo.'
        : 'Ocurrió un error al cargar esta página.',
    };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Error capturado:', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: '' });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">No se pudo cargar la página</h2>
            <p className="text-slate-600 mb-6">{this.state.message}</p>
            <div className="flex gap-3 justify-center">
              <Button onClick={this.handleRetry} variant="default">
                <RefreshCw className="w-4 h-4 mr-2" />
                Reintentar
              </Button>
              <Button onClick={this.handleReload} variant="outline">
                Recargar app
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}