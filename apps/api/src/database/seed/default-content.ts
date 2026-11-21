import type { PageContentMap, PageKey } from '@school/shared';

/**
 * Starter website content, taken from the approved desktop design (docs/design).
 * Seeded only when a page does not exist yet; afterwards the school edits it in the CMS.
 * Items marked "to be confirmed" are placeholders the school must review before go-live.
 */

/** Class catalogue: Nursery → Class 12 (to be confirmed with the school in Phase 3). */
export const DEFAULT_CLASSES = [
  'Nursery',
  'LKG',
  'UKG',
  ...Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`),
];

export const DEFAULT_PAGES: { [K in PageKey]: { title: string; content: PageContentMap[K] } } = {
  site: {
    title: 'School details & contact',
    content: {
      schoolName: 'Rajasthan Public School',
      tagline: 'RBSE Affiliated | Nursery to 12th',
      address: 'School Road, Civil Lines, Jaipur, Rajasthan - 302001',
      phone: '+91 98765 43210',
      email: 'info@rajasthanpublicschool.in',
      officeHours: 'Monday – Saturday, 8:00 AM – 4:00 PM',
      mapEmbedUrl: '',
      social: { facebook: '', instagram: '', youtube: '' },
      footerText:
        'A leading RBSE affiliated school providing quality education from Nursery to 12th with a focus on academics, values and overall development.',
    },
  },
  home: {
    title: 'Home',
    content: {
      heroSlides: [
        {
          heading: 'Shaping',
          highlight: 'Bright Futures',
          text: 'A leading RBSE affiliated school providing quality education from Nursery to 12th with a focus on academics, values and overall development.',
          imageId: null,
        },
      ],
      highlights: [
        { title: 'RBSE Affiliated', icon: 'award' },
        { title: 'Nursery to 12th', icon: 'graduation-cap' },
        { title: 'Experienced Faculty', icon: 'users' },
        { title: 'Modern Facilities', icon: 'building' },
        { title: 'Holistic Development', icon: 'leaf' },
      ],
      about: {
        heading: 'About Our School',
        text: 'Rajasthan Public School is a premier educational institution affiliated with the Rajasthan Board of Secondary Education (RBSE). We provide a nurturing and disciplined environment where students grow academically, socially and morally.',
        points: [
          'Value-based Education',
          'Student-Centric Learning',
          'Qualified & Dedicated Faculty',
          'Safe and Inclusive Campus',
        ],
        imageId: null,
      },
      stats: [
        { value: '1,000+', label: 'Students', icon: 'users' },
        { value: '50+', label: 'Experienced Teachers', icon: 'graduation-cap' },
        { value: '25+', label: 'Classrooms', icon: 'building' },
        { value: '10+', label: 'Years of Excellence', icon: 'award' },
      ],
    },
  },
  about: {
    title: 'About Us',
    content: {
      intro: {
        heading: 'About Our School',
        text: 'Rajasthan Public School is a reputed RBSE affiliated institution dedicated to providing comprehensive and value-based education from Nursery to 12th. Our school focuses on academic excellence, character building and the holistic development of every student.',
        imageId: null,
      },
      vision:
        'To nurture confident, compassionate and responsible citizens who strive for excellence in every walk of life. (To be confirmed by the school.)',
      mission:
        'To provide a safe, inclusive and inspiring learning environment where every child discovers their potential through quality teaching, strong values and opportunities beyond the classroom. (To be confirmed by the school.)',
      principal: { name: '', designation: 'Principal', message: '', imageId: null },
      coreValues: [
        { title: 'Integrity', description: 'Honesty and responsibility in everything we do.' },
        { title: 'Respect', description: 'Respect for every individual, culture and opinion.' },
        { title: 'Excellence', description: 'Giving our best in academics, sports and the arts.' },
        { title: 'Discipline', description: 'Self-discipline as the foundation of success.' },
      ],
    },
  },
  academics: {
    title: 'Academics',
    content: {
      overview: {
        text: 'Our academic program, aligned with the Rajasthan Board of Secondary Education (RBSE), is designed to build strong foundations, encourage critical thinking and prepare students for future challenges.',
        imageId: null,
      },
      classesOffered: 'We offer classes from Nursery to Class 12.',
      curriculum:
        'We follow the curriculum prescribed by the Rajasthan Board of Secondary Education (RBSE), complemented by co-curricular activities, sports and value education.',
      subjects: [
        {
          stage: 'Pre-primary (Nursery – UKG)',
          subjects:
            'English, Hindi, Number work, Environmental awareness, Art & craft, Rhymes & stories',
        },
        {
          stage: 'Primary (Classes 1–5)',
          subjects: 'Hindi, English, Mathematics, Environmental Studies, Art, Physical Education',
        },
        {
          stage: 'Middle (Classes 6–8)',
          subjects: 'Hindi, English, Sanskrit, Mathematics, Science, Social Science, Computer',
        },
        {
          stage: 'Secondary (Classes 9–10)',
          subjects: 'Hindi, English, Mathematics, Science, Social Science, Sanskrit',
        },
        {
          stage: 'Senior Secondary (Classes 11–12)',
          subjects: 'Streams and subjects to be confirmed by the school',
        },
      ],
      calendar: [
        { period: 'April', event: 'New academic session begins' },
        { period: 'September', event: 'Half-yearly examinations' },
        { period: 'March', event: 'Annual examinations' },
      ],
    },
  },
  facilities: {
    title: 'Facilities',
    content: {
      intro:
        'A modern and well-equipped campus that supports academic excellence and overall development.',
      items: [
        {
          title: 'Well-Equipped Classrooms',
          description:
            'Spacious, well-lit and ventilated classrooms designed for focused learning.',
          icon: 'school',
          imageId: null,
        },
        {
          title: 'Science Laboratories',
          description: 'Physics, chemistry and biology labs for hands-on experiments.',
          icon: 'flask',
          imageId: null,
        },
        {
          title: 'Computer Lab',
          description: 'Modern computers to build digital skills from an early age.',
          icon: 'monitor',
          imageId: null,
        },
        {
          title: 'Library',
          description: 'A rich collection of books and reference material for every age group.',
          icon: 'library',
          imageId: null,
        },
        {
          title: 'Sports & Playground',
          description: 'Large playground and sports facilities for physical fitness and teamwork.',
          icon: 'trophy',
          imageId: null,
        },
        {
          title: 'Transportation',
          description: 'Safe school transport covering major routes in the city.',
          icon: 'bus',
          imageId: null,
        },
      ],
    },
  },
  admissions: {
    title: 'Admissions',
    content: {
      intro:
        'Interested in enrolling your child at Rajasthan Public School? Please fill out the enquiry form below and our admission team will get in touch with you.',
      whyChooseUs: [
        'RBSE Affiliated',
        'Nursery to 12th',
        'Experienced Faculty',
        'Safe & Nurturing Environment',
        'Focus on Overall Development',
      ],
    },
  },
};
