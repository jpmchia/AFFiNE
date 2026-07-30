import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: cssVar('zIndexModal'),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: cssVar('backgroundModalColor'),
});

export const dialog = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 280,
  padding: '20px 24px',
  borderRadius: 12,
  background: cssVar('backgroundOverlayPanelColor'),
  boxShadow: cssVar('shadow3'),
});

export const label = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  color: cssVar('textPrimaryColor'),
});

export const track = style({
  height: 6,
  borderRadius: 3,
  background: cssVar('hoverColor'),
  overflow: 'hidden',
});

export const bar = style({
  height: '100%',
  borderRadius: 3,
  background: cssVar('primaryColor'),
  transition: 'width 0.15s ease',
});

export const counter = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  alignSelf: 'flex-end',
});
