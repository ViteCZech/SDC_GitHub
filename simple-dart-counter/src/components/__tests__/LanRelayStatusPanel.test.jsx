// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import LanRelayStatusPanel from '../LanRelayStatusPanel';

describe('LanRelayStatusPanel', () => {
  it('ukáže IP, počet tabletů a TV URL když relay běží', () => {
    render(
      <LanRelayStatusPanel
        lang="cs"
        pin="1234"
        organizerCfg={{ host: '127.0.0.1', port: 8787, protocol: 'http' }}
        health={{ ok: true, port: 8787, addresses: ['192.168.10.4'], connectedTablets: 2 }}
      />
    );
    const panel = screen.getByTestId('lan-relay-status');
    expect(panel.getAttribute('data-running')).toBe('1');
    expect(panel.textContent).toContain('192.168.10.4:8787');
    expect(panel.textContent).toContain('2');
    expect(panel.textContent).toContain('/tv/1234');
  });

  it('při výpadku ukáže nápovědu ke startu serveru', () => {
    render(<LanRelayStatusPanel lang="cs" pin="1234" health={{ ok: false }} />);
    expect(screen.getByTestId('lan-relay-status').getAttribute('data-running')).toBe('0');
    expect(document.body.textContent).toContain('npm run lan-server');
  });
});
