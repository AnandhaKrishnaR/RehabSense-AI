# RehabSense AI — Malayalam Voice Interaction & Sarvam AI Integration

## 1. Overview & Multilingual Objective

RehabSense AI enables home rehabilitation patients in Kerala and Malayalam-speaking regions to report subjective exercise symptoms, pain sensations, and difficulty in their native language (Malayalam, മലയാളം), as well as English.

Because clinical speech recognition in regional Indian languages has distinct phonetic characteristics, regional idioms, and acoustic variability, our backend implements a **provider-independent voice abstraction layer** featuring native integration with **Sarvam AI** APIs alongside deterministic symptom extraction safeguards.

> [!IMPORTANT]
> **Safety Safeguard — Human in the Loop Confirmation**:
> Automatic speech recognition and NLP symptom extraction can make errors. Therefore, all extracted symptom parameters (pain score, difficulty, body area) are treated as **unconfirmed drafts** (`patient_confirmed=False`). The patient is presented with the parsed result in the frontend UI and must explicitly confirm or adjust the details before they are permanently incorporated into clinical progress scoring.

---

## 2. Sarvam AI Architecture & Workflow

RehabSense AI uses official Sarvam AI models specifically optimized for Indic languages:

- **Speech-to-Text (STT)**: Powered by Sarvam's **Saaras** model (`saaras:v3` or `saaras:v4`) in **transcription mode** (`mode="transcribe"`), using BCP-47 language code `ml-IN`. This preserves the patient's verbatim Malayalam spoken words without translating them to English.
- **Text-to-Speech (TTS)**: Powered by Sarvam's **Bulbul** model (`bulbul:v3`) with native Malayalam voice personas (e.g., `shubh`, `anushka`) delivering natural spoken exercise coaching and real-time rest warnings in Malayalam.

```mermaid
flowchart TD
    Patient(["Patient Voice Input (Audio Recording)"]) -->|POST /api/v1/voice/transcribe/| VoiceView["VoiceTranscribeView"]
    
    VoiceView --> Router{"Provider Factory\n(MALAYALAM_VOICE_PROVIDER)"}
    
    Router -->|'sarvam' (Production)| SarvamService["SarvamVoiceService\n(Saaras STT: ml-IN)"]
    Router -->|'mock' (Default Offline)| MockAdapter["MockVoiceAdapter\n(Deterministic, 0 cost)"]
    Router -->|'gtts'| GTTSAdapter["Google TTS Adapter"]
    Router -->|'whisper'| WhisperAdapter["Whisper Adapter"]
    
    SarvamService -->|Official sarvamai SDK| SarvamAPI[("Sarvam AI Cloud API\nhttps://api.sarvam.ai")]
    SarvamAPI -->|Transcript: ml-IN| SarvamService
    
    SarvamService --> Extractor["MalayalamSymptomExtractor\n(Clinical Rules Engine)"]
    MockAdapter --> Extractor
    
    Extractor --> Draft["Draft Symptom Object\n(patient_confirmed: false)"]
    Draft --> UIModal["Patient Confirmation Dialog (React UI)"]
    UIModal -->|POST /api/v1/sessions/{id}/symptoms/ (Confirmed)| ConfirmedReport["SymptomReport (DB)"]
    
    ConfirmedReport --> SafetyRules["Deterministic Safety Evaluator"]
    SafetyRules -->|Pain >= 7 or Worsening| ClinicianFlag["ClinicianReviewFlag (Pending Review)"]
```

---

## 3. Configuration & Secret Management

All Sarvam AI configuration is handled via environment variables in `.env` (kept safe and excluded by `.gitignore`):

