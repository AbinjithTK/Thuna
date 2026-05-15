# Thuna (തുണ) — Your Health Companion, Always Beside You

## The Problem

240 million elderly people in developing countries live in remote areas with limited or no internet connectivity. They manage multiple chronic conditions, take several medications daily, and have no easy access to healthcare professionals. Missed medications, forgotten appointments, and delayed care decisions cost lives.

In rural Kerala alone, 4.2 million elderly people depend on family members or community health workers for basic health guidance — but these helpers aren't always available.

## The Solution

Thuna (meaning "companion/support" in Malayalam) is a voice-first AI health assistant that runs entirely on a smartphone with zero internet dependency. Powered by Gemma 4 E2B running on-device via the Cactus inference engine, Thuna acts as a personal health companion that:

- Understands voice input in Malayalam/Manglish and responds naturally
- Intelligently extracts medications from conversations and stores them in an openEHR-compliant local database
- Automatically sets TTS-based medication reminders that speak in Malayalam
- Tracks health conditions, vitals, and creates a patient timeline
- Provides clinical guidance like a friendly village doctor on the phone
- Works 100% offline after initial model download

## Technical Architecture

```
User Voice/Text Input
       │
       ▼
┌──────────────────────┐
│ IntentParser          │ ← Deterministic, instant
│ (Regex + Keywords)    │   Extracts: medications, conditions, queries
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ AgentEngine           │ ← Reliable tool execution
│ • save_medication     │   WatermelonDB + openEHR Flat JSON
│ • schedule_reminder   │   SQLite on-device
│ • query_history       │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Gemma 4 E2B (Cactus) │ ← Natural language response only
│ INT4 quantization     │   Malayalam output generation
│ ~1.5GB RAM footprint  │   Conversational, warm tone
└──────────────────────┘
           │
           ▼
    Malayalam TTS Output
```

This architecture separates "doing" (deterministic, reliable) from "talking" (LLM). The IntentParser handles medication extraction with 100% reliability using pattern matching, while Gemma 4 focuses solely on generating natural Malayalam responses — what it does best.

## Gemma 4 Usage

- **Model**: Gemma 4 E2B Instruction-Tuned (INT4 via Cactus)
- **Role**: Natural language understanding + Malayalam response generation
- **Context**: 128K token window holds full patient conversation history
- **Multilingual**: Understands Manglish input, responds in proper Malayalam
- **On-device**: Zero cloud dependency, complete privacy

## Cactus Engine Integration

- Zero-copy memory mapping for efficient RAM usage
- ARM SIMD optimized kernels for mobile processors
- INT4 quantization — runs on 6GB+ RAM devices
- Automatic model download with progress tracking
- Native C++ inference via Nitro Modules bridge

## openEHR Health Records

Patient data is stored locally using the openEHR Flat JSON standard:

- Medications with dosage, frequency, duration, prescriber
- Medical conditions with severity and status tracking
- Health timeline with dated entries
- Medication reminders with custom Malayalam TTS messages
- All data queryable by the AI agent for contextual responses

## Voice Conversation System

- Android native SpeechRecognizer for voice input
- Continuous conversation mode (like a phone call with a doctor)
- Auto-restarts listening after AI responds
- Malayalam TTS output with natural speech rate
- Handles Manglish (code-mixed Malayalam-English) natively

## Intelligent Onboarding

First-time users go through a conversational health questionnaire:

- Name, age, gender, location
- Blood group, existing conditions
- Current medications, allergies
- Emergency contact

This builds the patient profile that the AI uses for personalized responses.

## Impact

| Metric | Value |
|--------|-------|
| Target users | 240M elderly in remote areas globally |
| Languages | Malayalam (expandable to 140+ via Gemma 4) |
| Hardware requirement | Any Android phone, 6GB+ RAM |
| Internet needed | Only for initial model download (~5GB one-time) |
| Cost | Free, open-source |
| Privacy | All data stays on-device, never leaves the phone |

## Why This Wins

1. **Real problem, real users** — elderly people in remote areas with no internet
2. **Gemma 4 as the brain** — not a wrapper, genuine on-device intelligence
3. **Cactus for deployment** — production-grade mobile inference
4. **openEHR standard** — interoperable health records, not a toy database
5. **Voice-first** — accessible to people who can't read or type easily
6. **100% offline** — works in areas with zero connectivity
7. **Malayalam-native** — serves an underrepresented language community

## Tech Stack

| Layer | Technology |
|-------|-----------|
| LLM | Gemma 4 E2B (INT4) via Cactus v1.7 |
| Framework | React Native 0.82 (New Architecture) |
| Database | WatermelonDB + openEHR Flat JSON |
| STT | Android SpeechRecognizer (ml-IN) |
| TTS | Android TextToSpeech (ml-IN) |
| Agent | Custom IntentParser + AgentEngine |
| Navigation | React Navigation 7 (tabs) |

## Future Roadmap

- Cactus Whisper integration for offline Malayalam STT
- Prescription photo OCR (when device RAM allows)
- Sync to cloud EHR when connectivity available
- Multi-patient support for CHWs
- Wearable integration (BP monitors, glucometers)
