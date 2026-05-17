"""Wake detection: openWakeWord phrase + MediaPipe Hands gesture.

Both are CPU-only. No VRAM impact.
openWakeWord: Apache 2.0, beats Porcupine on accuracy.
MediaPipe Hands: usability flourish — NOT a research contribution.

SECURITY NOTE: For personal use only. Wake phrase detection runs continuously.
"""

from __future__ import annotations

import logging
import time
from typing import Callable, Optional

from config.settings import settings

logger = logging.getLogger(__name__)


class WakeSystem:
    """CPU-only wake detector: openWakeWord phrase + optional MediaPipe Hands thumbs-up.

    openWakeWord is loaded lazily on the first call to listen_for_wake().
    MediaPipe is imported lazily in detect_gesture() only when use_gesture=True.

    Both subsystems degrade gracefully when their optional dependency is absent:
    - openWakeWord absent → fall back to blocking input("Press Enter to activate…")
    - mediapipe absent → detect_gesture() returns False with a warning
    """

    def __init__(
        self,
        wake_phrase: Optional[str] = None,
        use_gesture: bool = False,
    ) -> None:
        self.wake_phrase: str = wake_phrase or settings.wake_phrase
        self.use_gesture: bool = use_gesture
        # Model handle stored after first load; None until then.
        self._oww_model: object = None  # type: ignore[assignment]

    # ------------------------------------------------------------------
    # openWakeWord
    # ------------------------------------------------------------------

    def _load_oww(self) -> bool:
        """Load the openWakeWord model.  Returns True on success."""
        if self._oww_model is not None:
            return True
        try:
            import openwakeword  # noqa: PLC0415
            from openwakeword.model import Model  # noqa: PLC0415

            # openWakeWord ships pre-trained models; the phrase is matched by
            # model name convention.  For custom phrases a fine-tuned model
            # file can be pointed to via the ARIA_WAKE_PHRASE env var.
            self._oww_model = Model(
                wakeword_models=[],   # use built-in models
                inference_framework="onnx",
            )
            logger.info("openWakeWord loaded (phrase=%r)", self.wake_phrase)
            return True
        except ImportError:
            logger.warning(
                "openWakeWord is not installed.  "
                "Install with: pip install openwakeword  "
                "Falling back to keyboard trigger."
            )
            return False
        except Exception:
            logger.exception("Failed to load openWakeWord model")
            return False

    def listen_for_wake(
        self,
        callback: Optional[Callable[[], None]] = None,
        timeout_seconds: Optional[float] = None,
    ) -> bool:
        """Block until the wake phrase is detected (or timeout expires).

        Parameters
        ----------
        callback:
            Optional zero-argument callable invoked immediately upon detection.
        timeout_seconds:
            If set, stop listening after this many seconds even if the phrase
            was not heard.  Returns False on timeout.

        Returns
        -------
        True  — wake phrase was detected.
        False — timed out without detection.
        """
        oww_available = self._load_oww()

        if not oww_available:
            return self._keyboard_fallback(timeout_seconds)

        try:
            import pyaudio  # noqa: PLC0415
            import numpy as np  # noqa: PLC0415
        except ImportError:
            logger.warning(
                "pyaudio / numpy not installed; cannot stream microphone for wake word.  "
                "Install with: pip install pyaudio numpy  "
                "Falling back to keyboard trigger."
            )
            return self._keyboard_fallback(timeout_seconds)

        chunk_size = 1280         # 80 ms at 16 kHz — openWakeWord recommended
        sample_rate = 16_000
        deadline = time.monotonic() + timeout_seconds if timeout_seconds else None

        pa = pyaudio.PyAudio()
        stream = pa.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=sample_rate,
            input=True,
            frames_per_buffer=chunk_size,
        )
        logger.info("Listening for wake phrase %r …", self.wake_phrase)

        try:
            while True:
                if deadline and time.monotonic() >= deadline:
                    logger.debug("listen_for_wake: timeout reached")
                    return False

                raw = stream.read(chunk_size, exception_on_overflow=False)
                audio_chunk = (
                    np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
                )
                self._oww_model.predict(audio_chunk)  # type: ignore[union-attr]
                scores: dict[str, float] = self._oww_model.prediction_buffer  # type: ignore[union-attr]

                # openWakeWord returns scores per model name; we check for any
                # model whose name contains the wake phrase keyword.
                phrase_key = self.wake_phrase.lower().replace(" ", "_")
                activated = any(
                    phrase_key in k.lower() and max(v) >= 0.5
                    for k, v in scores.items()
                )
                if activated:
                    logger.info("Wake phrase detected.")
                    if callback is not None:
                        callback()
                    return True
        finally:
            stream.stop_stream()
            stream.close()
            pa.terminate()

    def _keyboard_fallback(self, timeout_seconds: Optional[float]) -> bool:
        """Prompt the user to press Enter — used when openWakeWord is absent."""
        if timeout_seconds is not None:
            # Non-blocking timeout not easily achievable with input(); treat it
            # as an immediate False so the caller can retry with a UI prompt.
            logger.warning(
                "openWakeWord unavailable and timeout set — returning False immediately."
            )
            return False
        try:
            input("openWakeWord unavailable. Press Enter to activate ARIA … ")
            return True
        except (EOFError, KeyboardInterrupt):
            return False

    # ------------------------------------------------------------------
    # MediaPipe Hands gesture
    # ------------------------------------------------------------------

    def detect_gesture(self) -> bool:
        """Capture one webcam frame and return True if a thumbs-up is detected.

        Returns False (with a warning) if mediapipe or opencv-python is not
        installed.
        """
        try:
            import cv2  # noqa: PLC0415
            import mediapipe as mp  # noqa: PLC0415
        except ImportError:
            logger.warning(
                "mediapipe / opencv-python not installed; gesture detection disabled.  "
                "Install with: pip install mediapipe opencv-python"
            )
            return False

        try:
            cap = cv2.VideoCapture(0)
            if not cap.isOpened():
                logger.warning("No webcam found; gesture detection unavailable.")
                return False

            ret, frame = cap.read()
            cap.release()
            if not ret or frame is None:
                logger.warning("Failed to capture webcam frame.")
                return False

            hands = mp.solutions.hands.Hands(
                static_image_mode=True,
                max_num_hands=1,
                min_detection_confidence=0.7,
            )
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = hands.process(rgb)
            hands.close()

            if not result.multi_hand_landmarks:
                return False

            return _is_thumbs_up(result.multi_hand_landmarks[0])
        except Exception:
            logger.exception("detect_gesture() encountered an error")
            return False

    # ------------------------------------------------------------------
    # Combined activation check
    # ------------------------------------------------------------------

    def is_activated(self) -> bool:
        """Return True if the voice wake phrase was heard OR a thumbs-up was detected.

        When use_gesture is False the gesture check is skipped entirely.
        The voice check calls listen_for_wake() with a short 3-second timeout
        so this method is not permanently blocking.
        """
        voice_active = self.listen_for_wake(timeout_seconds=3.0)
        if voice_active:
            return True
        if self.use_gesture:
            return self.detect_gesture()
        return False


