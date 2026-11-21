import type { PageKey } from '@school/shared';

/** Describes how each page's structured content is edited in the CMS. */
export type FieldDef =
  | { kind: 'text'; key: string; label: string; rows?: number; hint?: string; placeholder?: string }
  | { kind: 'image'; key: string; label: string; hint?: string }
  | { kind: 'icon'; key: string; label: string }
  | { kind: 'group'; key: string; label: string; fields: FieldDef[] }
  | {
      kind: 'list';
      key: string;
      label: string;
      itemLabel: string;
      max: number;
      fields: FieldDef[];
      newItem: () => Record<string, unknown>;
    }
  | { kind: 'stringList'; key: string; label: string; itemLabel: string; max: number };

export const PAGE_PUBLIC_PATHS: Record<PageKey, string> = {
  site: '/contact',
  home: '/',
  about: '/about',
  academics: '/academics',
  facilities: '/facilities',
  admissions: '/admissions',
};

export const PAGE_DESCRIPTIONS: Record<PageKey, string> = {
  site: 'School name, address, phone, email, office hours, map and social links — shown in the header, footer and Contact page.',
  home: 'Hero slides, highlight strip, About section and the statistics band.',
  about: 'Introduction, vision, mission, principal’s message and core values.',
  academics: 'Overview, classes, curriculum, subjects by stage and the academic calendar.',
  facilities: 'The list of facilities with photos.',
  admissions: 'Introduction above the enquiry form and the “Why choose us” list.',
};

