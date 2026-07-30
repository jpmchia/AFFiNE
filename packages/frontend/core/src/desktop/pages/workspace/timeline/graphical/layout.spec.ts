import { describe, expect, test } from 'vitest';

import type { TimelineEntry } from '../../../../../modules/timeline';
import { computeGraphicalTimelineLayout, yToTime } from './layout';

const MINUTE = 60_000;
const HOUR = 3_600_000;

function entry(overrides: Partial<TimelineEntry>): TimelineEntry {
  return {
    docId: 'doc-1',
    docTitle: 'Doc',
    blockId: `block-${Math.random()}`,
    flavour: 'affine:paragraph',
    displayInTimelineAt: 0,
    excerpt: '',
    preview: { kind: 'text', text: '' },
    ...overrides,
  };
}

describe('computeGraphicalTimelineLayout (content-driven)', () => {
  test('returns an empty layout for no entries', () => {
    const layout = computeGraphicalTimelineLayout([], {
      zoomLevel: 'minute',
      hideEmptyPeriods: false,
    });
    expect(layout.nodes).toEqual([]);
    expect(layout.gaps).toEqual([]);
    expect(layout.anchors).toEqual([]);
  });

  test('places a single entry at the padding offset', () => {
    const layout = computeGraphicalTimelineLayout(
      [entry({ blockId: 'a', displayInTimelineAt: 0 })],
      { zoomLevel: 'minute', hideEmptyPeriods: false, padding: 40 }
    );
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0].axisY).toBe(40);
    expect(layout.nodes[0].cardY).toBe(40);
  });

  test('alternates left/right sides in chronological order', () => {
    const layout = computeGraphicalTimelineLayout(
      [
        entry({ blockId: 'a', displayInTimelineAt: 0 }),
        entry({ blockId: 'b', displayInTimelineAt: MINUTE }),
        entry({ blockId: 'c', displayInTimelineAt: MINUTE * 2 }),
      ],
      { zoomLevel: 'minute', hideEmptyPeriods: false }
    );
    expect(layout.nodes.map(n => n.side)).toEqual(['left', 'right', 'left']);
  });

  test('spacing grows with measured content height on the same side', () => {
    // a and c are both on the left; a is very tall, so c must clear it
    const layout = computeGraphicalTimelineLayout(
      [
        entry({ docId: 'd', blockId: 'a', displayInTimelineAt: 0 }),
        entry({ docId: 'd', blockId: 'b', displayInTimelineAt: 1000 }),
        entry({ docId: 'd', blockId: 'c', displayInTimelineAt: 2000 }),
      ],
      {
        zoomLevel: 'minute',
        hideEmptyPeriods: false,
        padding: 0,
        cardSpacing: 16,
        heights: { 'd:a': 300 },
      }
    );
    const [a, , c] = layout.nodes;
    expect(c.axisY).toBeGreaterThanOrEqual(a.axisY + 300 + 16);
  });

  test('time gaps are capped so large gaps stay content-driven', () => {
    const layout = computeGraphicalTimelineLayout(
      [
        entry({ blockId: 'a', displayInTimelineAt: 0 }),
        entry({ blockId: 'b', displayInTimelineAt: HOUR * 24 }),
      ],
      {
        zoomLevel: 'minute',
        hideEmptyPeriods: false,
        padding: 0,
        maxGapPx: 160,
      }
    );
    // 24h at 80px/minute would be over 100k px; capped to maxGapPx
    expect(layout.nodes[1].axisY).toBe(160);
  });

  test('small time gaps scale proportionally (variable minute height)', () => {
    const layout = computeGraphicalTimelineLayout(
      [
        entry({ blockId: 'a', displayInTimelineAt: 0 }),
        entry({ blockId: 'b', displayInTimelineAt: MINUTE }),
        entry({ blockId: 'c', displayInTimelineAt: MINUTE + 30_000 }),
      ],
      {
        zoomLevel: 'minute',
        hideEmptyPeriods: false,
        padding: 0,
        pxPerUnit: 80,
        minDotGap: 10,
        estimatedHeight: 10,
        cardSpacing: 4,
      }
    );
    const [a, b, c] = layout.nodes;
    // 1 full minute -> 80px, half minute -> 40px
    expect(b.axisY - a.axisY).toBe(80);
    expect(c.axisY - b.axisY).toBe(40);
  });

  test('enforces a minimum dot gap for near-simultaneous entries', () => {
    const layout = computeGraphicalTimelineLayout(
      [
        entry({ blockId: 'a', displayInTimelineAt: 0 }),
        entry({ blockId: 'b', displayInTimelineAt: 1 }),
      ],
      {
        zoomLevel: 'minute',
        hideEmptyPeriods: false,
        padding: 0,
        minDotGap: 24,
      }
    );
    expect(layout.nodes[1].axisY - layout.nodes[0].axisY).toBe(24);
  });

  test('collapses large empty gaps when hideEmptyPeriods is enabled', () => {
    const layout = computeGraphicalTimelineLayout(
      [
        entry({ blockId: 'a', displayInTimelineAt: 0 }),
        entry({ blockId: 'b', displayInTimelineAt: HOUR * 24 }),
      ],
      {
        zoomLevel: 'minute',
        hideEmptyPeriods: true,
        padding: 0,
        maxVisibleGapUnits: 4,
        collapsedGapPx: 48,
      }
    );
    expect(layout.gaps).toHaveLength(1);
    expect(layout.gaps[0].startTime).toBe(0);
    expect(layout.gaps[0].endTime).toBe(HOUR * 24);
    expect(layout.nodes[1].axisY).toBe(48);
  });

  test('interpolated ticks land between anchors at unit boundaries', () => {
    const layout = computeGraphicalTimelineLayout(
      [
        entry({ blockId: 'a', displayInTimelineAt: 0 }),
        entry({ blockId: 'b', displayInTimelineAt: MINUTE * 2 }),
      ],
      {
        zoomLevel: 'minute',
        hideEmptyPeriods: false,
        padding: 0,
        pxPerUnit: 80,
        minTickSpacing: 10,
      }
    );
    // anchors at y=0 (t=0) and y=160 (t=2min); minute boundaries at 0, 1, 2
    expect(layout.ticks.map(t => t.y)).toEqual([0, 80, 160]);
  });

  test('skips ticks that would be closer than minTickSpacing', () => {
    const layout = computeGraphicalTimelineLayout(
      [
        entry({ blockId: 'a', displayInTimelineAt: 0 }),
        entry({ blockId: 'b', displayInTimelineAt: MINUTE * 10 }),
      ],
      {
        zoomLevel: 'minute',
        hideEmptyPeriods: false,
        padding: 0,
        maxGapPx: 100,
        minTickSpacing: 28,
      }
    );
    // 10 minute boundaries squeezed into 100px; at >=28px spacing only a few survive
    expect(layout.ticks.length).toBeLessThan(10);
    for (let i = 1; i < layout.ticks.length; i++) {
      expect(layout.ticks[i].y - layout.ticks[i - 1].y).toBeGreaterThanOrEqual(
        28
      );
    }
  });
});

