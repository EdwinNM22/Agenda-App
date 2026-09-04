export const reportTheme = {
  page: {
    size: "LETTER" as const,
    margin: 48,
  },
  colors: {
    ink: "#1c1917",
    muted: "#57534e",
    soft: "#a8a29e",
    line: "#d6d3d1",
    surface: "#f5f5f4",
    accent: "#0f766e",
    white: "#ffffff",
    ok: "#15803d",
    warn: "#a16207",
    danger: "#b91c1c",
    neutral: "#44403c",
  },
  fonts: {
    regular: "Helvetica",
    bold: "Helvetica-Bold",
  },
  sizes: {
    title: 20,
    subtitle: 11,
    section: 13,
    heading1: 14,
    heading2: 12,
    heading3: 11,
    body: 9.5,
    small: 8.5,
    footer: 8,
  },
} as const

export type ReportTheme = typeof reportTheme
