import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
});

export const tabs = style({
  alignSelf: 'stretch',
});

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 6px',
  borderRadius: 6,
  selectors: {
    '&:hover': {
      background: cssVar('hoverColor'),
    },
  },
});

export const swatchButton = style({
  width: 20,
  height: 20,
  borderRadius: '50%',
  border: `1px solid ${cssVar('borderColor')}`,
  cursor: 'pointer',
  flexShrink: 0,
  padding: 0,
});

export const nameInput = style({
  flex: 1,
  minWidth: 0,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: cssVar('fontSm'),
  color: cssVar('textPrimaryColor'),
  padding: '2px 4px',
  borderRadius: 4,
  selectors: {
    '&:focus': {
      background: cssVar('backgroundSecondaryColor'),
    },
  },
});

export const palette = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 24px)',
  gap: 8,
  padding: 8,
});

export const paletteSwatch = style({
  width: 24,
  height: 24,
  borderRadius: '50%',
  border: `1px solid ${cssVar('borderColor')}`,
  cursor: 'pointer',
  padding: 0,
  selectors: {
    '&[data-active="true"]': {
      boxShadow: `0 0 0 2px ${cssVar('primaryColor')}`,
    },
  },
});

export const emptyHint = style({
  fontSize: cssVar('fontSm'),
  color: cssVar('textSecondaryColor'),
  padding: '8px 6px',
});

export const usageCount = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  whiteSpace: 'nowrap',
});
