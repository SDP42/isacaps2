import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionGlobalConfig } from "motion/react";
import App from "./App";
import "./styles/index.css";

// enable CSS entrance animations only once frames are really being painted (see .motion-ok in index.css)
requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add("motion-ok")));

if (import.meta.env.DEV) Object.assign(window, { __motion: MotionGlobalConfig });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
