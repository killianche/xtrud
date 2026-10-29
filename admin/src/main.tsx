import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/app.css";

const container = document.getElementById("root");
if (!container) throw new Error("Не найден #root");

// Service worker — только для уведомлений (public/sw.js). Регистрируем
// сразу: уведомление может прийти, пока админка закрыта.
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .catch(() => undefined);
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
