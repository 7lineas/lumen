/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: {
    relative: true,
    files: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  },
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Each weight is its own loaded font file, so each gets its own name.
      fontFamily: {
        sans: ["InstrumentSans_400Regular"],
        "sans-medium": ["InstrumentSans_500Medium"],
        "sans-semibold": ["InstrumentSans_600SemiBold"],
        serif: ["Newsreader_400Regular"],
        "serif-medium": ["Newsreader_500Medium"],
      },
      colors: {
        border: "rgb(var(--border) / <alpha-value>)",
        input: "rgb(var(--input) / <alpha-value>)",
        ring: "rgb(var(--ring) / <alpha-value>)",
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--secondary) / <alpha-value>)",
          foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--destructive) / <alpha-value>)",
          foreground: "rgb(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "rgb(var(--muted) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          foreground: "rgb(var(--accent-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "rgb(var(--card) / <alpha-value>)",
          foreground: "rgb(var(--card-foreground) / <alpha-value>)",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
