import React from 'react';

/**
 * Sticky footer pro primární akce na mobilu/tabletu (skrytý na sm+).
 */
export default function StickyActionBar({ children, className = '' }) {
  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 sm:hidden border-t border-slate-800 bg-slate-950/95 backdrop-blur-md p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${className}`}
    >
      <div className="max-w-[98vw] mx-auto flex flex-col gap-2">{children}</div>
    </div>
  );
}
