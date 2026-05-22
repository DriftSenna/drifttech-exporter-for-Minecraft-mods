const MC_GREEN = "#4ade80";
const MC_GREEN_DARK = "#166534";

const dark = {
  text: "#f4f4f5",
  tint: MC_GREEN,

  background: "#0e0e10",
  foreground: "#f4f4f5",

  surface: "#18181b",
  card: "#1c1c1f",
  cardForeground: "#f4f4f5",
  cardBorder: "#2d2d32",

  primary: MC_GREEN,
  primaryForeground: "#052e16",
  primaryDark: MC_GREEN_DARK,

  secondary: "#27272a",
  secondaryForeground: "#d4d4d8",

  muted: "#27272a",
  mutedForeground: "#71717a",

  accent: "#22c55e",
  accentForeground: "#052e16",

  destructive: "#ef4444",
  destructiveForeground: "#fff",

  warning: "#f59e0b",
  warningForeground: "#fff",

  safe: MC_GREEN,

  border: "#2d2d32",
  input: "#27272a",
};

const colors = {
  light: dark,
  dark,
  radius: 12,
};

export default colors;
