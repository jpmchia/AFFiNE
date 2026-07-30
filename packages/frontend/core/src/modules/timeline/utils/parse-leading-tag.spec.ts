import { describe, expect, test } from 'vitest';

import { parseLeadingTag } from './parse-leading-tag';

const TAGS = [
  { id: 't-work', name: 'work' },
  { id: 't-workout', name: 'workout' },
  { id: 't-errands', name: 'Errands' },
];

describe('parseLeadingTag', () => {
  test('matches a plain tag with colon separator', () => {
    const result = parseLeadingTag('work: pick up laptop', TAGS);
    expect(result).toEqual({ tagId: 't-work', matchedText: 'work: ' });
  });

  test('matches a hash-prefixed tag', () => {
    const result = parseLeadingTag('#errands - buy milk', TAGS);
    expect(result).toEqual({ tagId: 't-errands', matchedText: '#errands - ' });
  });

  test('matches a bracketed tag', () => {
    const result = parseLeadingTag('[work] status update', TAGS);
    expect(result).toEqual({ tagId: 't-work', matchedText: '[work] ' });
  });

  test('is case-insensitive', () => {
    const result = parseLeadingTag('ERRANDS, dry cleaning', TAGS);
    expect(result?.tagId).toBe('t-errands');
  });

  test('prefers the longest matching tag name', () => {
    const result = parseLeadingTag('workout: leg day', TAGS);
    expect(result?.tagId).toBe('t-workout');
  });

  test('requires a separator after the tag name', () => {
    expect(parseLeadingTag('workplace issues', TAGS)).toBeNull();
  });

  test('matches when the tag is the entire content', () => {
    const result = parseLeadingTag('work', TAGS);
    expect(result).toEqual({ tagId: 't-work', matchedText: 'work' });
  });

  test('ignores leading whitespace', () => {
    const result = parseLeadingTag('  work: late start', TAGS);
    expect(result?.tagId).toBe('t-work');
  });

  test('returns null when no tag matches', () => {
    expect(parseLeadingTag('groceries: milk', TAGS)).toBeNull();
  });

  test('returns null for tags not at the start', () => {
    expect(parseLeadingTag('finish work: report', TAGS)).toBeNull();
  });

  test('ignores empty tag names', () => {
    expect(parseLeadingTag(': something', [{ id: 'x', name: ' ' }])).toBeNull();
  });
});
