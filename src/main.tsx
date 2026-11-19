import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorFallback from "./components/ErrorFallback";
import { ErrorBoundary, initMonitoring } from "./lib/monitoring";
import { initNativeApp } from "./lib/native";
import "./index.css";

initMonitoring();

void initNativeApp();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary fallback={({ resetError }) => <ErrorFallback resetError={resetError} />}>
    <App />
  </ErrorBoundary>,
);
