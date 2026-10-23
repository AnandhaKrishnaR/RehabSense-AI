# RehabSense AI — Malayalam Voice Interaction

## 1. Overview & Multilingual Objective

RehabSense AI enables home rehabilitation patients in Kerala and Malayalam-speaking regions to report subjective exercise symptoms, pain sensations, and difficulty in their native language (Malayalam, മലയാളം), as well as English.

The backend keeps transcription and synthesis providers independent: Sarvam Saaras handles incoming speech, while Google Gemini TTS generates application speech. Both calls are made server-side.

> [!IMPORTANT]
> **Safety Safeguard — Human in the Loop Confirmation**:
> Automatic speech recognition and NLP symptom extraction can make errors. Therefore, all extracted symptom parameters (pain score, difficulty, body area) are treated as **unconfirmed drafts** (`patient_confirmed=False`). The patient is presented with the parsed result in the frontend UI and must explicitly confirm or adjust the details before they are permanently incorporated into clinical progress scoring.

---

## 2. Voice Architecture & Workflow

RehabSense AI uses official Sarvam AI models specifically optimized for Indic languages:

- **Speech-to-Text (STT)**: Sarvam Saaras v3 in transcription mode with `ml-IN`; patient transcripts remain the original record.
- **Text-to-Speech (TTS)**: Google Gemini 3.8 Flash TTS via the Interactions API. Malayalam is listed for both the standard and Flash-Lite models; the default is the standard model and `Kore` is the configurable prebuilt voice.

```mermaid
flowchart TD
    Patient(["Patient Voice Input (Audio Recording)"]) -->|POST /api/v1/voice/transcribe/| VoiceView["VoiceTranscribeView"]
    
    VoiceView --> STTRouter{"MALAYALAM_VOICE_PROVIDER"}
    VoiceView --> TTSRouter{"MALAYALAM_TTS_PROVIDER"}
    STTRouter -->|sarvam| SarvamService["Sarvam Saaras STT\nml-IN"]
    TTSRouter -->|gemini| GeminiService["Google Gemini TTS\nInteractions API"]
    SarvamService -->|Official sarvamai SDK| SarvamAPI[("Sarvam AI Cloud API\nhttps://api.sarvam.ai")]
    SarvamAPI -->|Transcript: ml-IN| SarvamService
    GeminiService -->|google-genai| GeminiAPI[("Gemini API\nWAV audio")]
    SarvamService --> Extractor["MalayalamSymptomExtractor"]
    Extractor --> Draft["Draft Symptom Object\n(patient_confirmed: false)"]
    Draft --> UIModal["Patient Confirmation Dialog (React UI)"]
    UIModal -->|POST /api/v1/sessions/{id}/symptoms/ (Confirmed)| ConfirmedReport["SymptomReport (DB)"]
    
    ConfirmedReport --> SafetyRules["Deterministic Safety Evaluator"]
    SafetyRules -->|Pain >= 7 or Worsening| ClinicianFlag["ClinicianReviewFlag (Pending Review)"]
```

---

## 3. Configuration & Secret Management

Provider credentials and model settings are read from backend `.env` (excluded by `.gitignore`):

| Variable | Default Value | Description |
|---|---|---|
| `MALAYALAM_VOICE_PROVIDER` | `sarvam` | STT provider; Sarvam STT remains independent from TTS |
| `MALAYALAM_TTS_PROVIDER` | `gemini` | TTS provider: `gemini`, optional `sarvam`, `gtts`, or `mock` |
| `SARVAM_API_KEY` | *(empty)* | Sarvam Saaras STT subscription key |
| `SARVAM_STT_MODEL` | `saaras:v3` | Model for speech-to-text transcription |
| `SARVAM_LANGUAGE_CODE` | `ml-IN` | Target BCP-47 language code |
| `SARVAM_TIMEOUT_SECONDS`| `15.0` | Network request timeout in seconds |
| `GEMINI_API_KEY` | *(empty)* | Google AI Studio key; backend only |
| `GEMINI_TTS_MODEL` | `gemini-3.8-flash-tts` | `gemini-3.8-flash-lite-tts` is the documented lower-latency alternative |
| `GEMINI_TTS_VOICE` | `Kore` | Configurable prebuilt Gemini voice |
| `GEMINI_TTS_TIMEOUT_SECONDS` | `30.0` | Gemini request timeout |
| `SARVAM_TTS_MODEL`, `SARVAM_TTS_SPEAKER` | legacy optional | Used only when `MALAYALAM_TTS_PROVIDER=sarvam` |
| `VOICE_MAX_UPLOAD_SIZE` | `10485760` | Maximum audio upload size (10 MB) |

