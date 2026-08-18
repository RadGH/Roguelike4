// Shared menu styling tokens (one source — no divergent color tables).
import type React from 'react';

export const COLORS = {
  bgDeep: '#211a35',
  bgPanel: 'rgba(43,33,64,0.94)',
  panelBorder: '#b88ae0',
  gold: '#ffd97a',
  text: '#fff4d6',
  dim: '#a99bc9',
};

export const screenStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: `radial-gradient(circle at 50% 35%, #3b2f57, ${COLORS.bgDeep})`,
  color: COLORS.text,
  fontFamily: 'system-ui',
  overflowY: 'auto',
};

export const panelStyle: React.CSSProperties = {
  background: COLORS.bgPanel,
  border: `3px solid ${COLORS.gold}`,
  borderRadius: 16,
  padding: '20px 28px',
  maxWidth: 'min(760px, 94vw)',
  maxHeight: '90vh',
  overflowY: 'auto',
  textAlign: 'center',
  boxShadow: '0 8px 40px #0008',
};

export const cardBtnStyle = (focused: boolean): React.CSSProperties => ({
  background: focused ? COLORS.gold : '#3b2f57',
  color: focused ? '#2b2140' : COLORS.text,
  border: `2px solid ${focused ? COLORS.gold : COLORS.panelBorder}`,
  borderRadius: 10,
  padding: '12px 16px',
  fontWeight: 800,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 14,
});
