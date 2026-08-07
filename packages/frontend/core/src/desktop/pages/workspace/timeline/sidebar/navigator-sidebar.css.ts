import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
});

export const title = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  color: cssVar('textPrimaryColor'),
});

export const clearButton = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('primaryColor'),
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '2px 4px',
  borderRadius: 4,
  selectors: {
    '&:hover': {
      background: cssVar('hoverColor'),
    },
  },
});

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export const year = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const yearLabel = style({
  fontSize: cssVar('fontXs'),
  fontWeight: 600,
  color: cssVar('textSecondaryColor'),
  padding: '4px 6px',
});

export const month = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '4px 6px',
  borderRadius: 6,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: cssVar('fontSm'),
  color: cssVar('textPrimaryColor'),
  selectors: {
    '&:hover': {
      background: cssVar('hoverColor'),
    },
    '&[data-active="true"]': {
      background: cssVar('backgroundSecondaryColor'),
      color: cssVar('primaryColor'),
      fontWeight: 600,
    },
  },
});

export const monthLabel = style({
  flex: 1,
  textAlign: 'left',
});

export const count = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  whiteSpace: 'nowrap',
});

export const empty = style({
  fontSize: cssVar('fontSm'),
  color: cssVar('textSecondaryColor'),
  padding: '8px 6px',
});