Google's [speech-generation guide](https://ai.google.dev/gemini-api/docs/speech-generation) documents both selected models as supporting Malayalam, 8,192 input tokens, prebuilt voices including `Kore`, `speech_metadata.style`, and unary `audio/wav` output with an included RIFF header. The backend does not prepend a WAV header. Account entitlement is project-specific and must be verified with the configured key.

### Setup on Windows & VS Code PowerShell

1. **Obtain API Keys**:
  - Create a Gemini key at [Google AI Studio](https://aistudio.google.com/app/apikey).
  - Create a Sarvam subscription key if Saaras STT is enabled.

2. **Configure `.env`**:
   Create a `.env` file in the project root:
   ```env
   MALAYALAM_VOICE_PROVIDER=sarvam
  GEMINI_API_KEY=your_gemini_api_key
  MALAYALAM_TTS_PROVIDER=gemini
  GEMINI_TTS_MODEL=gemini-3.8-flash-tts
  GEMINI_TTS_VOICE=Kore
  SARVAM_API_KEY=your_sarvam_stt_key
   SARVAM_STT_MODEL=saaras:v3
   SARVAM_LANGUAGE_CODE=ml-IN
  SARVAM_TTS_PACE=1.0
  SARVAM_TTS_SAMPLE_RATE=22050
   ```

3. **Install Dependencies**:
   ```powershell
   .venv\Scripts\Activate.ps1
   pip install -r backend/requirements.txt
   ```

4. **Verify Without API Calls**:
   ```powershell
   python backend/manage.py test backend/tests
   ```
  All provider tests use mocked clients and consume no API credits.

---

## 4. API Contracts & Usage

### 4.1 Speech-to-Text (`POST /api/v1/voice/transcribe/`)

Transcribes patient-recorded Malayalam audio.

#### Request (Multipart Form Data):
- `audio`: Audio file (WAV, WebM, MP3, OGG, max 10MB)
- `language`: `ml-IN` (optional, default `ml-IN`)
- `text`: Text string (optional, for manual fallback)

#### Curl Example:
```bash
curl -X POST http://localhost:8000/api/v1/voice/transcribe/ \
  -F "audio=@patient_voice.webm;type=audio/webm" \
  -F "language=ml-IN"
```

#### Response (`200 OK`):
```json
{
  "text": "കൈ ഉയർത്തുമ്പോൾ തോളിന് വേദന കൂടുന്നു 7/10",
  "language": "ml-IN",
  "confidence": 0.98,
  "provider": "sarvam",
  "model": "saaras:v3",
  "request_id": "req_88f91c7a-9a02-45e3-9972-e1c390558bb9",
  "is_mock": false,
  "extracted_symptoms": {
    "pain_detected": true,
    "suggested_pain_score": 7,
    "suggested_difficulty": "",
    "body_area": "shoulder",
    "worsening_pain": true,
    "clarification_needed": [],
    "patient_confirmed": false
  }
}
```

---

### 4.2 Gemini Text-to-Speech (`POST /api/v1/voice/speak/`)

Synthesizes spoken Malayalam audio for patient coaching.

#### Request (JSON):
```json
{
  "text": "പതുക്കെ താഴേക്ക് ഇരിക്കുക, പുറം നേരെ വയ്ക്കുക.",
  "language_code": "ml-IN",
  "voice": "Kore",
  "prepare_text": true,
  "segment": false
}
```

`language_code` is accepted as an alias for the existing `language` field. The server ignores neither the model nor the key: model and API key stay in backend settings, while `voice` can override the configured voice for testing. `prepare_text: false` is used for explicit patient transcript replay and bypasses terminology/number rewriting and persistent transcript caching. Long requests are split at sentence boundaries and returned in the optional `segments` field; short requests preserve the existing single-audio JSON shape. `GET /api/v1/voice/templates/` returns configurable guidance content.

#### Curl Example:
```bash
curl -X POST http://localhost:8000/api/v1/voice/speak/ \
  -H "Content-Type: application/json" \
  -d '{"text": "പതുക്കെ താഴേക്ക് ഇരിക്കുക, പുറം നേരെ വയ്ക്കുക.", "language": "ml-IN"}'
```

#### Response (`200 OK`):
```json
{
  "audio_url": null,
  "audio_base64": "UklGR...",
  "mime_type": "audio/wav",
  "provider": "gemini",
  "model": "gemini-3.8-flash-tts",
  "speaker": "Kore",
  "is_mock": false,
  "fallback_text": "പതുക്കെ താഴേക്ക് ഇരിക്കുക, പുറം നേരെ വയ്ക്കുക.",
  "prepared_text": "പതുക്കെ താഴേക്ക് ഇരിക്കുക, പുറം നേരെ വയ്ക്കുക.",
  "cached": false
}
```

Gemini returns base64 audio through `interaction.output_audio.data`. The backend decodes and validates the returned WAV, then re-encodes those unchanged bytes into the established JSON response. Unary Gemini TTS output already contains a RIFF WAV header, so the backend does not add one. The browser plays at `1.0x` without resampling. Gemini TTS is not persistently cached; patient transcripts are sent only when the user explicitly requests transcript replay. `store=False` opts out of Interactions storage.

## 7. Text Preparation and Review Status

Terminology and spoken templates live in `backend/apps/voice/data/malayalam_voice.json`. Changes are output-only and never replace the stored patient transcript or structured symptom fields. Only explicit, context-safe forms are changed: known exercise labels/sides, known repetition units, VAS ratios, durations, and degrees. Unknown numbers and ambiguous abbreviations are preserved. No phonetic spellings or unsupported pronunciation controls are used. Gemini 3.8 turn-level delivery instructions are placed in the documented `speech_metadata.style` annotation, separate from the verbatim spoken text.

The JSON currently says `draft_pending_fluent_speaker_and_clinician_review`. The phrases have not been certified by a fluent Malayalam speaker; they require clinical and language review before production use. Safety statements must also be approved by the responsible clinician.

## 8. Evaluation

Run all 17 prepared-text cases without network or credits:

```powershell
python backend/manage.py test_malayalam_voice --all-eval --preview-only
```

With a valid backend-only `GEMINI_API_KEY`, generate actual samples and a blank qualitative-review sheet:

```powershell
python backend/manage.py test_gemini_voice --save
```

Compare raw/prepared text and multiple voices (one request per voice/variant):

```powershell
python backend/manage.py test_gemini_voice --compare-voices Kore,Puck --compare-text --save
```

Set `--model gemini-3.8-flash-lite-tts` to compare the supported alternative. Samples and the reviewer sheet are written to `backend/var/gemini-tts-samples/`; review pronunciation clarity, naturalness, normal-speed intelligibility, counts/terms, completeness, clipping/distortion, and meaning preservation. Audio results must be listened to and rated; text-only tests do not establish voice quality.

---

## 5. Error Handling & HTTP Status Codes

The service maps upstream and input errors to clean, standard HTTP status codes without exposing internal keys or secrets:

| Condition | HTTP Status | Response Payload | Description |
|---|---|---|---|
| Invalid audio format or size > 10MB | `400 Bad Request` | `{"error": "file_too_large"}` or `{"error": "unsupported_audio_format"}` | Client input validation |
| Empty text or text > 2500 chars | `400 Bad Request` | `{"error": "validation_error", "detail": "..."}` | Exceeds model character limit |
| Invalid / inaccessible `GEMINI_API_KEY` or model | `502 Bad Gateway` | `{"error": "authentication_error"}` or `{"error": "synthesis_error"}` | Sanitized upstream credential/model error |
| Gemini API rate limit / quota | `429 Too Many Requests` | `{"error": "rate_limited"}` | Retry after checking project quota |
| Gemini API timeout | `504 Gateway Timeout` | `{"error": "timeout"}` | Request timed out |
| Missing `GEMINI_API_KEY` | `503 Service Unavailable` | `{"error": "service_unavailable"}` | Configure the key in backend `.env` |

---

## 6. Malayalam Symptom Vocabulary & Rule Extraction

The `MalayalamSymptomExtractor` applies deterministic pattern matching tailored to Kerala physiotherapy colloquialisms:

### 6.1 Pain Keywords and Scores
| Malayalam Keyword | Transliteration | Approximate Meaning | Default Extracted Pain Score |
|---|---|---|---|
| `വേദനയില്ല` / `വേദന ഇല്ല` | vedanayilla | No pain | `0` |
| `ചെറിയ വേദന` | cheriya vedana | Mild pain / slight pain | `2` |
| `കുറച്ച് വേദന` | kurachu vedana | A little pain | `3` |
| `ഇടത്തരം വേദന` | idatharam vedana | Moderate pain | `5` |
| `കടുത്ത വേദന` | kadutha vedana | Severe pain | `8` |
| `സഹിക്കാൻ പറ്റാത്ത വേദന` | sahikkan pattatha vedana | Unbearable pain | `9` |
| `വേദന 1` to `വേദന 10` | vedana N | Explicit numeric score | `N` |
| `വേദന ഏഴ്` / `പത്തിൽ ആറാണ് വേദന` | spoken score | Explicit spoken Malayalam score | `7` / `6` |
| `നീറുന്നു` / `നോവുന്നു` | colloquial pain description | Pain is detected, intensity not assumed | `null` pending patient confirmation |
| `വേദന കൂടുന്നു` | vedana koodunnu | Pain is increasing (worsening) | Triggers `worsening_pain: true` |

The extractor does not assign a default score for a bare pain mention. Clear low/high-intensity wording may create a suggested score, but all suggestions remain unconfirmed; unclear colloquial intensity is shown as “Not inferred” and must be entered or confirmed by the patient.

### 6.2 Difficulty & Fatigue Keywords
| Malayalam Keyword | Transliteration | Extracted Difficulty |
|---|---|---|
| `എളുപ്പമാണ്` / `എളുപ്പം` | eluppam | `"easy"` |
| `കുഴപ്പമില്ല` | kuzhappamilla | `"moderate"` |
| `ബുദ്ധിമുട്ടാണ്` / `ബുദ്ധിമുട്ട്` | buddhimuttu | `"hard"` |
| `പ്രയാസമാണ്` / `പ്രയാസം` | prayasam | `"hard"` |
| `വളരെ കഠിനം` | valare kadhinam | `"very_hard"` |
| `ക്ഷീണം` | ksheenam | `"moderate"` (fatigue noted) |

### 6.3 Anatomical Body Areas
| Malayalam Keyword | Transliteration | Extracted Body Area |
|---|---|---|
| `കൈ` | kai | `"arm"` |
| `തോൾ` | thol | `"shoulder"` |
| `മുട്ട്` / `കാൽമുട്ട്` | muttu / kalmuttu | `"knee"` |
| `കാൽ` | kaal | `"leg"` |
| `ഇടുപ്പ്` | iduppu | `"hip"` |
| `നടുവ്` / `പുറം` | naduvu / puram | `"back"` |

### 6.4 Red-Flag Urgent Symptoms (Triggers Urgent Medical Alert)
| Malayalam Keyword | Transliteration | Medical Implication | Safety Action |
|---|---|---|---|
| `നെഞ്ചുവേദന` | nenjuvedana | Chest pain | Immediate session halt, urgent medical referral |
| `ശ്വാസതടസ്സം` | shwasathadassam | Shortness of breath | Immediate session halt, urgent medical referral |
| `തലകറക്കം` | thalakarakkam | Dizziness / Vertigo | Immediate session halt, advise sitting down safely |
| `തളർച്ച` | thalarcha | Fainting / extreme weakness | Immediate session halt |
