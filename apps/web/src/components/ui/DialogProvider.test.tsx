import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useConfirm, usePrompt } from '@/lib/dialogs';
import { DialogProvider } from './DialogProvider';

function Harness() {
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [result, setResult] = useState('none');
  return (
    <>
      <button
        onClick={async () =>
          setResult(
            String(
              await confirm({ title: 'Delete this?', tone: 'danger', confirmLabel: 'Delete' }),
            ),
          )
        }
      >
        ask
      </button>
      <button
        onClick={async () =>
          setResult(
            String(await prompt({ title: 'Reopen', label: 'Reason', confirmLabel: 'Reopen' })),
          )
        }
      >
        prompt
      </button>
      <output>{result}</output>
    </>
  );
}

describe('DialogProvider', () => {
  it('resolves a confirm with true or false', async () => {
    render(
      <DialogProvider>
        <Harness />
      </DialogProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByText('ask'));
    const dialog = screen.getByRole('dialog', { name: 'Delete this?' });
    expect(dialog).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('true')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByText('ask'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('false')).toBeInTheDocument();
  });

  it('returns the typed value from a prompt and requires input', async () => {
    render(
      <DialogProvider>
        <Harness />
      </DialogProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByText('prompt'));
    const ok = screen.getByRole('button', { name: 'Reopen' });
    expect(ok).toBeDisabled();
    await user.type(screen.getByLabelText(/Reason/), 'HRA correction{Enter}');
    expect(await screen.findByText('HRA correction')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
