import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

/**
 * Horizontal clearance between the centerline and the cards on either side.
 * Must be wide enough that the tick time labels (rendered to the right of
 * the axis) are never obscured; kept identical on both sides for symmetry.
 */
export const AXIS_CARD_MARGIN = 88;

export const container = style({
  position: 'relative',
  width: '100%',
  padding: '24px 0 48px',
});

export const axisLine = style({
  position: 'absolute',
  left: '50%',
  top: 16,
  bottom: 16,
  width: 6,
  transform: 'translateX(-50%)',
  borderRadius: 3,
  background: cssVar('borderColor'),
});

export const tick = style({
  position: 'absolute',
  left: '50%',
  display: 'flex',
  alignItems: 'center',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
  zIndex: 100,
});

export const tickDot = style({
  width: 10,
  height: 2,
  borderRadius: 1,
  background: cssVar('iconSecondary'),
});

export const tickLabel = style({
  position: 'absolute',
  left: 14,
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  whiteSpace: 'nowrap',
});

export const tickLabelMajor = style({
  fontWeight: 600,
  color: cssVar('textPrimaryColor'),
});

export const gapMarker = style({
  position: 'absolute',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  background: cssVar('backgroundPrimaryColor'),
  padding: '2px 10px',
  borderRadius: 10,
  border: `1px dashed ${cssVar('borderColor')}`,
  whiteSpace: 'nowrap',
  zIndex: 2,
});

export const nodeDot = style({
  position: 'absolute',
  left: '50%',
  width: 14,
  height: 14,
  borderRadius: '50%',
  background: cssVar('primaryColor'),
  border: `3px solid ${cssVar('backgroundPrimaryColor')}`,
  transform: 'translate(-50%, -50%)',
  zIndex: 3,
  pointerEvents: 'none',
});

export const periodBlock = style({
  position: 'absolute',
  left: '50%',
  width: 6,
  borderRadius: 3,
  transform: 'translateX(-50%)',
  zIndex: 1,
  pointerEvents: 'none',
  opacity: 0.75,
});

export const connector = style({
  position: 'absolute',
  height: 2,
  borderRadius: 1,
  background: cssVar('borderColor'),
  zIndex: 1,
  pointerEvents: 'none',
});

export const card = style({
  position: 'absolute',
  width: 'fit-content',
  maxWidth: `calc(50% - ${AXIS_CARD_MARGIN + 24}px)`,
  userSelect: 'none',
  minWidth: 220,
  minHeight: 40,
  padding: '8px 12px',
  borderRadius: 8,
  border: `1px solid ${cssVar('borderColor')}`,
  background: cssVar('backgroundPrimaryColor'),
  cursor: 'grab',
  resize: 'horizontal',
  overflow: 'hidden',
  boxSizing: 'border-box',
  zIndex: 2,
  selectors: {
    '&:hover': {
      borderColor: cssVar('primaryColor'),
      boxShadow: cssVar('shadow1'),
    },
    '&[data-dragging="true"]': {
      cursor: 'grabbing',
      opacity: 0.85,
      boxShadow: cssVar('shadow2'),
      zIndex: 5,
    },
  },
});

export const cardLeft = style({
  right: `calc(50% + ${AXIS_CARD_MARGIN}px)`,
});

export const cardRight = style({
  left: `calc(50% + ${AXIS_CARD_MARGIN}px)`,
});

export const cardHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  marginBottom: 4,
});

export const cardTime = style({
  fontSize: cssVar('fontBase'),
  fontWeight: 700,
  color: cssVar('textPrimaryColor'),
  whiteSpace: 'nowrap',
});

export const cardDocTitle = style({
  fontSize: cssVar('fontXs'),
  fontWeight: 400,
  color: cssVar('textSecondaryColor'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      color: cssVar('primaryColor'),
    },
  },
});

export const cardTitle = style({
  fontSize: cssVar('fontBase'),
  fontWeight: 500,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  marginBottom: 4,
});

export const cardSelected = style({
  borderColor: cssVar('primaryColor'),
  boxShadow: `0 0 0 2px ${cssVar('primaryColor')}`,
});

export const cardGrouped = style({
  borderStyle: 'dashed',
});

export const cardChat = style({
  borderRadius: 16,
  padding: '10px 14px',
});

export const cardChatLeft = style({
  borderTopLeftRadius: 4,
});

export const cardChatRight = style({
  borderTopRightRadius: 4,
});

export const labelDot = style({
  width: 8,
  height: 8,
  borderRadius: '50%',
  flexShrink: 0,
});

export const cardTitleGroup = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
});

export const cardMetaGroup = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
});

export const mergedBadge = style({
  fontSize: cssVar('fontXs'),
  fontWeight: 600,
  color: cssVar('primaryColor'),
  whiteSpace: 'nowrap',
});

export const mergedDivider = style({
  height: 1,
  background: cssVar('borderColor'),
  margin: '6px 0',
});

export const dayMarker = style({
  position: 'absolute',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  padding: '4px 14px',
  borderRadius: 14,
  border: `1px solid ${cssVar('borderColor')}`,
  background: cssVar('backgroundSecondaryColor'),
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  color: cssVar('textPrimaryColor'),
  whiteSpace: 'nowrap',
  zIndex: 3,
  userSelect: 'none',
  pointerEvents: 'none',
});

export const currentDay = style({
  position: 'absolute',
  top: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '6px 16px',
  borderRadius: 16,
  border: `1px solid ${cssVar('borderColor')}`,
  background: cssVar('backgroundSecondaryColor'),
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  color: cssVar('textPrimaryColor'),
  whiteSpace: 'nowrap',
  zIndex: 105,
  userSelect: 'none',
  pointerEvents: 'none',
});

export const marquee = style({
  position: 'absolute',
  border: `1px dashed ${cssVar('primaryColor')}`,
  background: `color-mix(in srgb, ${cssVar('primaryColor')} 10%, transparent)`,
  borderRadius: 2,
  zIndex: 10,
  pointerEvents: 'none',
});

export const viewWrapper = style({
  position: 'relative',
  height: '100%',
});

export const selectionToolbar = style({
  position: 'absolute',
  bottom: 24,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 16px',
  borderRadius: 12,
  border: `1px solid ${cssVar('borderColor')}`,
  background: cssVar('backgroundOverlayPanelColor'),
  boxShadow: cssVar('shadow2'),
  zIndex: 20,
});

export const selectionCount = style({
  fontSize: cssVar('fontSm'),
  color: cssVar('textSecondaryColor'),
  marginRight: 4,
  whiteSpace: 'nowrap',
});

export const dragTimeIndicator = style({
  position: 'absolute',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  fontSize: cssVar('fontXs'),
  fontWeight: 600,
  color: cssVar('primaryColor'),
  background: cssVar('backgroundPrimaryColor'),
  border: `1px solid ${cssVar('primaryColor')}`,
  borderRadius: 8,
  padding: '2px 10px',
  whiteSpace: 'nowrap',
  zIndex: 6,
  pointerEvents: 'none',
});
