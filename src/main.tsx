import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import './styles/variables.css';

// Initialize theme from localStorage or prefers-color-scheme
const initTheme = () => {
  try {
    const stored = localStorage.getItem('gera:theme');
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.dataset.theme = stored;
      return;
    }
    // 'system' or no stored value → follow OS preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.dataset.theme = 'dark';
      return;
    }
    document.documentElement.dataset.theme = 'light';
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
};

initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