export const PAGE_FIELDS: Record<PageKey, FieldDef[]> = {
  site: [
    { kind: 'text', key: 'schoolName', label: 'School name' },
    {
      kind: 'text',
      key: 'tagline',
      label: 'Tagline',
      placeholder: 'RBSE Affiliated | Nursery to 12th',
    },
    { kind: 'text', key: 'address', label: 'Address', rows: 2 },
    { kind: 'text', key: 'phone', label: 'Phone' },
    { kind: 'text', key: 'email', label: 'Email' },
    {
      kind: 'text',
      key: 'officeHours',
      label: 'Office hours',
      placeholder: 'Monday – Saturday, 8:00 AM – 4:00 PM',
    },
    {
      kind: 'text',
      key: 'mapEmbedUrl',
      label: 'Google Maps embed link',
      hint: 'In Google Maps: Share → Embed a map → copy only the link inside src="…".',
    },
    {
      kind: 'group',
      key: 'social',
      label: 'Social media links',
      fields: [
        { kind: 'text', key: 'facebook', label: 'Facebook page URL' },
        { kind: 'text', key: 'instagram', label: 'Instagram URL' },
        { kind: 'text', key: 'youtube', label: 'YouTube channel URL' },
      ],
    },
    { kind: 'text', key: 'footerText', label: 'Footer text', rows: 3 },
  ],
  home: [
    {
      kind: 'list',
      key: 'heroSlides',
      label: 'Hero slides',
      itemLabel: 'Slide',
      max: 5,
      newItem: () => ({ heading: '', highlight: '', text: '', imageId: null }),
      fields: [
        { kind: 'text', key: 'heading', label: 'Heading', placeholder: 'Shaping' },
        {
          kind: 'text',
          key: 'highlight',
          label: 'Highlighted words (gold)',
          placeholder: 'Bright Futures',
        },
        { kind: 'text', key: 'text', label: 'Text', rows: 2 },
        {
          kind: 'image',
          key: 'imageId',
          label: 'Background photo',
          hint: 'Wide photo, at least 1600 px across.',
        },
      ],
    },
    {
      kind: 'list',
      key: 'highlights',
      label: 'Highlight strip',
      itemLabel: 'Highlight',
      max: 6,
      newItem: () => ({ title: '', icon: 'star' }),
      fields: [
        { kind: 'text', key: 'title', label: 'Title' },
        { kind: 'icon', key: 'icon', label: 'Icon' },
      ],
    },
    {
      kind: 'group',
      key: 'about',
      label: 'About section',
      fields: [
        { kind: 'text', key: 'heading', label: 'Heading' },
        { kind: 'text', key: 'text', label: 'Text', rows: 4 },
        { kind: 'stringList', key: 'points', label: 'Bullet points', itemLabel: 'Point', max: 6 },
        { kind: 'image', key: 'imageId', label: 'Photo' },
      ],
    },
    {
      kind: 'list',
      key: 'stats',
      label: 'Statistics band',
      itemLabel: 'Statistic',
      max: 4,
      newItem: () => ({ value: '', label: '', icon: 'star' }),
      fields: [
        { kind: 'text', key: 'value', label: 'Number', placeholder: '1,000+' },
        { kind: 'text', key: 'label', label: 'Label', placeholder: 'Students' },
        { kind: 'icon', key: 'icon', label: 'Icon' },
      ],
    },
  ],
  about: [
    {
      kind: 'group',
      key: 'intro',
      label: 'About our school',
      fields: [
        { kind: 'text', key: 'heading', label: 'Heading' },
        { kind: 'text', key: 'text', label: 'Text', rows: 6 },
        { kind: 'image', key: 'imageId', label: 'Photo' },
      ],
    },
    { kind: 'text', key: 'vision', label: 'Our vision', rows: 3 },
    { kind: 'text', key: 'mission', label: 'Our mission', rows: 3 },
    {
      kind: 'group',
      key: 'principal',
      label: 'Principal’s message (hidden while the message is empty)',
      fields: [
        { kind: 'text', key: 'name', label: 'Name' },
        { kind: 'text', key: 'designation', label: 'Designation' },
        { kind: 'text', key: 'message', label: 'Message', rows: 6 },
        { kind: 'image', key: 'imageId', label: 'Photo' },
      ],
    },
    {
      kind: 'list',
      key: 'coreValues',
      label: 'Core values',
      itemLabel: 'Value',
      max: 8,
      newItem: () => ({ title: '', description: '' }),
      fields: [
        { kind: 'text', key: 'title', label: 'Title' },
        { kind: 'text', key: 'description', label: 'Description', rows: 2 },
      ],
    },
  ],
  academics: [
    {
      kind: 'group',
      key: 'overview',
      label: 'Academic overview',
      fields: [
        { kind: 'text', key: 'text', label: 'Text', rows: 5 },
        { kind: 'image', key: 'imageId', label: 'Photo' },
      ],
    },
    {
      kind: 'text',
      key: 'classesOffered',
      label: 'Classes offered (text)',
      rows: 3,
      hint: 'The list of classes itself comes from the class catalogue.',
    },
    { kind: 'text', key: 'curriculum', label: 'Curriculum', rows: 4 },
    {
      kind: 'list',
      key: 'subjects',
      label: 'Subjects by stage',
      itemLabel: 'Stage',
      max: 10,
      newItem: () => ({ stage: '', subjects: '' }),
      fields: [
        { kind: 'text', key: 'stage', label: 'Stage', placeholder: 'Primary (Classes 1–5)' },
        { kind: 'text', key: 'subjects', label: 'Subjects', rows: 2 },
      ],
    },
    {
      kind: 'list',
      key: 'calendar',
      label: 'Academic calendar',
      itemLabel: 'Entry',
      max: 24,
      newItem: () => ({ period: '', event: '' }),
      fields: [
        { kind: 'text', key: 'period', label: 'When', placeholder: 'April' },
        { kind: 'text', key: 'event', label: 'What', placeholder: 'New session begins' },
      ],
    },
  ],
  facilities: [
    { kind: 'text', key: 'intro', label: 'Introduction', rows: 2 },
    {
      kind: 'list',
      key: 'items',
      label: 'Facilities',
      itemLabel: 'Facility',
      max: 16,
      newItem: () => ({ title: '', description: '', icon: 'building', imageId: null }),
      fields: [
        { kind: 'text', key: 'title', label: 'Title' },
        { kind: 'text', key: 'description', label: 'Description', rows: 2 },
        { kind: 'icon', key: 'icon', label: 'Icon' },
        { kind: 'image', key: 'imageId', label: 'Photo' },
      ],
    },
  ],
  admissions: [
    { kind: 'text', key: 'intro', label: 'Introduction above the form', rows: 3 },
    {
      kind: 'stringList',
      key: 'whyChooseUs',
      label: '“Why choose us?” list',
      itemLabel: 'Reason',
      max: 8,
    },
  ],
};
