import React from 'react';

/**
 * Scrollovatelný layout pro modul předregistrace (mobil na výšku / notebook na šířku).
 * @param {{ children: React.ReactNode, wide?: boolean, className?: string }} props
 */
export default function PreRegPageShell({ children, wide = true, className = '' }) {
  return (
    <main className="flex flex-col flex-1 w-full min-h-0 overflow-y-auto overflow-x-hidden bg-slate-950">
      <div
        className={`w-full mx-auto px-3 sm:px-6 py-4 pb-24 sm:pb-28 min-h-0 ${wide ? 'max-w-[98vw] xl:max-w-7xl' : 'max-w-2xl'} ${className}`}
      >
        {children}
      </div>
    </main>
  );
}
