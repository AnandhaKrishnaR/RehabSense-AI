# RehabSense AI — Malayalam Voice Interaction & Symptom Extraction Architecture

## 1. Overview & Multilingual Objective

RehabSense AI enables home rehabilitation patients in Kerala and Malayalam-speaking regions to report subjective exercise symptoms, pain sensations, and difficulty in their native language (Malayalam, മലയാളം), as well as English.

Because clinical speech recognition in regional Indian languages has distinct vocabulary, colloquial expressions, and acoustic variability, our backend implements a **provider-independent voice abstraction layer** with deterministic symptom extraction safeguards.

> [!IMPORTANT]
> **Safety Safeguard — Human in the Loop Confirmation**:
> Automatic speech recognition and NLP symptom extraction can make errors. Therefore, all extracted symptom parameters (pain score, difficulty, body area) are treated as **unconfirmed drafts** (`patient_confirmed=False`). The patient is presented with the parsed result in the frontend UI and must explicitly confirm or adjust the details before they are permanently incorporated into clinical progress scoring.

---

## 2. Provider-Independent Architecture

```mermaid
flowchart TD
    Client["Client (Browser Audio MediaRecorder)"] -->|POST /api/v1/voice/transcribe/ (multipart/form-data)| VoiceView["VoiceTranscribeView"]
    ClientText["Client Text Submission (Fallback)"] -->|POST /api/v1/voice/transcribe/ (JSON / text)| VoiceView
    
    VoiceView --> Router{"Provider Factory\n(MALAYALAM_VOICE_PROVIDER)"}
    
    Router -->|'mock' (Default)| MockAdapter["MockMalayalamVoiceAdapter\n(Deterministic, offline, zero-cost)"]
    Router -->|'whisper'| WhisperAdapter["WhisperVoiceAdapter\n(Local or OpenAI Whisper API)"]
    Router -->|'ai4bharat'| AI4BharatAdapter["AI4BharatVoiceAdapter\n(IndicASR & IndicTTS)"]
    Router -->|'gtts'| GTTSAdapter["Google TTS Fallback Adapter"]
    
    MockAdapter --> Extractor["MalayalamSymptomExtractor\n(Rule-based dictionary extraction)"]
    WhisperAdapter --> Extractor
    AI4BharatAdapter --> Extractor
    
    Extractor --> Draft["Draft Symptom Object\n(patient_confirmed: false)"]
    Draft --> ClientConfirm["Frontend Confirmation Modal"]
    ClientConfirm -->|POST /api/v1/sessions/{id}/symptoms/ (patient_confirmed: true)| Persisted["SymptomReport (Database)"]
```

The voice system defines three clean, decoupled abstract interfaces:
1. `BaseSTTProvider`: Takes audio file bytes/stream, returns transcribed text and language confidence.
2. `BaseTTSProvider`: Takes text and language code, returns audio bytes/base64 and audio mime-type.
3. `BaseSymptomExtractor`: Parses natural language text (Malayalam or English), producing structured fields, confidence metadata, and clarification prompts.

---

## 3. Evaluated Malayalam Voice Technologies

We evaluated several speech-to-text and text-to-speech technologies suitable for Malayalam:

| Provider / Engine | Type | Licensing | Pros | Limitations / Hackathon Feasibility |
|---|---|---|---|---|
| **Mock Adapter** (Included) | Built-in offline | Open / MIT | Instant setup, 100% deterministic, zero network dependency, reliable unit testing | Returns canned Malayalam phrases unless text override is provided |
| **OpenAI Whisper / Whisper.cpp** | Local / Cloud API | MIT (Open source model) / Commercial API | High Malayalam vocabulary recognition, punctuation restoration, handles noise | Requires GPU for fast local execution or paid OpenAI API key (`OPENAI_API_KEY`) |
| **AI4Bharat (IndicASR / IndicTTS)** | Research Open Source | MIT / Academic (IIT Madras) | State-of-the-art for Indian languages, trained on native dialect corpora | Heavy Python dependencies (PyTorch, fairseq, complex CUDA builds), difficult on Windows without containerization |
| **Google Cloud Speech-to-Text** | Cloud API | Commercial Cloud | Excellent Malayalam (`ml-IN`) support, low latency streaming | Requires GCP project, service account JSON credentials, and billing |
| **gTTS (Google Translate TTS)** | Python library | MIT / Scraper | Free, simple text-to-speech for Malayalam audio output | Unofficial API, requires internet connection, rate limited |

### Configuration Strategy
To ensure the project runs cleanly on any reviewer's machine without requiring paid API keys or heavy GPU runtimes, **the system defaults to the Mock Provider** (`MALAYALAM_VOICE_PROVIDER=mock`). External services can be enabled simply by setting environment variables in `.env`.

