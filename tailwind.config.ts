import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Custom blue palette for consistency
        navy: {
          50: "hsl(217, 100%, 97%)",
          100: "hsl(217, 95%, 90%)",
          200: "hsl(217, 90%, 80%)",
          300: "hsl(217, 85%, 70%)",
          400: "hsl(217, 85%, 60%)",
          500: "hsl(217, 91%, 50%)", // Base navy
          600: "hsl(217, 91%, 40%)",
          700: "hsl(217, 85%, 30%)",
          800: "hsl(217, 80%, 20%)",
          900: "hsl(217, 75%, 10%)",
          950: "hsl(217, 91%, 5%)", // Deep navy for backgrounds
        },
        "slate-blue": {
          50: "hsl(215, 35%, 95%)",
          100: "hsl(215, 30%, 85%)",
          200: "hsl(215, 28%, 70%)",
          300: "hsl(215, 26%, 55%)",
          400: "hsl(215, 25%, 40%)",
          500: "hsl(215, 25%, 27%)", // Base slate-blue
          600: "hsl(215, 25%, 20%)",
          700: "hsl(215, 25%, 15%)",
          800: "hsl(215, 25%, 12%)",
          900: "hsl(215, 25%, 8%)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;