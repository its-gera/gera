import "./styles/variables.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/views.css";
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { platform } from "@tauri-apps/plugin-os";
import { BrowserRouter } from "react-router-dom";
import { newVault, openVault } from "./api";
import { useAppStore } from "./stores/useAppStore";
import { useGeraSync } from "./hooks/useGeraSync";
import { useKeyboard } from "./hooks/useKeyboard";
import { useTour, isTourDone } from "./hooks/useTour";
import { DesktopLayout } from "./layouts/DesktopLayout";
import { MobileLayout } from "./layouts/MobileLayout";

function usePlatform() {
  const p = platform();
  return p === 'ios' || p === 'android';
}

function AppRoot() {
  const isMobile = usePlatform();
  const loading = useAppStore((s) => s.loading);

  useGeraSync();
  useKeyboard();

  const { startTour } = useTour();
  useEffect(() => {
    if (!loading && !isTourDone()) {
      const id = setTimeout(startTour, 600);
      return () => clearTimeout(id);
    }
  }, [loading]);

  return isMobile ? <MobileLayout /> : <DesktopLayout />;
}

function App() {
  useEffect(() => {
    const handlers = [
      listen<void>("vault:new", async () => {
        const selected = await openDialog({ directory: true, title: "New Vault — Choose Folder" });
        if (selected) await newVault(selected as string);
      }),
      listen<void>("vault:open", async () => {
        const selected = await openDialog({ directory: true, title: "Open Vault — Choose Folder" });
        if (selected) await openVault(selected as string);
      }),
      listen<string>("vault:open-path", async (event) => {
        await openVault(event.payload);
      }),
    ];
    return () => { handlers.forEach((p) => p.then((unlisten) => unlisten())); };
  }, []);

  return (
    <BrowserRouter>
      <AppRoot />
    </BrowserRouter>
  );
}

export default App;
