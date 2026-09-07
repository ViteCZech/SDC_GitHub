// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VenueTvLinkCard from '../VenueTvLinkCard';
import { __resetVenueTvWindowForTests } from '../../utils/venueTvWindow';

describe('VenueTvLinkCard', () => {
  const setupWindowOpen = () => {
    const popup = {
      closed: false,
      focus: vi.fn(),
      close: vi.fn(function close() {
        popup.closed = true;
      }),
      location: { href: '' },
      opener: null,
    };
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => popup);
    return { popup, openSpy };
  };

  beforeEach(() => {
    __resetVenueTvWindowForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetVenueTvWindowForTests();
  });

  it('bez přihlášení ukáže, že TV není aktivní, a nabídne login', async () => {
    const onGoogleLogin = vi.fn();
    const user = userEvent.setup();
    render(
      <VenueTvLinkCard lang="cs" pin="1234" isLoggedIn={false} onGoogleLogin={onGoogleLogin} />
    );
    expect(screen.getByText('TV obrazovka haly')).toBeTruthy();
    expect(document.body.textContent).toContain('Přihlaste se');
    expect(document.body.textContent).toContain('/tv/1234');
    await user.click(screen.getByRole('button', { name: /Přihlásit/ }));
    expect(onGoogleLogin).toHaveBeenCalledTimes(1);
  });

  it('přihlášený bez cloudu vidí odkaz a upozornění, že ještě není aktivní', () => {
    render(<VenueTvLinkCard lang="cs" pin="1234" isLoggedIn cloudEnabled={false} />);
    expect(document.body.textContent).toContain('síťovou hru');
    expect(screen.queryByRole('button', { name: /Přihlásit se/ })).toBeNull();
    expect(document.body.textContent).toContain('/tv/1234');
  });

  it('cloud + login otevře TV togglem a druhý klik ji zavře', async () => {
    const user = userEvent.setup();
    const { popup, openSpy } = setupWindowOpen();
    render(<VenueTvLinkCard lang="cs" pin="8061" isLoggedIn cloudEnabled />);
    expect(document.body.textContent).toContain('Televize se nepřihlašuje');
    await user.click(screen.getByRole('button', { name: /Otevřít TV/i }));
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(String(openSpy.mock.calls[0]?.[0] || '')).toContain('/tv/8061');
    expect(String(openSpy.mock.calls[0]?.[0] || '')).toContain('lang=cs');
    expect(screen.getByRole('button', { name: /Zavřít TV/i })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Zavřít TV/i }));
    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Otevřít TV/i })).toBeTruthy();
  });

  it('LAN režim aktivuje TV bez Google loginu a použije LAN origin', async () => {
    const user = userEvent.setup();
    const { openSpy } = setupWindowOpen();
    render(
      <VenueTvLinkCard
        lang="cs"
        pin="1234"
        lanEnabled
        origin="http://192.168.1.10:8787"
      />
    );
    expect(screen.queryByRole('button', { name: /Přihlásit se/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Otevřít TV/i }));
    expect(String(openSpy.mock.calls[0]?.[0] || '')).toContain('http://192.168.1.10:8787/tv/1234');
  });
});
