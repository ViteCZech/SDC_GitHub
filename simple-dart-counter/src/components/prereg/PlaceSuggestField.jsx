import React, { useMemo, useState } from 'react';
import { useListboxKeyboard } from '../../hooks/useListboxKeyboard';
import { filterPlaces } from '../../utils/preregPlaces';

/**
 * Textové pole s našeptávačem měst / krajů.
 * @param {{
 *   id: string,
 *   label: string,
 *   value: string,
 *   onChange: (value: string) => void,
 *   onPick?: (item: { name: string, hint?: string, region?: string }) => void,
 *   items: Array<{ name: string, hint?: string, region?: string }>,
 *   placeholder?: string,
 *   disabled?: boolean,
 *   inputClassName?: string,
 *   emptyOpen?: boolean,
 *   minChars?: number,
 * }} props
 */
export default function PlaceSuggestField({
  id,
  label,
  value,
  onChange,
  onPick,
  items,
  placeholder,
  disabled = false,
  inputClassName = '',
  emptyOpen = false,
  minChars = 1,
}) {
  const [open, setOpen] = useState(false);
  const listboxId = `${id}-suggestions`;

  const suggestions = useMemo(() => {
    const q = String(value ?? '').trim();
    if (!emptyOpen && q.length < minChars) return [];
    return filterPlaces(items, q, { emptyShowsAll: emptyOpen, limit: emptyOpen && !q ? 16 : 12 });
  }, [items, value, emptyOpen, minChars]);

  const suggestionsOpen = open && !disabled && suggestions.length > 0;

  const pick = (item) => {
    const name = String(item?.name ?? '').trim();
    onChange(name);
    onPick?.(item);
    setOpen(false);
  };

  const {
    highlightedIndex,
    setHighlightedIndex,
    setOptionRef,
  } = useListboxKeyboard({
    items: suggestions,
    isOpen: suggestionsOpen,
    onSelect: (item) => pick(item),
    onClose: () => setOpen(false),
    enabled: !disabled,
  });

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 180);
        }}
        className={inputClassName}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={suggestionsOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
      />
      {suggestionsOpen && (
        <ul
          id={listboxId}
          className="absolute z-30 top-full left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-600 bg-slate-800 shadow-xl"
          role="listbox"
        >
          {suggestions.map((item, index) => (
            <li key={`${item.name}-${index}`} role="option" aria-selected={highlightedIndex === index}>
              <button
                type="button"
                ref={(el) => setOptionRef(index, el)}
                className={`w-full px-3 py-2 text-left flex justify-between gap-2 items-center ${
                  highlightedIndex === index ? 'bg-emerald-900/50' : 'hover:bg-emerald-900/40'
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(item)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <span className="font-medium text-white truncate">{item.name}</span>
                {item.hint ? (
                  <span className="text-[10px] text-slate-400 shrink-0">{item.hint}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
