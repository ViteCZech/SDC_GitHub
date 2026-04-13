import React, { useContext } from 'react';
import { AdminVirtualKeyboardContext } from '../context/AdminVirtualKeyboardContext';

/**
 * Textové pole pro administrátora: otevře interní klávesnici (bez systémové na mobilu).
 * Mimo AdminVirtualKeyboardProvider spadne zpět na běžný <input>.
 */
export function AdminTapTextField({
  value,
  onValueChange,
  placeholder,
  className = '',
  disabled,
  filterChar,
  readOnly,
  type = 'text',
  min,
  max,
  name,
  id,
  /** Při systémové klávesnici: Enter = potvrzení (volitelně uložení); výchozí je blur pole. */
  onEnterPress,
  /** Ref na nativní input nebo tlačítko (focus / programové otevření klávesnice). */
  fieldRef,
}) {
  const vk = useContext(AdminVirtualKeyboardContext);
  const useInternalVk = vk?.internalKeyboardEnabled !== false && typeof vk?.openKeyboard === 'function';

  const open = () => {
    if (disabled || readOnly || !useInternalVk) return;
    let buf = String(value ?? '');
    vk.openKeyboard({
      onAppend: (c) => {
        if (filterChar && !filterChar(c)) return;
        buf += c;
        onValueChange(buf);
      },
      onDelete: () => {
        buf = buf.slice(0, -1);
        onValueChange(buf);
      },
      onClose: () => {},
      onEnterPress: typeof onEnterPress === 'function' ? () => onEnterPress() : undefined,
    });
  };

  if (!useInternalVk) {
    return (
      <input
        ref={fieldRef}
        id={id}
        name={name}
        type={type}
        min={min}
        max={max}
        value={value ?? ''}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (typeof onEnterPress === 'function') {
            onEnterPress(e);
          } else {
            e.currentTarget.blur();
          }
        }}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        readOnly={readOnly}
      />
    );
  }

  return (
    <button
      type="button"
      ref={fieldRef}
      id={id}
      name={name}
      disabled={disabled}
      onClick={open}
      className={`${className} cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <span className={`block w-full truncate text-left ${value ? '' : 'text-slate-500'}`}>
        {value !== '' && value != null ? value : placeholder || '\u00a0'}
      </span>
    </button>
  );
}
