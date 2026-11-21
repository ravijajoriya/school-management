import { DEFAULT_CERTIFICATE_TEMPLATES } from '@school/shared';
import { describe, expect, it } from 'vitest';
import {
  placeholdersIn,
  pronouns,
  renderCertificate,
  unknownPlaceholders,
} from './certificate-render.js';

describe('certificate rendering', () => {
  it('fills placeholders, splits paragraphs and capitalises sentence starts', () => {
    const text =
      'This is to certify that {{student_name}} studies in {{class_name}}.\n\n{{gender_pronoun}} was\nborn on {{date_of_birth}}. {{gender_pronoun}} is {{conduct}}.';
    expect(
      renderCertificate(text, {
        student_name: 'Aarav Sharma',
        class_name: 'Class 5',
        gender_pronoun: 'he',
        date_of_birth: '14 May 2016',
      }),
    ).toEqual([
      'This is to certify that Aarav Sharma studies in Class 5.',
      'He was born on 14 May 2016. He is —.',
    ]);
  });

  it('never produces markup from values: output is plain text', () => {
    const [p] = renderCertificate('Name: {{student_name}}', { student_name: '<b>X</b>' });
    expect(p).toBe('Name: <b>X</b>'); // rendered as text by the web app, never as HTML
  });

  it('reports unknown placeholders', () => {
    expect(placeholdersIn('{{student_name}} {{ class_name }} {{student_name}}')).toEqual([
      'student_name',
      'class_name',
    ]);
    expect(unknownPlaceholders('{{student_name}} {{favourite_colour}}')).toEqual([
      'favourite_colour',
    ]);
  });

  it('ships starter templates that only use known placeholders', () => {
    for (const t of DEFAULT_CERTIFICATE_TEMPLATES)
      expect(unknownPlaceholders(t.templateHtml)).toEqual([]);
  });

  it('chooses pronouns from gender', () => {
    expect(pronouns('FEMALE')).toEqual({ subject: 'she', possessive: 'her', child: 'daughter' });
    expect(pronouns(null).subject).toBe('they');
  });
});
