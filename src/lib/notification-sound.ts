/**
 * Unified Notification Module
 *
 * Centralizes all notification logic:
 * - Native browser notifications (always silent)
 * - Programmatic sound via Web Audio API (no files needed, no permissions needed)
 *
 * Usage:
 *   sendAppNotification({ title, body, settings })
 */

import type { UserSettings } from "./schemas";

// ── Web Audio API chime ─────────────────────────────────────────────────────

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext || audioContext.state === "closed") {
    audioContext = new AudioContext();
  }
  return audioContext;
}

/**
 * Plays a pleasant two-tone notification chime using Web Audio API.
 * No external audio files needed — works everywhere including unsigned macOS apps.
 */
export function playNotificationSound(volume: number = 0.3): void {
  try {
    const ctx = getAudioContext();

    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // Master gain
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(volume, now);
    masterGain.connect(ctx.destination);

    // — Tone 1: Rising note (D5 → E5) —
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);       // D5
    osc1.frequency.setValueAtTime(659.25, now + 0.08); // E5
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.6, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.15, now + 0.15);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // — Tone 2: Higher resolution note (A5) —
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.1); // A5
    gain2.gain.setValueAtTime(0, now + 0.1);
    gain2.gain.linearRampToValueAtTime(0.5, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.1, now + 0.25);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.5);

    // — Tone 3: Subtle harmonic overtone for warmth (E6) —
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = "triangle";
    osc3.frequency.setValueAtTime(1318.5, now + 0.1); // E6
    gain3.gain.setValueAtTime(0, now + 0.1);
    gain3.gain.linearRampToValueAtTime(0.15, now + 0.13);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc3.connect(gain3);
    gain3.connect(masterGain);
    osc3.start(now + 0.1);
    osc3.stop(now + 0.4);

    // Cleanup
    setTimeout(() => {
      masterGain.disconnect();
    }, 600);
  } catch (error) {
    console.warn("[notification-sound] Could not play notification sound:", error);
  }
}

// ── Unified notification dispatcher ─────────────────────────────────────────

interface NotificationParams {
  title: string;
  body: string;
  settings: Pick<UserSettings, "enableChatCompletionNotifications" | "enableNotificationSound"> | null;
}

/**
 * Sends a notification respecting user settings:
 * - Native notification (always silent) if `enableChatCompletionNotifications` is on
 * - Programmatic sound if `enableNotificationSound` is on
 *
 * Designed to work on unsigned macOS apps where native notifications may fail.
 */
export function sendAppNotification({ title, body, settings }: NotificationParams): void {
  const notificationsEnabled = settings?.enableChatCompletionNotifications === true;
  const soundEnabled = settings?.enableNotificationSound !== false; // default true

  // Native notification (always silent — sound is handled separately)
  if (notificationsEnabled) {
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, silent: true });
      }
    } catch {
      // Native notifications unavailable (e.g. unsigned macOS app) — not critical
    }
  }

  // Programmatic sound via Web Audio API
  if (soundEnabled) {
    playNotificationSound();
  }

  // Activate tray badge (red dot) so the user knows there's pending activity
  // even if the window is minimized to the system tray
  if (notificationsEnabled || soundEnabled) {
    try {
      (window as any).electron?.ipcRenderer?.invoke("tray:set-badge");
    } catch {
      // Not critical — tray badge is a nice-to-have
    }
  }
}
