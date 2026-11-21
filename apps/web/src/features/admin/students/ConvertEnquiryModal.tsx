import { zodResolver } from '@hookform/resolvers/zod';
import {
  GUARDIAN_RELATIONSHIP_LABELS,
  GUARDIAN_RELATIONSHIPS,
  convertEnquirySchema,
  type ConvertEnquiryInput,
  type EnquiryDetail,
} from '@school/shared';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, Button, Field, Input, Modal, Select } from '@/components/ui';
import { splitFieldErrors } from '@/lib/api-client';
import { todayIso } from '@/lib/format';
import { useConvertEnquiry, useSectionOptions, useYearSelection } from '../people-api';
import { EnrolmentFields, StudentFields } from './StudentFormParts';

const ENROLMENT_KEYS = ['sectionId', 'rollNumber', 'enrolmentDate', 'academicYearId'];

/** "Convert to student" from an admission enquiry, pre-filled with the enquiry details. */
export function ConvertEnquiryModal({
  enquiry,
  onClose,
  onConverted,
}: {
  enquiry: EnquiryDetail;
  onClose: () => void;
  onConverted: (studentId: string) => void;
}) {
  const { years, yearId, setYearId } = useYearSelection();
  const convert = useConvertEnquiry(enquiry.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const [first = '', ...rest] = enquiry.studentName.trim().split(/\s+/);
  const { register, handleSubmit, setError, setValue, getValues, formState } =
    useForm<ConvertEnquiryInput>({
      resolver: zodResolver(convertEnquirySchema),
      defaultValues: {
        firstName: first,
        lastName: rest.join(' '),
        dateOfBirth: enquiry.dateOfBirth ?? '',
        state: 'Rajasthan',
        guardian: {
          fullName: enquiry.guardianName,
          relationship: 'FATHER',
          phone: enquiry.phone,
          email: enquiry.email ?? '',
          addressSameAsStudent: true,
        },
        enrolment: { academicYearId: '', sectionId: '', enrolmentDate: todayIso() },
      },
    });
  const { errors } = formState;

  // Keep the chosen year in the form, and pre-select the first section with room in the class the parent asked for.
  const sections = useSectionOptions(yearId);
  const suggestedId = sections.options.find(
    (s) => s.classId === enquiry.classSought.id && (!s.capacity || s.studentCount < s.capacity),
  )?.id;
  useEffect(() => {
    setValue('enrolment.academicYearId', yearId);
    setValue('enrolment.sectionId', '');
  }, [yearId, setValue]);
  useEffect(() => {
    if (suggestedId && !getValues('enrolment.sectionId'))
      setValue('enrolment.sectionId', suggestedId);
  }, [suggestedId, getValues, setValue]);

  const onSubmit = handleSubmit(
    async (values) => {
      setServerError(null);
      try {
        const student = await convert.mutateAsync(values);
        onConverted(student.id);
      } catch (error) {
        const { fields, general } = splitFieldErrors(error);
        Object.entries(fields).forEach(([k, message]) =>
          setError((ENROLMENT_KEYS.includes(k) ? `enrolment.${k}` : k) as never, { message }),
        );
        setServerError(general[0] ?? null);
      }
    },
    () => setServerError('Please fix the highlighted fields.'),
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Convert ${enquiry.referenceNumber} to a student`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={formState.isSubmitting}>
            Register & enrol
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {serverError && <Alert>{serverError}</Alert>}
        <StudentFields register={register as never} errors={errors as never} />
        <div>
          <h3 className="mb-2 text-sm font-semibold text-brand-navy">Primary parent / guardian</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Full name"
              htmlFor="cv-g-name"
              error={errors.guardian?.fullName?.message}
              required
            >
              <Input id="cv-g-name" {...register('guardian.fullName')} />
            </Field>
            <Field label="Relationship" htmlFor="cv-g-rel">
              <Select id="cv-g-rel" {...register('guardian.relationship')}>
                {GUARDIAN_RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {GUARDIAN_RELATIONSHIP_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Phone"
              htmlFor="cv-g-phone"
              error={errors.guardian?.phone?.message}
              required
            >
              <Input id="cv-g-phone" type="tel" {...register('guardian.phone')} />
            </Field>
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-brand-navy">Class placement</h3>
          <EnrolmentFields
            yearId={yearId}
            setYearId={setYearId}
            years={years.data}
            register={register as never}
            errors={errors.enrolment as never}
            prefix="cv"
          />
        </div>
      </form>
    </Modal>
  );
}
