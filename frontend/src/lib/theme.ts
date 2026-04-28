// Centralized Theme Constants
// Import these instead of hardcoding colors
// To change theme: update this file and rebuild

export const THEME = {
  // Primary Brand Colors
  primary: '#384b16',        // Dark Olive Green
  primaryDark: '#2a3a10',    // Darker Olive
  primaryLight: '#4a5f20',   // Lighter Olive
  
  // Accent Colors
  accent: '#85b085',         // Muted Sage Green
  accentLight: '#a0c0a0',    // Light Sage
  accentCopper: '#d18e38',   // Mustard/Ochre
  accentBrown: '#57280d',    // Dark Chocolate Brown
  
  // Background Colors
  bgPage: '#e4eaef',         // Pale Icy Grey/White
  bgCard: '#ffffff',         // Pure White
  bgMuted: '#d4dce5',        // Light Icy Gray
  bgDark: '#1b2023',         // Dark Charcoal
  
  // Border Colors
  border: '#c4ced8',         // Icy Border
  borderLight: '#d4dce5',    // Light Border
  borderDark: '#94a0b0',     // Dark Border
  
  // Text Colors
  textPrimary: '#1b2023',    // Dark Charcoal/Black
  textSecondary: '#3a4a5a',  // Dark Slate
  textMuted: '#6a7a8a',      // Medium Gray
  textLight: '#ffffff',      // White
  textCopper: '#d18e38',     // Mustard accent
  
  // Status Colors (aligned with PWA tokens.ts)
  success: '#85B085',        // Sage Green (matches LOKA)
  warning: '#d18e38',        // Mustard Warning
  error: '#C75050',          // Red (matches LOKA danger)
  danger: '#C75050',         // Alias for error (matches PWA LOKA.danger)
  info: '#4A607A',           // Slate Blue (aligned with LOKA.info)
  
  // Sidebar
  sidebar: {
    bg: 'linear-gradient(180deg, #384b16 0%, #2a3a10 100%)',
    text: '#b8c8d0',
    textMuted: '#8a9aa5',
    accent: '#85b085',
    border: 'rgba(255,255,255,0.1)',
  },
  
  // Shadows
  shadow: {
    sm: '0 2px 4px rgba(27, 32, 35, 0.05)',
    md: '0 4px 12px rgba(27, 32, 35, 0.08)',
    lg: '0 8px 24px rgba(27, 32, 35, 0.12)',
  },
  
  // Border Radius
  radius: {
    sm: '6px',
    md: '10px',
    lg: '16px',
    xl: '40px',
    full: '9999px',
  },
} as const;

// For CSS-in-JS / inline styles
export const styles = {
  card: {
    backgroundColor: THEME.bgCard,
    borderRadius: THEME.radius.lg,
    border: `1px solid ${THEME.border}`,
    boxShadow: THEME.shadow.sm,
  },
  buttonPrimary: {
    backgroundColor: THEME.primary,
    color: THEME.textLight,
    borderRadius: THEME.radius.xl,
    padding: '8px 16px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
  },
  buttonSecondary: {
    backgroundColor: THEME.bgCard,
    color: THEME.textSecondary,
    borderRadius: THEME.radius.xl,
    padding: '8px 16px',
    fontWeight: 500,
    cursor: 'pointer',
    border: `1px solid ${THEME.border}`,
  },
  input: {
    padding: '10px 14px',
    borderRadius: THEME.radius.md,
    border: `1px solid ${THEME.border}`,
    backgroundColor: THEME.bgCard,
    color: THEME.textPrimary,
    fontSize: '14px',
    outline: 'none',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: THEME.textSecondary,
    marginBottom: '6px',
    display: 'block',
  },
  hint: {
    fontSize: '12px',
    color: THEME.textMuted,
    marginTop: '4px',
  },
} as const;
