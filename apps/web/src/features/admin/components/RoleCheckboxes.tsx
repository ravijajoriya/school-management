import type { RoleItem } from '@school/shared';
import { Checkbox } from '@/components/ui';

/** Multi-select of roles as checkboxes; value is the list of selected role ids. */
export function RoleCheckboxes({
  roles,
  value,
  onChange,
  disabled,
}: {
  roles: RoleItem[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...value, id] : value.filter((v) => v !== id));
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {roles.map((role) => (
        <Checkbox
          key={role.id}
          label={role.name}
          description={role.description ?? role.code}
          checked={value.includes(role.id)}
          disabled={disabled}
          onChange={(e) => toggle(role.id, e.target.checked)}
        />
      ))}
    </div>
  );
}
