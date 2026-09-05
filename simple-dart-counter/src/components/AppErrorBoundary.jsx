import React from 'react';
import { isLikelyStaleAssetError, recoverFromStaleAssets } from '../utils/staleAssetRecovery';

export function BootCrashScreen({ error, onRetry }) {
  const stale = isLikelyStaleAssetError(error);
  return (
    <div
      className="bg-slate-950 text-slate-100 w-full h-[100dvh] flex flex-col items-center justify-center gap-4 p-6 text-center"
      role="alert"
      data-testid="boot-crash-screen"
    >
      <div className="w-16 h-16 rounded-full bg-emerald-600 flex items-center justify-center text-slate-950 font-black tracking-widest">
        SDC
      </div>
      <h1 className="text-lg font-black tracking-widest uppercase">
        {stale ? 'Nová verze aplikace' : 'Aplikace se nenačetla'}
      </h1>
      <p className="max-w-sm text-sm text-slate-400 leading-relaxed">
        {stale
          ? 'Po aktualizaci se nenačetl nový kód (často kvůli staré PWA cache). Načtěte stránku znovu.'
          : 'Start se nezdařil. Zkuste znovu načíst. Pokud problém trvá, vymažte data webu / PWA a otevřete aplikaci znovu.'}
      </p>
      <button
        type="button"
        data-testid="boot-crash-retry"
        onClick={() => {
          void (onRetry?.() ?? recoverFromStaleAssets());
        }}
        className="mt-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black tracking-widest uppercase text-sm"
      >
        Načíst znovu
      </button>
    </div>
  );
}

export class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('SDC boot error', error);
    if (this.props.autoRecover !== false && isLikelyStaleAssetError(error)) {
      void recoverFromStaleAssets();
    }
  }

  render() {
    if (this.state.error) {
      return <BootCrashScreen error={this.state.error} onRetry={this.props.onRetry} />;
    }
    return this.props.children;
  }
}
