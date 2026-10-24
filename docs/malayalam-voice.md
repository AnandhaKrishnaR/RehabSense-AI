# RehabSense AI Malayalam Voice

RehabSense uses Sarvam for both incoming patient speech and application-generated guidance. Speech recognition uses Saaras v3; text-to-speech uses Bulbul v3. Provider calls are made by the backend.

## Configuration

Add the Sarvam subscription key to the root `.env` file. Do not expose it through a `VITE_*` variable or commit it.

```env
MALAYALAM_VOICE_PROVIDER=sarvam
TTS_PROVIDER=sarvam
SARVAM_API_KEY=your_sarvam_api_key
SARVAM_STT_MODEL=saaras:v3
SARVAM_TTS_MODEL=bulbul:v3
SARVAM_TTS_SPEAKER=shubh
SARVAM_LANGUAGE_CODE=ml-IN
```

Restart Django after changing environment values. The Voice settings screen supports Malayalam (`ml-IN`) and Indian English (`en-IN`); available Sarvam speakers are fetched from the backend.

## Speech Endpoints

`GET /api/v1/voice/options/?provider=sarvam&speech_language=ml-IN` returns the available voices for that language.

`POST /api/v1/voice/compatibility/` checks whether the original text matches the selected speech language. The system does not translate clinical instructions.

`POST /api/v1/voice/speak/` synthesizes the provided text. For example:

```json
{
  "text": "കൈകൾ പതുക്കെ ഉയർത്തുക.",
  "text_language": "auto",
  "speech_language": "ml-IN",
  "provider": "sarvam",
  "voice": "shubh"
}
```

The response contains base64-encoded audio and its MIME type. Long messages can return ordered audio segments. Sarvam is the only supported TTS provider; unsupported provider values are rejected.

## Patient Speech and Safety

`POST /api/v1/voice/transcribe/` accepts patient audio and returns the original transcript with extracted symptom fields. Extracted values remain unconfirmed until the patient reviews them. Patient transcripts are not translated or rewritten for speech playback.

Voice templates and terminology are in `backend/apps/voice/data/malayalam_voice.json`. Their review status is draft pending fluent-speaker and clinician review; they are not certified for clinical use.

## Testing

Run voice tests without sending provider requests:

```powershell
$env:SARVAM_API_KEY = ''
.\.venv\Scripts\python.exe backend\manage.py test tests.test_voice
Remove-Item Env:SARVAM_API_KEY
```

For live synthesis, use the app's Voice settings preview or Voice Evaluation Lab. Live synthesis requires a valid backend-only Sarvam key and may consume provider quota.
