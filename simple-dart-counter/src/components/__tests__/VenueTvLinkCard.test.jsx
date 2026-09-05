// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VenueTvLinkCard from '../VenueTvLinkCard';

describe('VenueTvLinkCard', () => {
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
    expect(screen.getByRole('link', { name: /Otevřít TV/i }).getAttribute('href')).toContain('/tv/1234');
  });

  it('cloud + login označí odkaz jako připravený', () => {
    render(<VenueTvLinkCard lang="cs" pin="8061" isLoggedIn cloudEnabled />);
    expect(document.body.textContent).toContain('Televize se nepřihlašuje');
    expect(screen.getByRole('link', { name: /Otevřít TV/i }).getAttribute('href')).toContain('lang=cs');
  });

  it('LAN režim aktivuje TV bez Google loginu a použije LAN origin', () => {
    render(
      <VenueTvLinkCard
        lang="cs"
        pin="1234"
        lanEnabled
        origin="http://192.168.1.10:8787"
      />
    );
    expect(screen.queryByRole('button', { name: /Přihlásit se/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Otevřít TV/i }).getAttribute('href')).toContain(
      'http://192.168.1.10:8787/tv/1234'
    );
  });
});
