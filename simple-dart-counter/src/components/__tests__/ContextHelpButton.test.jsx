// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContextHelpButton from '../ContextHelpButton';

describe('ContextHelpButton', () => {
  it('po kliknutí předá topicId i returnRoute', async () => {
    const user = userEvent.setup();
    const onOpenContextHelp = vi.fn();
    window.history.replaceState(null, '', '/results/top?from=test#frag');

    render(
      <ContextHelpButton
        topicId="public-results"
        lang="cs"
        onOpenContextHelp={onOpenContextHelp}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Otevřít kontextovou nápovědu' }));

    expect(onOpenContextHelp).toHaveBeenCalledTimes(1);
    expect(onOpenContextHelp).toHaveBeenCalledWith('public-results', {
      returnRoute: '/results/top?from=test#frag',
    });
  });

  it('bez callbacku se nevykreslí', () => {
    const { container } = render(<ContextHelpButton topicId="x01-mode" lang="cs" />);
    expect(container.firstChild).toBeNull();
  });
});
