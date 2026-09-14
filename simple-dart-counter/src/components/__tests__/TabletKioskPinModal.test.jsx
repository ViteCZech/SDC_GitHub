import { render, screen, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TabletKioskPinModal from '../TabletKioskPinModal';

const typePin = async (user, pin) => {
  for (const d of pin) {
    await user.click(screen.getByRole('button', { name: d }));
  }
};

describe('TabletKioskPinModal', () => {
  it('zavřený modal nic nerenderuje', () => {
    const { container } = render(
      <TabletKioskPinModal open={false} expectedPin="1234" onSuccess={() => {}} onCancel={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('správný PIN volá onSuccess', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<TabletKioskPinModal open lang="cs" expectedPin="1234" onSuccess={onSuccess} onCancel={() => {}} />);
    await typePin(user, '1234');
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it('špatný PIN ukáže chybu a onSuccess nevolá', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<TabletKioskPinModal open lang="cs" expectedPin="1234" onSuccess={onSuccess} onCancel={() => {}} />);
    await typePin(user, '0000');
    await screen.findByText('Nesprávný PIN');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('po 3. neúspěchu zamkne klávesnici na 5 s', async () => {
    const user = userEvent.setup();
    render(<TabletKioskPinModal open lang="en" expectedPin="1234" onSuccess={() => {}} onCancel={() => {}} />);
    for (let i = 0; i < 3; i += 1) {
      await typePin(user, '0000');
      await screen.findByText('Incorrect PIN');
      await waitForElementToBeRemoved(() => screen.queryByText('Incorrect PIN'));
    }
    await screen.findByText(/Too many attempts/);
    expect(screen.getByRole('button', { name: '1', hidden: true })).toBeDisabled();
  }, 20000);

  it('Zrušit volá onCancel bez ověření', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onSuccess = vi.fn();
    render(<TabletKioskPinModal open lang="cs" expectedPin="1234" onSuccess={onSuccess} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Zrušit' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