# ---------------------------------------------------------------------------
# Clap detector
# ---------------------------------------------------------------------------

class ClapDetector:
    """Detects a double-clap pattern: two amplitude spikes within *window_ms* ms.

    Designed for use with sounddevice int16 audio chunks at 16 kHz / blocksize 1280.
    Thread-safe: process_chunk() has no shared mutable state beyond _clap_times (list,
    not accessed from multiple threads in the API's single background thread).
    """

    def __init__(self, threshold: float = 0.15, window_ms: float = 800.0) -> None:
        """
        Parameters
        ----------
        threshold:
            RMS threshold (0–1 normalised float) above which a frame counts as a clap.
        window_ms:
            Maximum gap between first and second clap in milliseconds.
        """
        self.threshold = threshold
        self.window_ms = window_ms
        self._clap_times: list[float] = []   # monotonic ms timestamps

    def process_chunk(self, chunk: "np.ndarray") -> bool:  # type: ignore[name-defined]
        """Return True if a double-clap was detected in this chunk.

        Parameters
        ----------
        chunk:
            1-D NumPy array, either int16 raw samples or float32 normalised.
            If dtype is int16 the values are normalised to ±1 before RMS.
        """
        try:
            import numpy as np  # noqa: PLC0415
            import time  # noqa: PLC0415

            arr = chunk.astype(np.float32)
            if arr.dtype == np.float32 and np.max(np.abs(arr)) > 1.5:
                # Looks like int16 — normalise
                arr = arr / 32768.0

            rms = float(np.sqrt(np.mean(arr ** 2)))
            if rms < self.threshold:
                return False

            now_ms = time.monotonic() * 1000.0
            self._clap_times.append(now_ms)
            # Keep at most last 5 timestamps
            if len(self._clap_times) > 5:
                self._clap_times = self._clap_times[-5:]

            if len(self._clap_times) >= 2:
                gap = self._clap_times[-1] - self._clap_times[-2]
                # 80 ms minimum (avoid double-trigger on a single loud clap)
                if 80.0 < gap < self.window_ms:
                    self._clap_times.clear()
                    return True
        except Exception:
            pass
        return False


# ---------------------------------------------------------------------------
# Thumbs-up heuristic
# ---------------------------------------------------------------------------

def _is_thumbs_up(hand_landmarks: object) -> bool:  # type: ignore[override]
    """Return True if the hand landmark pattern matches a thumbs-up gesture.

    Heuristic: thumb tip (landmark 4) is above the thumb MCP (landmark 2) AND
    all other finger tips (8, 12, 16, 20) are below their respective PIP joints
    (6, 10, 14, 18) — i.e. only the thumb is extended.

    MediaPipe landmark y-coordinates increase downward in image space, so
    "above" means a smaller y value.
    """
    try:
        lm = hand_landmarks.landmark  # type: ignore[attr-defined]
        # Thumb extended upward
        thumb_up = lm[4].y < lm[2].y
        # All other fingers curled
        fingers_curled = all(
            lm[tip].y > lm[pip].y
            for tip, pip in [(8, 6), (12, 10), (16, 14), (20, 18)]
        )
        return thumb_up and fingers_curled
    except (AttributeError, IndexError):
        return False
