import React, { useMemo } from 'react';
import { clampDateTimeLocal } from '../../utils/preregAdmin';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTE_STEP = 5;
const MINUTES_BASE = Array.from({ length: 60 / MINUTE_STEP }, (_, i) =>
  String(i * MINUTE_STEP).padStart(2, '0')
);

/**
 * @param {string} value datetime-local "YYYY-MM-DDTHH:mm" nebo ""
 * @returns {{ date: string, hour: string, minute: string }}
 */
export function splitDateTimeLocal(value) {
  const raw = String(value ?? '');
  const date = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
  const time = raw.includes('T') ? raw.slice(11, 16) : '';
  const [h = '', m = ''] = time.split(':');
  return {
    date,
    hour: /^\d{1,2}$/.test(h) ? h.padStart(2, '0') : '',
    minute: /^\d{1,2}$/.test(m) ? m.padStart(2, '0') : '',
  };
}

/**
 * @param {string} date
 * @param {string} hour
 * @param {string} minute
 * @returns {string}
 */
export function joinDateTimeLocal(date, hour, minute) {
  if (!date) return '';
  const h = hour || '12';
  const m = minute || '00';
  return `${date}T${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

/**
 * Datum + čas (hodiny/minuty) místo nativního datetime-local,
 * který v prohlížeči často nabízí jen úzký rozsah časů kolem „teď“.
 *
 * @param {{
 *   value: string,
 *   onChange: (next: string) => void,
 *   disabled?: boolean,
 *   max?: string,
 *   min?: string,
 *   inputClassName?: string,
 *   dateLabel?: string,
 *   timeLabel?: string,
 * }} props
 */
export default function DateTimeLocalFields({
  value,
  onChange,
  disabled = false,
  max,
  min,
  inputClassName = '',
  dateLabel,
  timeLabel,
}) {
  const { date, hour, minute } = splitDateTimeLocal(value);
  const maxParts = splitDateTimeLocal(max);
  const minParts = splitDateTimeLocal(min);

  const hourOptions = useMemo(() => {
    let list = HOURS;
    if (date && maxParts.date === date && maxParts.hour) {
      list = list.filter((h) => h <= maxParts.hour);
    }
    if (date && minParts.date === date && minParts.hour) {
      list = list.filter((h) => h >= minParts.hour);
    }
    if (hour && !list.includes(hour)) {
      list = [...list, hour].sort();
    }
    return list;
  }, [date, hour, maxParts.date, maxParts.hour, minParts.date, minParts.hour]);

  const minuteOptions = useMemo(() => {
    let list = MINUTES_BASE;
    if (minute && !list.includes(minute)) {
      list = [...list, minute].sort();
    }
    if (date && maxParts.date === date && hour && hour === maxParts.hour && maxParts.minute) {
      list = list.filter((m) => m <= maxParts.minute);
    }
    if (date && minParts.date === date && hour && hour === minParts.hour && minParts.minute) {
      list = list.filter((m) => m >= minParts.minute);
    }
    if (minute && !list.includes(minute)) {
      list = [...list, minute].sort();
    }
    return list;
  }, [
    date,
    hour,
    minute,
    maxParts.date,
    maxParts.hour,
    maxParts.minute,
    minParts.date,
    minParts.hour,
    minParts.minute,
  ]);

  const selectCls = `${inputClassName} min-w-0`.trim();

  const emit = (nextDate, nextHour, nextMinute) => {
    const joined = joinDateTimeLocal(nextDate, nextHour, nextMinute);
    onChange(clampDateTimeLocal(joined, { min, max }));
  };

  const onDateChange = (nextDate) => {
    if (!nextDate) {
      onChange('');
      return;
    }
    emit(nextDate, hour || '12', minute || '00');
  };

  const onHourChange = (nextHour) => {
    if (!date) return;
    emit(date, nextHour, minute || '00');
  };

  const onMinuteChange = (nextMinute) => {
    if (!date) return;
    emit(date, hour || '12', nextMinute);
  };

  return (
    <div className="space-y-2">
      <div>
        {dateLabel ? (
          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            {dateLabel}
          </span>
        ) : null}
        <input
          type="date"
          value={date}
          min={minParts.date || undefined}
          max={maxParts.date || undefined}
          onChange={(e) => onDateChange(e.target.value)}
          className={inputClassName}
          disabled={disabled}
        />
      </div>
      <div>
        {timeLabel ? (
          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            {timeLabel}
          </span>
        ) : null}
        <div className="flex items-center gap-2">
          <select
            value={hour}
            onChange={(e) => onHourChange(e.target.value)}
            className={selectCls}
            disabled={disabled || !date}
            aria-label={timeLabel ? `${timeLabel} – hodiny` : 'Hodiny'}
          >
            <option value="">{disabled || !date ? '––' : 'HH'}</option>
            {hourOptions.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <span className="text-slate-400 font-mono text-sm shrink-0">:</span>
          <select
            value={minute}
            onChange={(e) => onMinuteChange(e.target.value)}
            className={selectCls}
            disabled={disabled || !date}
            aria-label={timeLabel ? `${timeLabel} – minuty` : 'Minuty'}
          >
            <option value="">{disabled || !date ? '––' : 'MM'}</option>
            {minuteOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