---

## 4. Malayalam Symptom Vocabulary & Rule Extraction

The `MalayalamSymptomExtractor` applies deterministic pattern matching tailored to Kerala physiotherapy colloquialisms:

### 4.1 Pain Keywords and Scores
| Malayalam Keyword | Transliteration | Approximate Meaning | Default Extracted Pain Score |
|---|---|---|---|
| `വേദനയില്ല` / `വേദന ഇല്ല` | vedanayilla | No pain | `0` |
| `ചെറിയ വേദന` | cheriya vedana | Mild pain / slight pain | `2` |
| `കുറച്ച് വേദന` | kurachu vedana | A little pain | `3` |
| `ഇടത്തരം വേദന` | idatharam vedana | Moderate pain | `5` |
| `കടുത്ത വേദന` | kadutha vedana | Severe pain | `8` |
| `സഹിക്കാൻ പറ്റാത്ത വേദന` | sahikkan pattatha vedana | Unbearable pain | `9` |
| `വേദന 1` to `വേദന 10` | vedana N | Explicit numeric score | `N` |
| `വേദന കൂടുന്നു` | vedana koodunnu | Pain is increasing (worsening) | Triggers `worsening_pain: true` |

### 4.2 Difficulty & Fatigue Keywords
| Malayalam Keyword | Transliteration | Extracted Difficulty |
|---|---|---|
| `എളുപ്പമാണ്` / `എളുപ്പം` | eluppam | `"easy"` |
| `കുഴപ്പമില്ല` | kuzhappamilla | `"moderate"` |
| `ബുദ്ധിമുട്ടാണ്` / `ബുദ്ധിമുട്ട്` | buddhimuttu | `"hard"` |
| `പ്രയാസമാണ്` / `പ്രയാസം` | prayasam | `"hard"` |
| `വളരെ കഠിനം` | valare kadhinam | `"very_hard"` |
| `ക്ഷീണം` | ksheenam | `"moderate"` (fatigue noted) |

### 4.3 Anatomical Body Areas
| Malayalam Keyword | Transliteration | Extracted Body Area |
|---|---|---|
| `കൈ` | kai | `"arm"` |
| `തോൾ` | thol | `"shoulder"` |
| `മുട്ട്` / `കാൽമുട്ട്` | muttu / kalmuttu | `"knee"` |
| `കാൽ` | kaal | `"leg"` |
| `ഇടുപ്പ്` | iduppu | `"hip"` |
| `നടുവ്` / `പുറം` | naduvu / puram | `"back"` |

### 4.4 Red-Flag Urgent Symptoms (Triggers Urgent Medical Alert)
| Malayalam Keyword | Transliteration | Medical Implication | Safety Action |
|---|---|---|---|
| `നെഞ്ചുവേദന` | nenjuvedana | Chest pain | Immediate session halt, urgent medical referral |
| `ശ്വാസതടസ്സം` | shwasathadassam | Shortness of breath | Immediate session halt, urgent medical referral |
| `തലകറക്കം` | thalakarakkam | Dizziness / Vertigo | Immediate session halt, advise sitting down safely |
| `തളർച്ച` | thalarcha | Fainting / extreme weakness | Immediate session halt |

---

## 5. API Endpoints for Voice

### `POST /api/v1/voice/transcribe/`
Accepts multipart audio file or raw text.
- **Form Data**:
  - `audio`: audio file (WAV, WebM, MP3, OGG, max 10MB)
  - `language`: `"ml"` (default) or `"en"`
  - `text`: optional fallback text string (if client already has transcript or microphone is unavailable)
- **Response `200 OK`**:
```json
{
  "text": "കൈ ഉയർത്തുമ്പോൾ വേദന കൂടുന്നു",
  "language": "ml",
  "confidence": 0.95,
  "provider": "mock",
  "is_mock": true,
  "extracted_symptoms": {
    "pain_detected": true,
    "suggested_pain_score": 5,
    "suggested_difficulty": "hard",
    "body_area": "arm_shoulder",
    "worsening_pain": true,
    "clarification_needed": []
  }
}
```

### `POST /api/v1/voice/speak/`
Generates Malayalam speech audio for patient instructions and safety guidance.
- **Request Body**:
```json
{
  "text": "വ്യായാമം നിർത്തുക, ദയവായി വിശ്രമിക്കുക.",
  "language": "ml"
}
```
- **Response `200 OK`**:
```json
{
  "audio_url": null,
  "audio_base64": "UklGRi4AAABXQVZFZm10IBAAAAABAAEA...",
  "mime_type": "audio/wav",
  "provider": "mock",
  "is_mock": true,
  "fallback_text": "വ്യായാമം നിർത്തുക, ദയവായി വിശ്രമിക്കുക."
}
```
