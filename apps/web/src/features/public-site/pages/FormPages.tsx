import { zodResolver } from '@hookform/resolvers/zod';
import {
  publicContactMessageSchema,
  publicEnquirySchema,
  type PublicContactMessageInput,
  type PublicEnquiryInput,
} from '@school/shared';
import { BookOpen, CheckCircle2, Clock, Mail, MapPin, Phone, Send } from 'lucide-react';
import { useState } from 'react';
import { useForm, type FieldValues, type Path, type UseFormSetError } from 'react-hook-form';
import { FacebookIcon, InstagramIcon, YoutubeIcon } from '@/components/common/icons';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { apiStatus, splitFieldErrors } from '@/lib/api-client';
import {
  submitContactMessage,
  submitEnquiry,
  usePublicClasses,
  usePublicPage,
} from '@/lib/public-api';
import { usePageTitle } from '@/lib/use-page-title';
import { CheckList, Container, PageBanner, PlainText } from '../components/parts';
import { useSite } from '../components/use-site';

const textareaClass =
  'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-ink placeholder:text-gray-400 focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-gold/40';

/** Hidden from people (and screen readers); bots that fill it are silently ignored by the API. */
function Honeypot({ register }: { register: ReturnType<typeof useForm>['register'] }) {
  return (
    <div className="absolute -left-[9999px]" aria-hidden="true">
      <label>
        Website
        <input tabIndex={-1} autoComplete="off" {...register('website')} />
      </label>
    </div>
  );
}

function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): string | null {
  if (apiStatus(error) === 429)
    return 'Too many submissions from your network. Please try again in a few minutes.';
  const { fields, general } = splitFieldErrors(error);
  Object.entries(fields).forEach(([k, message]) => setError(k as Path<T>, { message }));
  return (
    general[0] ?? (Object.keys(fields).length ? null : 'Something went wrong. Please try again.')
  );
}

// --- Admissions -------------------------------------------------------------------------

