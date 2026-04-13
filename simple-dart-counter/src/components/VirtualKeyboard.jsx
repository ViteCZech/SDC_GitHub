import React, { useState, useEffect, useRef } from 'react';
import { Delete } from 'lucide-react';
import { translations } from '../translations';

/**
 * Interní klávesnice (CS/EN/PL + diakritika). Fyzická klávesnice zůstává funkční (keydown handler).
 */
export default function VirtualKeyboard({ onChar, onDelete, onClose, onEnter, lang }) {
  const t = (k) => translations[lang]?.[k] || k;
  const [popup, setPopup] = useState(null);
  const timerRef = useRef(null);
  const pressedRef = useRef(false);
  const specialCharsByLang = {
    cs: {
      A: ['Á'],
      C: ['Č'],
      D: ['Ď'],
      E: ['É', 'Ě'],
      I: ['Í'],
      N: ['Ň'],
      O: ['Ó'],
      R: ['Ř'],
      S: ['Š'],
      T: ['Ť'],
      U: ['Ú', 'Ů'],
      Y: ['Ý'],
      Z: ['Ž'],
    },
    pl: {
      A: ['Ą'],
      C: ['Ć'],
      E: ['Ę'],
      L: ['Ł'],
      N: ['Ń'],
      O: ['Ó'],
      S: ['Ś'],
      Z: ['Ź', 'Ż'],
    },
    en: {},
  };
  const specialChars = specialCharsByLang[lang] || {};

  const rows = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Y', 'X', 'C', 'V', 'B', 'N', 'M'],
  ];
  if (lang === 'en' || lang === 'pl') {
    rows[1][5] = 'Y';
    rows[3][0] = 'Z';
  }

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
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === ',' || e.key === ';' || e.key === '!') onChar(e.key);
        else onChar(e.key.toUpperCase());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onChar, onDelete, onClose, onEnter]);

  const handleDown = (char) => {
    if (popup) return;
    pressedRef.current = true;
    if (specialChars[char]) {
      timerRef.current = setTimeout(() => {
        if (pressedRef.current) {
          setPopup({ char, variants: specialChars[char] });
          pressedRef.current = false;
        }
      }, 400);
    }
  };

  const handleUp = (char) => {
    clearTimeout(timerRef.current);
    if (pressedRef.current) {
      onChar(char);
      pressedRef.current = false;
    }
  };

  return (
    <>
      {popup && <div className="fixed inset-0 z-[5600]" onClick={() => setPopup(null)} />}
      <div className="fixed bottom-0 left-0 w-full bg-slate-900 border-t border-slate-700 p-1.5 sm:p-2 pb-4 sm:pb-6 landscape:pb-2 z-[5500] shadow-2xl animate-in slide-in-from-bottom duration-200 select-none">
        <div className="flex items-center justify-end max-w-lg p-2 landscape:p-1.5 mx-auto mb-2 landscape:mb-1 border-b rounded-t-lg shadow-sm bg-slate-800 border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 landscape:px-4 landscape:py-1 bg-slate-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-black transition-colors shadow-sm"
          >
            {t('kbdDone')}
          </button>
        </div>
        <div className="flex flex-col gap-1 landscape:gap-0.5 max-w-lg mx-auto relative z-[5510]">
          {rows.map((row, i) => (
            <div key={i} className="flex justify-center gap-1 landscape:gap-0.5">
              {row.map((char) => (
                <div key={char} className="relative flex-1 max-w-[40px] landscape:max-w-[36px]">
                  {popup && popup.char === char && (
                    <div className="absolute flex p-1 mb-2 duration-100 -translate-x-1/2 border rounded-lg shadow-xl bottom-full left-1/2 bg-slate-800 border-slate-600 animate-in zoom-in">
                      {popup.variants.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onChar(v);
                            setPopup(null);
                          }}
                          className="w-10 h-10 landscape:w-9 landscape:h-9 text-lg landscape:text-base font-bold text-white rounded sm:h-12 hover:bg-emerald-600"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      handleDown(char);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      handleUp(char);
                    }}
                    onPointerLeave={() => {
                      clearTimeout(timerRef.current);
                      pressedRef.current = false;
                    }}
                    className={`w-full h-9 sm:h-12 landscape:h-8 bg-slate-800 text-white font-bold rounded shadow border-b-2 border-slate-950 active:translate-y-0.5 active:border-b-0 active:bg-slate-700 transition-all text-xs sm:text-base landscape:text-[11px] ${
                      popup && popup.char === char ? 'bg-slate-700' : ''
                    }`}
                  >
                    {char}
                  </button>
                </div>
              ))}
            </div>
          ))}
          <div className="flex justify-center gap-1 mt-1 flex-wrap">
            <button
              type="button"
              onClick={() => onChar(',')}
              className="w-11 sm:w-12 bg-slate-800 text-slate-300 font-bold rounded shadow border-b-2 border-slate-950 active:translate-y-0.5 py-2 landscape:py-1.5 text-sm"
            >
              ,
            </button>
            <button
              type="button"
              onClick={() => onChar(';')}
              className="w-11 sm:w-12 bg-slate-800 text-slate-300 font-bold rounded shadow border-b-2 border-slate-950 active:translate-y-0.5 py-2 landscape:py-1.5 text-sm"
            >
              ;
            </button>
            <button
              type="button"
              onClick={() => onChar('!')}
              className="w-11 sm:w-12 bg-slate-800 text-slate-300 font-bold rounded shadow border-b-2 border-slate-950 active:translate-y-0.5 py-2 landscape:py-1.5 text-sm"
            >
              !
            </button>
            <button
              type="button"
              onClick={() => onChar(' ')}
              className="flex-1 min-w-[140px] max-w-[240px] bg-slate-800 text-slate-400 font-bold rounded shadow border-b-2 border-slate-950 active:translate-y-0.5 active:border-b-0 active:bg-slate-700 py-2 sm:py-3 landscape:py-1.5 text-xs uppercase tracking-widest"
            >
              {t('kbdSpace')}
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="w-[72px] sm:w-20 bg-red-900/30 text-red-400 font-bold rounded shadow border-b-2 border-slate-950 active:translate-y-0.5 active:border-b-0 active:bg-red-900/50 flex items-center justify-center"
            >
              <Delete className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
