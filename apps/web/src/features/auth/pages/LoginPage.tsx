import { SchoolLogo } from '@/components/common/SchoolLogo';
import { SITE } from '@/config/site';

/** Staff login (Admin & Teacher). Form + API wiring is the next Phase 1 step. */
export function LoginPage() {
  return (
    <div className="text-center">
      <SchoolLogo className="mx-auto h-14 w-14" />
      <h1 className="mt-4 text-2xl font-bold text-brand-navy">Staff Login</h1>
      <p className="mt-1 text-sm text-ink-muted">{SITE.name}</p>
      <p className="mt-6 text-sm text-ink-muted">Login form arrives with Phase 1 authentication.</p>
    </div>
  );
}
