import { platform } from '@tauri-apps/plugin-os';

export function isMobilePlatform(): boolean {
  try {
    const p = platform();
    return p === 'ios' || p === 'android';
  } catch {
    return false;
  }
}
