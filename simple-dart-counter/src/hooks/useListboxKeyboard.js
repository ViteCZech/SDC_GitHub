import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Klávesnicová navigace v rozevíracím listboxu (šipky, Enter, Escape, Home/End).
 * Funguje i když focus není na položce (PC input i interní VK přes window capture).
 *
 * @param {{
 *   items: unknown[],
 *   isOpen: boolean,
 *   onSelect: (item: unknown, index: number) => void,
 *   onClose?: () => void,
 *   enabled?: boolean,
 * }} options
 */
export function useListboxKeyboard({
  items,
  isOpen,
  onSelect,
  onClose,
  enabled = true,
}) {
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const optionRefs = useRef([]);
  const itemsRef = useRef(items);
  const onSelectRef = useRef(onSelect);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    itemsRef.current = items;
    onSelectRef.current = onSelect;
    onCloseRef.current = onClose;
  }, [items, onSelect, onClose]);

  useEffect(() => {
    if (!isOpen || !items.length) {
      setHighlightedIndex(-1);
      return;
    }
    setHighlightedIndex(0);
  }, [isOpen, items]);

  useEffect(() => {
    if (highlightedIndex < 0) return;
    const el = optionRefs.current[highlightedIndex];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const setOptionRef = useCallback((index, el) => {
    optionRefs.current[index] = el;
  }, []);

  const onKeyDown = useCallback(
    (e) => {
      if (!enabled || !isOpen) return false;
      const list = itemsRef.current;
      if (!list.length) return false;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setHighlightedIndex((i) => {
          const cur = i < 0 ? -1 : i;
          return Math.min(cur + 1, list.length - 1);
        });
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setHighlightedIndex((i) => {
          const cur = i < 0 ? 0 : i;
          return Math.max(cur - 1, 0);
        });
        return true;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        e.stopPropagation();
        setHighlightedIndex(0);
        return true;
      }
      if (e.key === 'End') {
        e.preventDefault();
        e.stopPropagation();
        setHighlightedIndex(list.length - 1);
        return true;
      }
      if (e.key === 'Enter') {
        const idx = highlightedIndex >= 0 ? highlightedIndex : 0;
        const item = list[idx];
        if (item != null) {
          e.preventDefault();
          e.stopPropagation();
          onSelectRef.current?.(item, idx);
          return true;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current?.();
        return true;
      }
      return false;
    },
    [enabled, isOpen, highlightedIndex]
  );

  useEffect(() => {
    if (!enabled || !isOpen) return undefined;
    const handler = (e) => {
      onKeyDown(e);
    };
    // capture: dřív než VirtualKeyboard / jiné window handlery
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [enabled, isOpen, onKeyDown]);

  return {
    highlightedIndex,
    setHighlightedIndex,
    setOptionRef,
    onKeyDown,
  };
}
