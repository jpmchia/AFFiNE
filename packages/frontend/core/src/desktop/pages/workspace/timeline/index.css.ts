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

export const zoomControls = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
});

export const zoomLabel = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  minWidth: 44,
  textAlign: 'center',
  userSelect: 'none',
});

export const hideEmptyToggle = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  cursor: 'pointer',
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
  alignItems: 'center',
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 8px 48px',
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
  width: 'fit-content',
  maxWidth: '100%',
  boxSizing: 'border-box',
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

export const itemTitle = style({
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  marginBottom: 4,
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

export const previewRow = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
});

export const listIcon = style({
  flexShrink: 0,
  marginTop: 2,
  color: cssVar('iconColor'),
});

export const listCheckedIcon = style([
  listIcon,
  {
    color: cssVar('primaryColor'),
  },
]);

export const codeExcerpt = style({
  fontFamily: cssVar('fontCodeFamily'),
  fontSize: cssVar('fontXs'),
  color: cssVar('textPrimaryColor'),
  background: cssVar('backgroundSecondaryColor'),
  borderRadius: 4,
  padding: '6px 8px',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  wordBreak: 'break-word',
});

export const codeLanguage = style({
  display: 'block',
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  marginBottom: 4,
});

export const imageExcerpt = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const image = style({
  maxHeight: 160,
  maxWidth: '100%',
  borderRadius: 8,
  objectFit: 'cover',
});

export const attachmentSize = style({
  color: cssVar('textSecondaryColor'),
});

export const bookmarkExcerpt = style([
  previewRow,
  {
    alignItems: 'center',
  },
]);

export const bookmarkText = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  overflow: 'hidden',
});

export const bookmarkTitle = style({
  fontSize: cssVar('fontSm'),
  color: cssVar('textPrimaryColor'),
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const loadOlderRow = style({
  display: 'flex',
  justifyContent: 'center',
  gap: 8,
  padding: '16px 0 32px',
});

export const emptyContainer = style({
  display: 'flex',
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
});
