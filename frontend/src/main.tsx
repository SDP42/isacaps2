import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionGlobalConfig } from "motion/react";
import App from "./App";
import "./styles/index.css";

if (import.meta.env.DEV) Object.assign(window, { __motion: MotionGlobalConfig });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
