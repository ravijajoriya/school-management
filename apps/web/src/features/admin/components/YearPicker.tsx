import type { AcademicYearItem } from '@school/shared';
import { Select } from '@/components/ui';

/** Academic-year dropdown; the active year is marked "(current)", draft years "(upcoming)". */
export function YearPicker({
  id,
  yearId,
  onChange,
  years,
}: {
  id?: string;
  yearId: string;
  onChange: (id: string) => void;
  years: AcademicYearItem[] | undefined;
}) {
  return (
    <Select
      id={id}
      className="max-w-[200px]"
      value={yearId}
      onChange={(e) => onChange(e.target.value)}
      aria-label={id ? undefined : 'Academic year'}
    >
      {years?.map((y) => (
        <option key={y.id} value={y.id}>
          {y.name}
          {y.isActive ? ' (current)' : y.status === 'DRAFT' ? ' (upcoming)' : ''}
        </option>
      ))}
    </Select>
  );
}
