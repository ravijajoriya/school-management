import { useState } from 'react';
import { Alert, Button, Modal } from '@/components/ui';

/** Shows a generated temporary password exactly once, with a copy button. */
export function TemporaryPasswordModal({
  open,
  onClose,
  userName,
  password,
}: {
  open: boolean;
  onClose: () => void;
  userName: string;
  password: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Temporary password"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        <p className="text-sm text-ink">
          Share this password with <strong>{userName}</strong> in person or by phone. They will be
          asked to choose a new password when they first sign in.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md border border-gray-300 bg-surface px-3 py-2 text-center font-mono text-lg tracking-wider text-brand-navy">
            {password}
          </code>
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(password);
              setCopied(true);
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <Alert tone="warning">This password will not be shown again.</Alert>
      </div>
    </Modal>
  );
}
