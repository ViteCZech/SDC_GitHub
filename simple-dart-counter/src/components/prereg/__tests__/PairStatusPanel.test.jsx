// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PairStatusPanel from '../PairStatusPanel';

vi.mock('../../../services/tournamentPreRegService', () => ({
  confirmPairApi: vi.fn(async () => ({})),
  declinePairApi: vi.fn(async () => ({})),
  listAvailablePartnersApi: vi.fn(async () => []),
  requestPairApi: vi.fn(async () => ({})),
}));

describe('PairStatusPanel', () => {
  it('zobrazí potvrzený pár bez akčních tlačítek', () => {
    render(
      <PairStatusPanel
        lang="cs"
        tournamentId="t1"
        registrationId="r1"
        registrationOpen
        pair={{ status: 'CONFIRMED', partnerName: 'Bo', canConfirm: false, canDecline: false }}
        onPairChange={() => {}}
      />
    );
    expect(screen.getByText('Dvojice je potvrzená.')).toBeTruthy();
    expect(screen.getByText('Bo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Potvrdit pár' })).toBeNull();
  });

  it('příchozí pozvánku lze potvrdit', async () => {
    const user = userEvent.setup();
    const onPairChange = vi.fn();
    const { confirmPairApi } = await import('../../../services/tournamentPreRegService');
    render(
      <PairStatusPanel
        lang="cs"
        tournamentId="t1"
        registrationId="r2"
        registrationOpen
        pair={{
          status: 'PENDING_INVITE',
          partnerName: 'Ada',
          canConfirm: true,
          canDecline: true,
          canRequestPartner: false,
        }}
        onPairChange={onPairChange}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Potvrdit pár' }));
    expect(confirmPairApi).toHaveBeenCalledWith('t1', 'r2');
    expect(onPairChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'CONFIRMED' }));
  });
});
