import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const timelineTitle = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 8px',
  fontWeight: 600,
  userSelect: 'none',
});

export const timelineIcon = style({
  color: cssVar('iconColor'),
  fontSize: cssVar('fontH5'),
});

export const headerControls = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  height: '100%',
  width: '100%',
});

export const scrollArea = style({
  flex: 1,
  height: '100%',
  width: '100%',
});

export const listContainer = style({
  display: 'flex',
  flexDirection: 'column',
  maxWidth: 900,
  margin: '0 auto',
  padding: '8px 24px 48px',
  gap: 24,
});

export const groupSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const groupHeader = style({
  position: 'sticky',
  top: 0,
  zIndex: 1,
  background: cssVar('backgroundPrimaryColor'),
  padding: '8px 4px',
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  color: cssVar('textSecondaryColor'),
});

export const item = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '10px 12px',
  borderRadius: 8,
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      background: cssVar('hoverColor'),
    },
  },
});

export const itemHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
});

export const itemTime = style({
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      textDecoration: 'underline',
    },
  },
});

export const dateEditor = style({
  display: 'flex',
  padding: 8,
});

export const itemDocTitle = style({
  fontWeight: 500,
  color: cssVar('textPrimaryColor'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const itemExcerpt = style({
  fontSize: cssVar('fontSm'),
  color: cssVar('textPrimaryColor'),
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
});

export const emptyContainer = style({
  display: 'flex',
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
});