describe('computeGraphicalTimelineLayout with fixed groups', () => {
  test('group members are contiguous on the same side with reduced spacing', () => {
    const layout = computeGraphicalTimelineLayout(
      [
        entry({ docId: 'd', blockId: 'a', displayInTimelineAt: 0 }),
        entry({ docId: 'd', blockId: 'b', displayInTimelineAt: HOUR }),
        entry({ docId: 'd', blockId: 'c', displayInTimelineAt: HOUR * 2 }),
      ],
      {
        zoomLevel: 'minute',
        hideEmptyPeriods: false,
        padding: 0,
        groupSpacing: 8,
        estimatedHeight: 50,
        groups: [{ id: 'g1', entryKeys: ['d:a', 'd:b', 'd:c'] }],
      }
    );
    const sides = new Set(layout.nodes.map(n => n.side));
    expect(sides.size).toBe(1);
    expect(layout.nodes.every(n => n.groupId === 'g1')).toBe(true);
    // contiguous: each member starts exactly 50 + 8 below the previous
    expect(layout.nodes[1].axisY - layout.nodes[0].axisY).toBe(58);
    expect(layout.nodes[2].axisY - layout.nodes[1].axisY).toBe(58);
  });

  test('an entry between group members is forced to the opposite side', () => {
    const layout = computeGraphicalTimelineLayout(
      [
        entry({ docId: 'd', blockId: 'a', displayInTimelineAt: 0 }),
        entry({ docId: 'd', blockId: 'x', displayInTimelineAt: 1000 }),
        entry({ docId: 'd', blockId: 'b', displayInTimelineAt: 2000 }),
      ],
      {
        zoomLevel: 'minute',
        hideEmptyPeriods: false,
        padding: 0,
        estimatedHeight: 100,
        groups: [{ id: 'g1', entryKeys: ['d:a', 'd:b'] }],
      }
    );
    const groupSide = layout.nodes.find(n => n.groupId === 'g1')?.side;
    const single = layout.nodes.find(n => n.entry.blockId === 'x');
    expect(single?.side).not.toBe(groupSide);
    // no node lies between the group members on the group side
    const groupNodes = layout.nodes.filter(n => n.groupId === 'g1');
    const [top, bottom] = [groupNodes[0].axisY, groupNodes[1].axisY];
    const between = layout.nodes.filter(
      n =>
        !n.groupId && n.side === groupSide && n.axisY > top && n.axisY < bottom
    );
    expect(between).toHaveLength(0);
  });

  test('groups with a single present member degrade to singles', () => {
    const layout = computeGraphicalTimelineLayout(
      [entry({ docId: 'd', blockId: 'a', displayInTimelineAt: 0 })],
      {
        zoomLevel: 'minute',
        hideEmptyPeriods: false,
        padding: 0,
        groups: [{ id: 'g1', entryKeys: ['d:a', 'd:gone'] }],
      }
    );
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0].groupId).toBeUndefined();
  });
});

describe('yToTime', () => {
  const entries = [
    entry({ docId: 'd', blockId: 'a', displayInTimelineAt: 0 }),
    entry({ docId: 'd', blockId: 'b', displayInTimelineAt: MINUTE * 2 }),
  ];
  const layout = computeGraphicalTimelineLayout(entries, {
    zoomLevel: 'minute',
    hideEmptyPeriods: false,
    padding: 0,
    pxPerUnit: 80,
  });

  test('interpolates between anchors', () => {
    // anchors: (t=0, y=0), (t=2min, y=160); midpoint y=80 -> 1min
    expect(yToTime(layout, 80, 'minute')).toBe(MINUTE);
  });

  test('extrapolates before the first anchor', () => {
    // 80px above the first anchor at 80px/minute -> 1 minute earlier
    expect(yToTime(layout, -80, 'minute')).toBe(-MINUTE);
  });

  test('extrapolates after the last anchor', () => {
    expect(yToTime(layout, 240, 'minute')).toBe(MINUTE * 3);
  });

  test('excludes the dragged entry from the anchor set', () => {
    // excluding b leaves only a's anchor; y=80 extrapolates from a
    expect(yToTime(layout, 80, 'minute', 'd:b')).toBe(MINUTE);
  });
});
