/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        brand: "hsl(var(--brand))",
      },
      borderRadius: { xl: "0.875rem", "2xl": "1rem" },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      container: { center: true, padding: "1rem" },
    },
  },
  plugins: [],
};