| Variable | Default Value | Description |
|---|---|---|
| `MALAYALAM_VOICE_PROVIDER` | `mock` | Active provider: `sarvam`, `mock`, `gtts`, `whisper` |
| `SARVAM_API_KEY` | *(empty)* | Official Sarvam AI subscription key |
| `SARVAM_STT_MODEL` | `saaras:v3` | Model for speech-to-text transcription |
| `SARVAM_TTS_MODEL` | `bulbul:v3` | Model for Malayalam speech synthesis |
| `SARVAM_TTS_SPEAKER` | `shubh` | Speaker persona compatible with selected model |
| `SARVAM_LANGUAGE_CODE` | `ml-IN` | Target BCP-47 language code |
| `SARVAM_TIMEOUT_SECONDS`| `15.0` | Network request timeout in seconds |
| `VOICE_MAX_UPLOAD_SIZE` | `10485760` | Maximum audio upload size (10 MB) |

### Setup on Windows & VS Code PowerShell

1. **Obtain API Key**:
   - Sign up at [https://sarvam.ai/](https://sarvam.ai/).
   - Generate an API subscription key from the developer console.

2. **Configure `.env`**:
   Create a `.env` file in the project root:
   ```env
   MALAYALAM_VOICE_PROVIDER=sarvam
   SARVAM_API_KEY=your_actual_sarvam_api_key_here
   SARVAM_STT_MODEL=saaras:v3
   SARVAM_TTS_MODEL=bulbul:v3
   SARVAM_TTS_SPEAKER=shubh
   SARVAM_LANGUAGE_CODE=ml-IN
   ```

3. **Install Dependencies**:
   ```powershell
   .venv\Scripts\Activate.ps1
   pip install -r backend/requirements.txt
   ```

4. **Verify Offline Test Suite**:
   ```powershell
   python backend/manage.py test backend/tests
   ```
   All tests mock external API calls, ensuring zero credit consumption during testing.

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

### 4.2 Text-to-Speech (`POST /api/v1/voice/speak/`)

Synthesizes spoken Malayalam audio for patient coaching.

#### Request (JSON):
```json
{
  "text": "പതുക്കെ താഴേക്ക് ഇരിക്കുക, പുറം നേരെ വയ്ക്കുക.",
  "language": "ml-IN"
}
```

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
  "audio_base64": "UklGRiQAAABXQVZFZm10IBAAAAABAAEA...",
  "mime_type": "audio/wav",
  "provider": "sarvam",
  "model": "bulbul:v3",
  "speaker": "shubh",
  "request_id": "req_3d98c24b-3211-4770-9831-f925fba0b92e",
  "is_mock": false,
  "fallback_text": "പതുക്കെ താഴേക്ക് ഇരിക്കുക, പുറം നേരെ വയ്ക്കുക."
}
```

---

## 5. Error Handling & HTTP Status Codes

The service maps upstream and input errors to clean, standard HTTP status codes without exposing internal keys or secrets:

| Condition | HTTP Status | Response Payload | Description |
|---|---|---|---|
| Invalid audio format or size > 10MB | `400 Bad Request` | `{"error": "file_too_large"}` or `{"error": "unsupported_audio_format"}` | Client input validation |
| Empty text or text > 2500 chars | `400 Bad Request` | `{"error": "validation_error", "detail": "..."}` | Exceeds model character limit |
| Invalid / Expired `SARVAM_API_KEY` | `502 Bad Gateway` | `{"error": "authentication_error", "detail": "Sarvam AI authentication failed..."}` | Upstream credential error |
| Sarvam API Rate Limit (429) | `429 Too Many Requests` | `{"error": "rate_limited", "detail": "Sarvam AI rate limit exceeded..."}` | Quota exceeded |
| Sarvam API Timeout | `504 Gateway Timeout` | `{"error": "timeout", "detail": "Sarvam AI request timed out..."}` | Latency limit exceeded |
| Missing API Key / Service Outage | `503 Service Unavailable` | `{"error": "service_unavailable", "detail": "SARVAM_API_KEY is not configured..."}` | Clean offline warning without crash |

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
| `വേദന കൂടുന്നു` | vedana koodunnu | Pain is increasing (worsening) | Triggers `worsening_pain: true` |

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
