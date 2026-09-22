import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#2B141F",
        paper: "#FBF3F5",
        rose: {
          DEFAULT: "#A62B4E",
          dark: "#7E1F3C",
        },
        gold: "#B9862F",
        plum: "#3A1024",
        blush: "#F3D6DD",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        body: ["var(--font-inter)", "sans-serif"],
      },
      maxWidth: {
        content: "1120px",
      },
    },
  },
  plugins: [],
};
export default config;
