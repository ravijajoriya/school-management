import {
  BLOOD_GROUPS,
  GENDER_LABELS,
  GENDERS,
  type AcademicYearItem,
  type CreateStudentInput,
} from '@school/shared';
import type { UseFormRegister } from 'react-hook-form';
import { Field, Input, Select } from '@/components/ui';
import { YearPicker } from '../components/YearPicker';
import { useSectionOptions } from '../people-api';

type FieldErrors = Record<string, { message?: string } | undefined>;

/** Name, birth date, gender, blood group and admission number. */
export function StudentFields({
  register,
  errors,
}: {
  register: UseFormRegister<CreateStudentInput>;
  errors: FieldErrors;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="First name" htmlFor="st-first" error={errors.firstName?.message} required>
        <Input id="st-first" {...register('firstName')} />
      </Field>
      <Field label="Middle name" htmlFor="st-mid">
        <Input id="st-mid" {...register('middleName')} />
      </Field>
      <Field label="Last name" htmlFor="st-last">
        <Input id="st-last" {...register('lastName')} />
      </Field>
      <Field label="Date of birth" htmlFor="st-dob" error={errors.dateOfBirth?.message} required>
        <Input id="st-dob" type="date" {...register('dateOfBirth')} />
      </Field>
      <Field label="Gender" htmlFor="st-gender">
        <Select id="st-gender" {...register('gender')}>
          <option value="">—</option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {GENDER_LABELS[g]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Blood group" htmlFor="st-blood">
        <Select id="st-blood" {...register('bloodGroup')}>
          <option value="">—</option>
          {BLOOD_GROUPS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Admission number"
        htmlFor="st-adm"
        error={errors.admissionNumber?.message}
        hint="Leave empty to generate"
      >
        <Input id="st-adm" {...register('admissionNumber')} />
      </Field>
    </div>
  );
}

export function AddressFields({
  register,
  errors,
}: {
  register: UseFormRegister<CreateStudentInput>;
  errors: FieldErrors;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Address line 1" htmlFor="st-a1">
        <Input id="st-a1" {...register('addressLine1')} />
      </Field>
      <Field label="Address line 2" htmlFor="st-a2">
        <Input id="st-a2" {...register('addressLine2')} />
      </Field>
      <Field label="City" htmlFor="st-city">
        <Input id="st-city" {...register('city')} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="State" htmlFor="st-state">
          <Input id="st-state" {...register('state')} />
        </Field>
        <Field label="PIN code" htmlFor="st-pin" error={errors.postalCode?.message}>
          <Input id="st-pin" {...register('postalCode')} />
        </Field>
      </div>
    </div>
  );
}

type EnrolmentField = 'enrolment.sectionId' | 'enrolment.rollNumber' | 'enrolment.enrolmentDate';

/** Year, section (full sections disabled), roll number and enrolment date. */
export function EnrolmentFields({
  yearId,
  setYearId,
  years,
  register,
  errors,
  prefix,
}: {
  yearId: string;
  setYearId: (id: string) => void;
  years: AcademicYearItem[] | undefined;
  register: (name: EnrolmentField) => object;
  errors:
    | {
        sectionId?: { message?: string };
        enrolmentDate?: { message?: string };
        rollNumber?: { message?: string };
      }
    | undefined;
  prefix: string;
}) {
  const sections = useSectionOptions(yearId);
  return (
    <div className="grid gap-4 sm:grid-cols-4">
      <Field label="Academic year" htmlFor={`${prefix}-year`}>
        <YearPicker
          id={`${prefix}-year`}
          yearId={yearId}
          onChange={setYearId}
          years={years?.filter((y) => y.status !== 'CLOSED')}
        />
      </Field>
      <Field
        label="Class & section"
        htmlFor={`${prefix}-sec`}
        error={errors?.sectionId?.message}
        required
      >
        <Select id={`${prefix}-sec`} {...register('enrolment.sectionId')}>
          <option value="">Select section</option>
          {sections.options.map((s) => (
            <option key={s.id} value={s.id} disabled={!!s.capacity && s.studentCount >= s.capacity}>
              {s.label} ({s.studentCount}
              {s.capacity ? `/${s.capacity}` : ''})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Roll number" htmlFor={`${prefix}-roll`} error={errors?.rollNumber?.message}>
        <Input id={`${prefix}-roll`} {...register('enrolment.rollNumber')} />
      </Field>
      <Field
        label="Enrolment date"
        htmlFor={`${prefix}-date`}
        error={errors?.enrolmentDate?.message}
        required
      >
        <Input id={`${prefix}-date`} type="date" {...register('enrolment.enrolmentDate')} />
      </Field>
    </div>
  );
}
