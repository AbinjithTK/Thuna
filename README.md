# Thuna (തുണ) — Your Health Companion

**Offline AI health assistant for elderly people in remote areas, powered by Gemma 4 E2B on-device.**

## Quick Start

```bash
npm install
npx react-native run-android
```

## Architecture

```
Voice/Text Input → IntentParser (deterministic) → AgentEngine (DB ops) → Gemma 4 E2B (response) → Malayalam TTS
```

- **IntentParser**: Regex-based extraction for medications, vitals, conditions, lab results (100% reliable)
- **AgentEngine**: Executes tools against WatermelonDB (save_vital, save_medication, schedule_reminder, etc.)
- **Gemma 4 E2B**: Generates natural Malayalam responses only (not used for data extraction)
- **Cactus v1.7**: On-device inference engine with zero-copy memory mapping

## Tech Stack

| Layer | Technology |
|-------|-----------|
| LLM | Gemma 4 E2B INT4 via Cactus v1.7 |
| STT | Cactus Whisper (Malayalam) + Android SpeechRecognizer |
| TTS | Android TextToSpeech (ml-IN) |
| Database | WatermelonDB + openEHR Flat JSON |
| Framework | React Native 0.82 (New Architecture) |
| Navigation | React Navigation 7 (tabs + stack) |

## Features

- Voice-first Malayalam interaction
- BP, sugar, SpO2, temperature, heart rate tracking with critical alerts
- Medication management with auto-reminders
- Condition tracking with ICD-10 codes
- Lab result recording with normal range checking
- Prescription photo analysis (multimodal)
- 100% offline after initial model download (~5GB one-time)

## Project Structure

```
src/
├── agent/          # IntentParser + AgentEngine (deterministic layer)
├── components/     # ErrorBoundary, reusable UI
├── context/        # CactusContext (LLM + STT), UserContext
├── db/             # WatermelonDB schema + models
├── screens/        # Login, Home, Triage, Profile, Reminders, Onboarding
├── tools/          # Agent tools, EHR tools, triage tools
├── types/          # TypeScript types
└── theme.ts        # Design system
```

## License

Apache 2.0
