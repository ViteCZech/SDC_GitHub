import React, { useEffect } from 'react';
import { Delete } from 'lucide-react';
import { translations } from '../translations';

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', ''],
];

/**
 * Kompaktní numerická klávesnice pro admin tablety.
 */
export default function NumericKeyboard({ onChar, onDelete, onClose, onEnter, lang }) {
  const t = (k) => translations[lang]?.[k] || k;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Backspace') {
        e.preventDefault();
        onDelete();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (typeof onEnter === 'function') onEnter();
        else onClose();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (/^\d$/.test(e.key)) {
        e.preventDefault();
        onChar(e.key);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onChar, onDelete, onClose, onEnter]);

  const keyCls =
    'flex h-12 min-w-[64px] flex-1 items-center justify-center rounded-xl bg-slate-800 text-white text-xl font-black shadow border-b-2 border-slate-950 active:translate-y-0.5 active:border-b-0 active:bg-slate-700 transition-all';

  return (
    <div className="fixed bottom-0 left-0 w-full bg-slate-900 border-t border-slate-700 p-2 pb-4 landscape:pb-2 z-[5500] shadow-2xl animate-in slide-in-from-bottom duration-200 select-none">
      <div className="flex items-center justify-end max-w-sm mx-auto mb-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition-colors"
        >
          {t('kbdDone')}
        </button>
      </div>
      <div className="flex flex-col gap-1.5 max-w-sm mx-auto">
        {ROWS.map((row, ri) => (
          <div key={ri} className="flex justify-center gap-1.5">
            {row.map((char, ci) =>
              char === '' ? (
                <span key={`${ri}-${ci}`} className="flex-1 min-w-[64px]" aria-hidden />
              ) : (
                <button
                  key={char}
                  type="button"
                  onClick={() => onChar(char)}
                  className={keyCls}
                >
                  {char}
                </button>
              )
            )}
          </div>
        ))}
        <div className="flex justify-center gap-1.5 mt-0.5">
          <button type="button" onClick={onDelete} className={`${keyCls} max-w-[140px] text-red-400 bg-red-950/30`}>
            <Delete className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
