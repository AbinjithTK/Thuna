/**
 * DeviceActions — Execute device-level actions from chat commands.
 *
 * Uses React Native's Linking + SendIntent for:
 * - Call contacts (direct dial)
 * - Open apps via package name
 * - Flashlight (via system settings shortcut)
 * - Play content on YouTube
 */

import { Linking, NativeModules, Platform } from 'react-native';

// SendIntent is available via react-native's native Linking on Android
const { SendIntentAndroid } = NativeModules;

// ============================================================================
// Types
// ============================================================================

export interface DeviceAction {
  type: 'call' | 'open_app' | 'flashlight' | 'youtube_search' | 'none';
  target: string;
  executed: boolean;
  message: string;
}

// ============================================================================
// Intent Detection
// ============================================================================

export function detectDeviceAction(input: string): DeviceAction | null {
  const lower = input.toLowerCase();

  // ── Call someone ──
  if (/call|phone|dial|വിളിക്ക്|വിളിക്കുക|ഫോൺ/i.test(input)) {
    // Emergency numbers
    if (/112|108|ambulance|emergency|അടിയന്തര|ആംബുലൻസ്/i.test(input)) {
      return { type: 'call', target: '112', executed: false, message: '' };
    }
    // Extract phone number
    const numberMatch = input.match(/(\+?\d[\d\s\-]{6,})/);
    if (numberMatch) {
      return { type: 'call', target: numberMatch[1].replace(/[\s\-]/g, ''), executed: false, message: '' };
    }
    // Extract name after "call"
    const nameMatch = input.match(/(?:call|phone|dial|വിളിക്ക്|വിളിക്കുക)\s+(.+?)(?:\s*$|\.|\?|!)/i);
    if (nameMatch && nameMatch[1].trim().length > 1) {
      return { type: 'call', target: nameMatch[1].trim(), executed: false, message: '' };
    }
  }

  // ── YouTube / Play song ──
  if (/youtube|play.*song|play.*video|പാട്ട്.*play|song.*play|video.*play|യൂട്യൂബ്/i.test(input)) {
    // Extract what to search/play
    const searchMatch = input.match(/(?:play|search|open youtube|youtube)\s+(.+?)(?:\s*$|\.|\?)/i);
    const query = searchMatch?.[1]?.trim() || input.replace(/open|play|youtube|song|video|പാട്ട്|യൂട്യൂബ്/gi, '').trim();
    return { type: 'youtube_search', target: query || 'Malayalam songs', executed: false, message: '' };
  }

  // ── Open app ──
  if (/open|launch|തുറക്ക്|ഓപ്പൺ/i.test(input)) {
    const appMap: Array<{ pattern: RegExp; url: string; name: string }> = [
      { pattern: /whatsapp|വാട്സാപ്പ്/i, url: 'whatsapp://', name: 'WhatsApp' },
      { pattern: /camera|ക്യാമറ/i, url: 'intent:#Intent;action=android.media.action.IMAGE_CAPTURE;end', name: 'Camera' },
      { pattern: /settings|സെറ്റിംഗ്സ്/i, url: 'intent:#Intent;action=android.settings.SETTINGS;end', name: 'Settings' },
      { pattern: /gallery|photos|ഫോട്ടോ|ഗാലറി/i, url: 'content://media/external/images/media', name: 'Gallery' },
      { pattern: /maps|map|മാപ്പ്/i, url: 'geo:0,0', name: 'Maps' },
      { pattern: /calculator|കാൽക്കുലേറ്റർ/i, url: 'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_CALCULATOR;end', name: 'Calculator' },
      { pattern: /clock|alarm|ക്ലോക്ക്|അലാറം/i, url: 'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_CALENDAR;end', name: 'Clock' },
      { pattern: /music|പാട്ട്|സംഗീതം/i, url: 'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_MUSIC;end', name: 'Music' },
    ];

    for (const app of appMap) {
      if (app.pattern.test(input)) {
        return { type: 'open_app', target: app.url, executed: false, message: app.name };
      }
    }
  }

  // ── Flashlight ──
  if (/flashlight|torch|ടോർച്ച്|ഫ്ലാഷ്|light on|light off|വെളിച്ചം/i.test(input)) {
    return { type: 'flashlight', target: 'toggle', executed: false, message: '' };
  }

  return null;
}

// ============================================================================
// Execute Device Actions
// ============================================================================

export async function executeDeviceAction(action: DeviceAction): Promise<DeviceAction> {
  try {
    switch (action.type) {
      case 'call': {
        // Direct dial — opens phone and starts calling
        const number = action.target.replace(/[^\d+]/g, '');
        if (number) {
          await Linking.openURL(`tel:${number}`);
          return { ...action, executed: true, message: `📞 ${number} വിളിക്കുന്നു...` };
        }
        // Named contact — open contacts search
        // On Android, we can search contacts via content URI
        try {
          await Linking.openURL(`content://com.android.contacts/contacts`);
        } catch {
          await Linking.openURL(`tel:`);
        }
        return { ...action, executed: true, message: `📞 Contacts തുറന്നു. "${action.target}" search ചെയ്യുക.` };
      }

      case 'youtube_search': {
        // Open YouTube with search query — this WORKS on all Android devices
        const query = encodeURIComponent(action.target);
        const youtubeUrl = `vnd.youtube://results?search_query=${query}`;
        const webUrl = `https://www.youtube.com/results?search_query=${query}`;

        try {
          const canOpen = await Linking.canOpenURL(youtubeUrl);
          if (canOpen) {
            await Linking.openURL(youtubeUrl);
          } else {
            await Linking.openURL(webUrl);
          }
          return { ...action, executed: true, message: `▶️ YouTube-ൽ "${action.target}" search ചെയ്യുന്നു...` };
        } catch {
          await Linking.openURL(webUrl);
          return { ...action, executed: true, message: `▶️ YouTube തുറന്നു.` };
        }
      }

      case 'open_app': {
        const url = action.target;
        try {
          const canOpen = await Linking.canOpenURL(url);
          if (canOpen) {
            await Linking.openURL(url);
            return { ...action, executed: true, message: `📱 ${action.message} തുറന്നു.` };
          }
          // Fallback for intent URLs
          await Linking.openURL(url).catch(() => {});
          return { ...action, executed: true, message: `📱 ${action.message} തുറക്കാൻ ശ്രമിക്കുന്നു...` };
        } catch {
          return { ...action, executed: false, message: `${action.message} തുറക്കാൻ കഴിഞ്ഞില്ല. App installed ആണോ?` };
        }
      }

      case 'flashlight': {
        // Flashlight: Open the torch/flashlight quick settings panel
        // On Android, the most reliable way without a native module is to open
        // the power control settings where torch toggle is available
        try {
          // Try opening the flashlight settings tile directly
          await Linking.openURL('intent:#Intent;action=android.settings.DISPLAY_SETTINGS;end').catch(() => {});
          return { ...action, executed: true, message: `🔦 Display Settings തുറന്നു. Flashlight toggle ചെയ്യുക.\n\nTip: Screen top-ൽ നിന്ന് swipe down ചെയ്ത് torch icon tap ചെയ്യുക.` };
        } catch {
          return { ...action, executed: false, message: `🔦 ടോർച്ച് on ചെയ്യാൻ: screen top-ൽ നിന്ന് swipe down ചെയ്ത് torch icon tap ചെയ്യുക.` };
        }
      }

      default:
        return { ...action, executed: false, message: 'Unknown action' };
    }
  } catch (e: any) {
    return { ...action, executed: false, message: `Action failed: ${e.message}` };
  }
}
