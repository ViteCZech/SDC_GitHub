// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetVenueTvWindowForTests,
  closeVenueTvWindow,
  isVenueTvWindowOpen,
  openVenueTvWindow,
  toggleVenueTvWindow,
} from '../venueTvWindow';

function createPopupMock() {
  const popup = {
    closed: false,
    focus: vi.fn(),
    close: vi.fn(function close() {
      popup.closed = true;
    }),
    location: { href: '' },
    opener: null,
  };
  return popup;
}

describe('venueTvWindow', () => {
  beforeEach(() => {
    __resetVenueTvWindowForTests();
    vi.restoreAllMocks();
  });

  it('openVenueTvWindow otevře jedno sdílené okno', () => {
    const popup = createPopupMock();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => popup);

    const first = openVenueTvWindow('https://example.test/tv/1234?lang=cs');
    const second = openVenueTvWindow('https://example.test/tv/1234?lang=en');

    expect(first.action).toBe('opened');
    expect(second.action).toBe('focused');
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(popup.focus).toHaveBeenCalled();
    expect(isVenueTvWindowOpen()).toBe(true);
  });

  it('toggleVenueTvWindow přepíná otevřít/zavřít', () => {
    const popup = createPopupMock();
    vi.spyOn(window, 'open').mockImplementation(() => popup);

    const opened = toggleVenueTvWindow('https://example.test/tv/4321');
    const closed = toggleVenueTvWindow('https://example.test/tv/4321');

    expect(opened.action).toBe('opened');
    expect(closed.action).toBe('closed');
    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(isVenueTvWindowOpen()).toBe(false);
  });

  it('closeVenueTvWindow vrátí already_closed pokud nic neběží', () => {
    const out = closeVenueTvWindow();
    expect(out.action).toBe('already_closed');
    expect(out.isOpen).toBe(false);
  });
});
