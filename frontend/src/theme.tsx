import { createContext, useContext, useState } from "react";
import { DARK_C, LIGHT_C } from "./constants";

export type Theme = "dark" | "light";
export type Colors = typeof DARK_C | typeof LIGHT_C;

interface ThemeCtx {
  theme: Theme;
  C: Colors;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: "dark",
  C: DARK_C,
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const C = theme === "dark" ? DARK_C : LIGHT_C;
  return (
    <ThemeContext.Provider value={{ theme, C, toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }}>
      {children}
    </ThemeContext.Provider>
  );
}
