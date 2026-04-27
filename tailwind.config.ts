import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#182126",
        steel: "#5D6D75",
        safety: "#F4B000",
        gum: "#1D7A65",
        limestone: "#F6F3EC"
      },
      boxShadow: {
        panel: "0 10px 30px rgba(24, 33, 38, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
