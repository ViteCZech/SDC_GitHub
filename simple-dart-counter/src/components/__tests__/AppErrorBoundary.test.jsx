// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppErrorBoundary, BootCrashScreen } from '../AppErrorBoundary';

describe('AppErrorBoundary', () => {
  it('po render chybě ukáže záchrannou obrazovku a retry', async () => {
    const Boom = () => {
      throw new Error('SDC_STALE_CHUNK');
    };
    const onRetry = vi.fn();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <AppErrorBoundary autoRecover={false} onRetry={onRetry}>
        <Boom />
      </AppErrorBoundary>
    );
    expect(screen.getByTestId('boot-crash-screen')).toBeTruthy();
    expect(document.body.textContent).toMatch(/Nová verze aplikace/);
    await userEvent.click(screen.getByTestId('boot-crash-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('BootCrashScreen pro obecnou chybu', () => {
    render(<BootCrashScreen error={new Error('boom')} onRetry={() => {}} />);
    expect(document.body.textContent).toMatch(/Aplikace se nenačetla/);
  });
});