export function AdmissionsPage() {
  usePageTitle('Admissions');
  const page = usePublicPage('admissions');
  const classes = usePublicClasses();
  const [reference, setReference] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, reset, setError, formState } = useForm<PublicEnquiryInput>({
    resolver: zodResolver(publicEnquirySchema),
    defaultValues: {
      guardianName: '',
      phone: '',
      email: '',
      studentName: '',
      classSoughtId: '',
      message: '',
      website: '',
    },
  });
  const { errors } = formState;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const res = await submitEnquiry(values);
      setReference(res.referenceNumber);
      reset();
    } catch (error) {
      setServerError(applyServerErrors(error, setError));
    }
  });

  return (
    <>
      <PageBanner title="Admissions" />
      <Container className="grid gap-8 py-12 lg:grid-cols-[1fr_320px]">
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-2xl font-bold text-brand-navy">Admission Enquiry</h2>
          {page.data?.intro && <PlainText text={page.data.intro} className="mt-2 text-sm" />}

          {reference ? (
            <div className="mt-6 space-y-4">
              <Alert tone="success">
                <p className="font-semibold">Thank you! Your enquiry has been received.</p>
                <p className="mt-1">
                  Your reference number is <strong className="font-mono">{reference}</strong>. Our
                  admission team will contact you soon.
                </p>
              </Alert>
              <Button variant="secondary" onClick={() => setReference(null)}>
                Submit another enquiry
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="relative mt-6 space-y-4" noValidate>
              {serverError && <Alert>{serverError}</Alert>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Parent's Name"
                  htmlFor="guardianName"
                  error={errors.guardianName?.message}
                  required
                >
                  <Input
                    id="guardianName"
                    autoComplete="name"
                    invalid={!!errors.guardianName}
                    {...register('guardianName')}
                  />
                </Field>
                <Field
                  label="Contact Number"
                  htmlFor="phone"
                  error={errors.phone?.message}
                  required
                >
                  <Input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    invalid={!!errors.phone}
                    {...register('phone')}
                  />
                </Field>
              </div>
              <Field label="Email Address" htmlFor="email" error={errors.email?.message}>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  invalid={!!errors.email}
                  {...register('email')}
                />
              </Field>
              <Field
                label="Child's Name"
                htmlFor="studentName"
                error={errors.studentName?.message}
                required
              >
                <Input
                  id="studentName"
                  invalid={!!errors.studentName}
                  {...register('studentName')}
                />
              </Field>
              <Field
                label="Class Seeking Admission For"
                htmlFor="classSoughtId"
                error={errors.classSoughtId?.message}
                required
              >
                <Select
                  id="classSoughtId"
                  invalid={!!errors.classSoughtId}
                  {...register('classSoughtId')}
                >
                  <option value="">Select class</option>
                  {classes.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Message (Optional)" htmlFor="message" error={errors.message?.message}>
                <textarea
                  id="message"
                  rows={4}
                  className={textareaClass}
                  {...register('message')}
                />
              </Field>
              <Honeypot register={register as never} />
              <Button type="submit" loading={formState.isSubmitting}>
                <Send className="h-4 w-4" aria-hidden="true" /> Submit Enquiry
              </Button>
            </form>
          )}
        </section>

        <aside className="h-fit rounded-xl bg-surface p-6">
          <h2 className="text-xl font-bold text-brand-navy">Why Choose Us?</h2>
          <div className="mt-4">
            <CheckList items={page.data?.whyChooseUs ?? []} />
          </div>
          <BookOpen className="mx-auto mt-6 h-16 w-16 text-brand-gold/60" aria-hidden="true" />
        </aside>
      </Container>
    </>
  );
}

// --- Contact ----------------------------------------------------------------------------

export function ContactPage() {
  usePageTitle('Contact Us');
  const site = useSite();
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, reset, setError, formState } = useForm<PublicContactMessageInput>(
    {
      resolver: zodResolver(publicContactMessageSchema),
      defaultValues: { fullName: '', email: '', phone: '', message: '', website: '' },
    },
  );
  const { errors } = formState;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await submitContactMessage(values);
      setSent(true);
      reset();
    } catch (error) {
      setServerError(applyServerErrors(error, setError));
    }
  });

  const socials = [
    { href: site.social.facebook, label: 'Facebook', Icon: FacebookIcon },
    { href: site.social.instagram, label: 'Instagram', Icon: InstagramIcon },
    { href: site.social.youtube, label: 'YouTube', Icon: YoutubeIcon },
  ].filter((s) => s.href);

  return (
    <>
      <PageBanner title="Contact Us" />
      <Container className="grid gap-8 py-12 lg:grid-cols-2">
        <section>
          <h2 className="text-2xl font-bold text-brand-navy">Get in Touch</h2>
          <ul className="mt-6 space-y-5">
            <li className="flex gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-gold" aria-hidden="true" />
              <span className="whitespace-pre-line text-ink">{site.address}</span>
            </li>
            <li className="flex gap-3">
              <Phone className="mt-0.5 h-5 w-5 shrink-0 text-brand-gold" aria-hidden="true" />
              <a
                href={`tel:${site.phone.replace(/\s/g, '')}`}
                className="text-ink hover:text-brand-navy"
              >
                {site.phone}
              </a>
            </li>
            {site.email && (
              <li className="flex gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-brand-gold" aria-hidden="true" />
                <a href={`mailto:${site.email}`} className="text-ink hover:text-brand-navy">
                  {site.email}
                </a>
              </li>
            )}
            {site.officeHours && (
              <li className="flex gap-3">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-brand-gold" aria-hidden="true" />
                <span className="text-ink">{site.officeHours}</span>
              </li>
            )}
          </ul>
          {socials.length > 0 && (
            <div className="mt-6 flex gap-3">
              {socials.map(({ href, label, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-navy text-white hover:bg-brand-gold hover:text-brand-navy-dark"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          )}
          <div className="mt-8 overflow-hidden rounded-xl border border-gray-200">
            {site.mapEmbedUrl ? (
              <iframe
                title={`Map showing ${site.schoolName}`}
                src={site.mapEmbedUrl}
                className="h-64 w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="flex h-48 items-center justify-center bg-surface text-sm text-ink-muted">
                <MapPin className="mr-2 h-5 w-5 text-brand-gold" aria-hidden="true" />{' '}
                {site.address}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-2xl font-bold text-brand-navy">Send Us a Message</h2>
          {sent ? (
            <div className="mt-6 space-y-4">
              <Alert tone="success">
                <p className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Thank you! Your message
                  has been sent.
                </p>
                <p className="mt-1">We will get back to you soon.</p>
              </Alert>
              <Button variant="secondary" onClick={() => setSent(false)}>
                Send another message
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="relative mt-6 space-y-4" noValidate>
              {serverError && <Alert>{serverError}</Alert>}
              <Field label="Your Name" htmlFor="fullName" error={errors.fullName?.message} required>
                <Input
                  id="fullName"
                  autoComplete="name"
                  invalid={!!errors.fullName}
                  {...register('fullName')}
                />
              </Field>
              <Field
                label="Email Address"
                htmlFor="contactEmail"
                error={errors.email?.message}
                required
              >
                <Input
                  id="contactEmail"
                  type="email"
                  autoComplete="email"
                  invalid={!!errors.email}
                  {...register('email')}
                />
              </Field>
              <Field
                label="Contact Number"
                htmlFor="contactPhone"
                error={errors.phone?.message}
                required
              >
                <Input
                  id="contactPhone"
                  type="tel"
                  autoComplete="tel"
                  invalid={!!errors.phone}
                  {...register('phone')}
                />
              </Field>
              <Field
                label="Your Message"
                htmlFor="contactMessage"
                error={errors.message?.message}
                required
              >
                <textarea
                  id="contactMessage"
                  rows={5}
                  className={textareaClass}
                  {...register('message')}
                />
              </Field>
              <Honeypot register={register as never} />
              <Button type="submit" loading={formState.isSubmitting}>
                <Send className="h-4 w-4" aria-hidden="true" /> Send Message
              </Button>
            </form>
          )}
        </section>
      </Container>
    </>
  );
}
