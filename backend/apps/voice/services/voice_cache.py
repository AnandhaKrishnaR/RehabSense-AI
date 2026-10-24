"""
In-Memory and Filesystem Audio Cache for RehabSense AI Voice Services.
Caches synthesized speech responses to reduce latency, save API credits,
and eliminate network jitter for repetitive physiotherapy instructions.
"""

import os
import json
import hashlib
import threading
from pathlib import Path
from typing import Optional, Dict, Any
from django.conf import settings

CACHE_DIR_DEFAULT = Path(__file__).resolve().parent.parent.parent.parent / "var" / "cache" / "tts"
MAX_MEMORY_CACHE_ITEMS = 256


class VoiceAudioCache:
    """
    Two-tier (In-Memory LRU + Filesystem) cache for synthesized TTS audio.
    Keyed by canonical SHA-256 hash of normalized text and synthesis parameters.
    """

    def __init__(self, cache_dir: Optional[Path] = None, max_memory_items: int = MAX_MEMORY_CACHE_ITEMS):
        self.max_memory_items = max_memory_items
        self.cache_dir = cache_dir or CACHE_DIR_DEFAULT
        self._memory_cache: Dict[str, Dict[str, Any]] = {}
        self._access_order: list[str] = []
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

        # Ensure filesystem cache directory exists
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass

    @staticmethod
    def generate_cache_key(
        text: str,
        language: str,
        model: str,
        speaker: str,
        pace: float = 1.0,
        sample_rate: int = 22050,
        dictionary_id: Optional[str] = None,
    ) -> str:
        """
        Creates a deterministic SHA-256 fingerprint for text + voice settings.
        """
        norm_text = text.strip()
        composite = f"{norm_text}|{language}|{model}|{speaker}|{pace:.2f}|{sample_rate}|{dictionary_id or ''}"
        return hashlib.sha256(composite.encode("utf-8")).hexdigest()

    def get(
        self,
        text: str,
        language: str,
        model: str,
        speaker: str,
        pace: float = 1.0,
        sample_rate: int = 22050,
        dictionary_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieves cached audio payload if available.
        """
        if not getattr(settings, 'VOICE_CACHE_ENABLED', True):
            return None

        key = self.generate_cache_key(text, language, model, speaker, pace, sample_rate, dictionary_id)

        with self._lock:
            # 1. Check in-memory cache
            if key in self._memory_cache:
                self.hits += 1
                # Update LRU ordering
                if key in self._access_order:
                    self._access_order.remove(key)
                self._access_order.append(key)
                item = dict(self._memory_cache[key])
                item["cached"] = True
                return item

            # 2. Check disk cache
            disk_path = self.cache_dir / f"{key}.json"
            if disk_path.exists():
                try:
                    with open(disk_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    self.hits += 1
                    # Promote to memory cache
                    self._put_memory(key, data)
                    data["cached"] = True
                    return data
                except Exception:
                    pass

            self.misses += 1
            return None

    def set(
        self,
        text: str,
        language: str,
        model: str,
        speaker: str,
        pace: float,
        sample_rate: int,
        payload: Dict[str, Any],
        dictionary_id: Optional[str] = None,
    ) -> None:
        """
        Stores synthesized audio response in both in-memory and disk cache.
        """
        if not getattr(settings, 'VOICE_CACHE_ENABLED', True):
            return

        key = self.generate_cache_key(text, language, model, speaker, pace, sample_rate, dictionary_id)

        # Clone payload without volatile fields
        cache_data = {
            "audio_url": payload.get("audio_url"),
            "audio_base64": payload.get("audio_base64"),
            "mime_type": payload.get("mime_type", "audio/wav"),
            "provider": payload.get("provider", "sarvam"),
            "model": model,
            "speaker": speaker,
            "fallback_text": payload.get("fallback_text", text),
        }

        with self._lock:
            # Store in memory
            self._put_memory(key, cache_data)

            # Persist to disk
            disk_path = self.cache_dir / f"{key}.json"
            try:
                with open(disk_path, "w", encoding="utf-8") as f:
                    json.dump(cache_data, f)
            except Exception:
                pass

    def _put_memory(self, key: str, data: Dict[str, Any]) -> None:
        """Internal helper to insert into memory with LRU eviction."""
        if key in self._memory_cache:
            if key in self._access_order:
                self._access_order.remove(key)
        elif len(self._memory_cache) >= self.max_memory_items:
            # Evict oldest item
            if self._access_order:
                oldest_key = self._access_order.pop(0)
                self._memory_cache.pop(oldest_key, None)

        self._memory_cache[key] = data
        self._access_order.append(key)

    def clear(self) -> None:
        """Clears memory and disk cache."""
        with self._lock:
            self._memory_cache.clear()
            self._access_order.clear()
            self.hits = 0
            self.misses = 0
            try:
                for file in self.cache_dir.glob("*.json"):
                    file.unlink(missing_ok=True)
            except Exception:
                pass

    def stats(self) -> Dict[str, Any]:
        """Returns cache telemetry stats."""
        with self._lock:
            return {
                "memory_items": len(self._memory_cache),
                "hits": self.hits,
                "misses": self.misses,
                "hit_ratio": (self.hits / (self.hits + self.misses)) if (self.hits + self.misses) > 0 else 0.0,
            }


# Global singleton cache instance
voice_audio_cache = VoiceAudioCache()
