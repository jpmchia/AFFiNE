import { describe, expect, test } from 'vitest';

import {
  parseLeadingDateTime,
  stripParsedPrefix,
} from './parse-leading-datetime';

// a fixed reference: 2024-05-13 10:00:00 local time
const REF = new Date(2024, 4, 13, 10, 0, 0).getTime();

describe('parseLeadingDateTime', () => {
  test('parses HH:mm:ss using the reference date', () => {
    const result = parseLeadingDateTime('21:03:11 hello world', REF);
    expect(result).not.toBeNull();
    expect(new Date(result!.timestamp)).toEqual(
      new Date(2024, 4, 13, 21, 3, 11)
    );
    expect(result!.matchedText).toBe('21:03:11 ');
  });

  test('parses HH:mm using the reference date', () => {
    const result = parseLeadingDateTime('09:15 standup notes', REF);
    expect(new Date(result!.timestamp)).toEqual(
      new Date(2024, 4, 13, 9, 15, 0)
    );
  });

  test('parses [dd/MM/yyyy, HH:mm:ss] WhatsApp style', () => {
    const result = parseLeadingDateTime(
      '[13/05/2024, 21:03:11] Alice: hi there',
      REF
    );
    expect(new Date(result!.timestamp)).toEqual(
      new Date(2024, 4, 13, 21, 3, 11)
    );
    expect(result!.matchedText).toBe('[13/05/2024, 21:03:11] ');
    expect(
      stripParsedPrefix(
        '[13/05/2024, 21:03:11] Alice: hi there',
        result!.matchedText
      )
    ).toBe('Alice: hi there');
  });

  test('parses hh:mm - dd-MMM-yy', () => {
    const result = parseLeadingDateTime('21:03 - 12-Mar-24 note text', REF);
    expect(new Date(result!.timestamp)).toEqual(
      new Date(2024, 2, 12, 21, 3, 0)
    );
  });

  test('parses dd/MM/yy, HH:mm', () => {
    const result = parseLeadingDateTime('01/02/23, 08:30 message', REF);
    expect(new Date(result!.timestamp)).toEqual(new Date(2023, 1, 1, 8, 30, 0));
  });

  test('parses ISO date with time', () => {
    const result = parseLeadingDateTime('2024-05-13 21:03 log line', REF);
    expect(new Date(result!.timestamp)).toEqual(
      new Date(2024, 4, 13, 21, 3, 0)
    );
  });

  test('parses date-only prefix at midnight', () => {
    const result = parseLeadingDateTime('13/05/2024 - meeting', REF);
    expect(new Date(result!.timestamp)).toEqual(new Date(2024, 4, 13));
  });

  test('parses 12-hour time with meridiem', () => {
    const result = parseLeadingDateTime('9:15 pm party', REF);
    expect(new Date(result!.timestamp)).toEqual(
      new Date(2024, 4, 13, 21, 15, 0)
    );
    const am = parseLeadingDateTime('12:05 am midnight snack', REF);
    expect(new Date(am!.timestamp)).toEqual(new Date(2024, 4, 13, 0, 5, 0));
  });

  test('parses month-name date with spaces', () => {
    const result = parseLeadingDateTime('12 March 2024, 10:30 diary', REF);
    expect(new Date(result!.timestamp)).toEqual(
      new Date(2024, 2, 12, 10, 30, 0)
    );
  });

  test('falls back to MM/dd when day-first is impossible', () => {
    const result = parseLeadingDateTime('05/13/2024, 21:03 us format', REF);
    expect(new Date(result!.timestamp)).toEqual(
      new Date(2024, 4, 13, 21, 3, 0)
    );
  });

  test('returns null when there is no leading date/time', () => {
    expect(parseLeadingDateTime('hello world', REF)).toBeNull();
    expect(parseLeadingDateTime('meeting at 21:03', REF)).toBeNull();
    expect(parseLeadingDateTime('', REF)).toBeNull();
  });

  test('rejects invalid times and dates', () => {
    expect(parseLeadingDateTime('25:00 too late', REF)).toBeNull();
    expect(parseLeadingDateTime('31/02/2024, 10:00 nope', REF)).toBeNull();
  });
});

describe('stripParsedPrefix', () => {
  test('strips only when the prefix matches', () => {
    expect(stripParsedPrefix('21:03 hello', '21:03 ')).toBe('hello');
    expect(stripParsedPrefix('edited text', '21:03 ')).toBe('edited text');
    expect(stripParsedPrefix('21:03 hello', undefined)).toBe('21:03 hello');
  });
});
