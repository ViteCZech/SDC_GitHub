import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { AdminTapTextField } from './AdminTapField';

function clampInt(val, min, max) {
  const n = Math.floor(Number(val));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

const stepBtnCls =
  'flex min-w-[44px] min-h-[44px] w-11 shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100';

const inputCls =
  'flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-center font-mono text-lg font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/50';

/**
 * Stepper ± pro číselné hodnoty (tablet-friendly).
 * @param {{
 *   value: number|string,
 *   onChange: (next: number|string) => void,
 *   min?: number,
 *   max?: number,
 *   step?: number,
 *   disabled?: boolean,
 *   allowEmpty?: boolean,
 *   useAdminTap?: boolean,
 *   quickValues?: number[]|null,
 *   hint?: string|null,
 *   className?: string,
 *   inputClassName?: string,
 *   decreaseLabel?: string,
 *   increaseLabel?: string,
 * }} props
 */
export default function NumericStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  disabled = false,
  allowEmpty = false,
  useAdminTap = false,
  quickValues = null,
  hint = null,
  className = '',
  inputClassName = '',
  decreaseLabel = 'Snížit',
  increaseLabel = 'Zvýšit',
}) {
  const isEmpty = allowEmpty && (value === '' || value == null);
  const num = isEmpty ? null : clampInt(value, min, max);

  const apply = (next) => {
    if (allowEmpty && next === '') {
      onChange('');
      return;
    }
    onChange(clampInt(next, min, max));
  };

  const current = num ?? min;
  const atMin = !isEmpty && current <= min;
  const atMax = !isEmpty && current >= max;

  const handleText = (text) => {
    if (text === '') {
      if (allowEmpty) onChange('');
      else apply(min);
      return;
    }
    const digits = String(text).replace(/\D/g, '');
    if (digits === '') {
      if (allowEmpty) onChange('');
      return;
    }
    apply(parseInt(digits, 10));
  };

  const display = isEmpty ? '' : String(num);

  return (
    <div className={className}>
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          aria-label={decreaseLabel}
          disabled={disabled || atMin}
          onClick={() => apply(current - step)}
          className={stepBtnCls}
        >
          <Minus className="w-5 h-5" strokeWidth={2.5} />
        </button>

        {useAdminTap ? (
          <AdminTapTextField
            value={display}
            onValueChange={handleText}
            filterChar={(c) => /^\d$/.test(c)}
            keyboardMode="numeric"
            className={`${inputCls} ${inputClassName} cursor-pointer`}
            disabled={disabled}
          />
        ) : (
          <input
            type="text"
            inputMode="numeric"
            value={display}
            disabled={disabled}
            onChange={(e) => handleText(e.target.value)}
            className={`${inputCls} ${inputClassName}`}
          />
        )}

        <button
          type="button"
          aria-label={increaseLabel}
          disabled={disabled || atMax}
          onClick={() => apply(current + step)}
          className={stepBtnCls}
        >
          <Plus className="w-5 h-5" strokeWidth={2.5} />
        </button>
      </div>

      {Array.isArray(quickValues) && quickValues.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {quickValues.map((qv) => {
            const active = !isEmpty && num === qv;
            return (
              <button
                key={qv}
                type="button"
                disabled={disabled}
                onClick={() => apply(qv)}
                className={`min-h-[36px] px-3 rounded-lg text-sm font-bold border transition-colors ${
                  active
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {qv}
              </button>
            );
          })}
        </div>
      )}

      {hint ? <p className="text-xs text-slate-500 mt-1.5">{hint}</p> : null}
    </div>
  );
}
