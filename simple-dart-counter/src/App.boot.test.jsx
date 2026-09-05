// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App.jsx';

function installMatchMedia() {
  if (typeof window.matchMedia === 'function') return;
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  });
}

describe('App boot', () => {
  beforeEach(() => {
    installMatchMedia();
    window.localStorage.clear();
    document.documentElement.classList.remove('dark', 'light');
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('vykreslí domácí obrazovku místo prázdného rootu', async () => {
    const { container } = render(<App />);
    await waitFor(
      () => {
        expect(document.body.textContent).toMatch(/SIMPLE DART/i);
      },
      { timeout: 8000 }
    );
    expect(screen.getByText(/SIMPLE DART/i)).toBeTruthy();
    expect(container.querySelector('#root, .bg-slate-50, main')).toBeTruthy();
    expect(screen.queryByTestId('boot-crash-screen')).toBeNull();
  });

  it('uložený LAN relay neshodí start a nechá viditelnou home', async () => {
    window.localStorage.setItem(
      'sdcLanRelay',
      JSON.stringify({ host: '127.0.0.1', port: 8787, protocol: 'http' })
    );
    render(<App />);
    await waitFor(
      () => {
        expect(document.body.textContent).toMatch(/SIMPLE DART/i);
      },
      { timeout: 8000 }
    );
  });
});
