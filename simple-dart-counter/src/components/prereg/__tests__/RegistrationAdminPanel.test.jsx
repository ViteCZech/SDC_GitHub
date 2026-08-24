// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegistrationAdminPanel from '../RegistrationAdminPanel';

let registrationsState = [];
const listeners = new Set();

const emitRegistrations = () => {
  const snapshot = registrationsState.map((row) => ({
    ...row,
    player: { ...(row.player || {}) },
    payment: { ...(row.payment || {}) },
  }));
  listeners.forEach((cb) => cb(snapshot));
};

vi.mock('../../../services/tournamentPreRegService', () => ({
  cancelRegistration: vi.fn(async (_tournamentId, regId) => {
    registrationsState = registrationsState.map((reg) =>
      reg.id === regId
        ? {
            ...reg,
            status: 'CANCELLED',
            cancelledBy: 'ADMIN',
          }
        : reg
    );
    emitRegistrations();
  }),
  createManualRegistration: vi.fn(),
  deletePreRegTournament: vi.fn(),
  getAdminInviteLinkForTournament: vi.fn(async () => 'https://example.test/invite'),
  getOwnerTournamentData: vi.fn(async () => ({
    id: 't1',
    status: 'REGISTRATION_OPEN',
    meta: {
      name: 'Test turnaj',
      competitionType: 'singles',
      capacity: 32,
      waitlistEnabled: true,
    },
    finance: {
      entryFee: 0,
      paymentMethods: ['CASH'],
      feeMode: 'split',
    },
    admin: {
      ownerUid: 'u1',
      coAdminUids: [],
    },
    counters: {
      confirmed: 1,
      waitlist: 0,
      pendingPayment: 0,
      confirmedTeams: 0,
    },
  })),
  listenToRegistrations: vi.fn((_tournamentId, callback) => {
    listeners.add(callback);
    callback(registrationsState);
    return () => listeners.delete(callback);
  }),
  markRegistrationPaid: vi.fn(),
  markRegistrationRefunded: vi.fn(),
  restoreCancelledRegistration: vi.fn(async (_tournamentId, regId, targetStatus) => {
    const status = targetStatus === 'PENDING_PAYMENT' ? 'PENDING_PAYMENT' : 'CONFIRMED';
    registrationsState = registrationsState.map((reg) =>
      reg.id === regId
        ? {
            ...reg,
            status,
            cancelledBy: null,
            cancelledAt: null,
          }
        : reg
    );
    emitRegistrations();
    return { status };
  }),
  toggleRegistrationCheckIn: vi.fn(),
  adminConfirmPair: vi.fn(),
}));

vi.mock('../../../utils/csoRanking', () => ({
  loadCsoRanking: vi.fn(async () => ({ players: [] })),
  resolvePlayerLiveRankFromLists: vi.fn(() => null),
}));

describe('RegistrationAdminPanel', () => {
  beforeEach(() => {
    listeners.clear();
    registrationsState = [
      {
        id: 'reg-1',
        status: 'CONFIRMED',
        player: { name: 'Adam Novak' },
        payment: { isPaid: false, method: 'CASH' },
        attendance: { checkedIn: false },
      },
    ];
  });

  it('po obnově nepřepne filtr tak, aby další storno hráče skrylo', async () => {
    const user = userEvent.setup();
    render(
      <RegistrationAdminPanel
        lang="en"
        tournamentId="t1"
        user={{ uid: 'u1', isAnonymous: false }}
        onBack={() => {}}
        onImportToSetup={() => {}}
      />
    );

    expect(await screen.findByText('Adam Novak')).toBeTruthy();

    await user.click(screen.getByTitle('Cancel registration'));
    expect(await screen.findByText('Cancelled / Rejected')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Restore registration' }));
    const confirmButtons = await screen.findAllByRole('button', { name: 'Confirmed' });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(screen.getByText('Adam Novak')).toBeTruthy());
    await user.click(screen.getByTitle('Cancel registration'));

    await waitFor(() => expect(screen.getByText('Cancelled / Rejected')).toBeTruthy());
    expect(screen.getByText('Adam Novak')).toBeTruthy();
  });
});
