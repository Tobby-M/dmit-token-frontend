import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f5f2ea",
        ink: "#1f2421",
        brass: "#b48c46",
        clay: "#e7dcc8",
        pine: "#2f4f44"
      },
      boxShadow: {
        card: "0 10px 30px rgba(38, 30, 17, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
