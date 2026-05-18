"""faster-whisper distil-large-v3 STT + Piper TTS.

STT: faster-whisper (CTranslate2) — loaded on-demand via GPUManager, unloaded on silence.
TTS: Piper — CPU-only subprocess call, no VRAM.

VRAM: distil-large-v3 FP16 = ~1.5 GB, co-resident with Qwen3 8B = ~7.1 GB.
Must NOT be co-resident with BGE-M3 or HHEM.
"""

from __future__ import annotations

import logging
import os
import platform
import subprocess
import sys
import tempfile
from typing import Optional

from config.settings import settings
from core.gpu_manager import DISTIL_WHISPER_V3, get_manager

logger = logging.getLogger(__name__)

_IS_WINDOWS = platform.system() == "Windows"


class VoiceEngine:
    """faster-whisper STT + Piper TTS wrapper.

    Whisper is loaded lazily through GPUManager so it is never co-resident
    with BGE-M3 or HHEM — only with the Qwen3 8B anchor.

    Piper runs as a CPU-only subprocess; it never touches VRAM.
    """

    def __init__(
        self,
        whisper_model: Optional[str] = None,
        device: Optional[str] = None,
        piper_voice: Optional[str] = None,
    ) -> None:
        self.whisper_model: str = whisper_model or settings.whisper_model
        self.device: str = device or settings.whisper_device
        self.piper_voice: str = piper_voice or settings.piper_voice
        # Whisper is loaded on-demand inside GPUManager.acquire(); never
        # cached on self so the GPU slot is always released after each call.
        self._whisper = None  # lazy placeholder — actual load deferred to transcribe()

    # ------------------------------------------------------------------
    # STT
    # ------------------------------------------------------------------

    def transcribe(self, wav_path: str) -> str:
        """Transcribe *wav_path* with distil-large-v3.

        Loads the model inside a GPUManager.acquire() context so it is
        automatically unloaded (and VRAM freed) on return.
        Falls back to CPU int8 when CUDA is unavailable.
        """
        try:
            from faster_whisper import WhisperModel  # noqa: PLC0415
        except ImportError:
            logger.error(
                "faster-whisper is not installed.  "
                "Install with: pip install faster-whisper"
            )
            return ""

        gpu_mgr = get_manager()

        # Determine the actual device/compute_type we will use.
        import torch  # noqa: PLC0415 — imported inside method to keep module importable without torch

        cuda_ok = torch.cuda.is_available() if _has_torch() else False
        if self.device == "cuda" and not cuda_ok:
            logger.warning(
                "ARIA_WHISPER_DEVICE=cuda but CUDA is not available; "
                "falling back to CPU int8."
            )
            effective_device = "cpu"
            compute_type = "int8"
        else:
            effective_device = self.device
            compute_type = "float16" if effective_device == "cuda" else "int8"

        def _loader() -> "WhisperModel":  # type: ignore[name-defined]  # noqa: F821
            return WhisperModel(
                self.whisper_model,
                device=effective_device,
                compute_type=compute_type,
            )

        def _unloader(model: "WhisperModel") -> None:  # type: ignore[name-defined]  # noqa: F821
            # faster-whisper does not expose an explicit close(); releasing the
            # Python reference and emptying the CUDA cache (done by GPUManager)
            # is sufficient.
            del model

        try:
            with gpu_mgr.acquire(DISTIL_WHISPER_V3, _loader, _unloader) as model:
                segments, _info = model.transcribe(
                    wav_path,
                    beam_size=5,
                    language="en",
                )
                return "".join(seg.text for seg in segments).strip()
        except Exception:
            logger.exception("transcribe() failed for %s", wav_path)
            return ""

    def transcribe_microphone(self, duration_seconds: float = 5.0) -> str:
        """Record *duration_seconds* from the default mic, then transcribe.

        Requires sounddevice and scipy (or soundfile).  Returns "" with a
        warning if neither is installed.
        """
        try:
            import sounddevice as sd  # noqa: PLC0415
            import numpy as np  # noqa: PLC0415
        except ImportError:
            logger.warning(
                "sounddevice (and numpy) is required for microphone input.  "
                "Install with: pip install sounddevice numpy"
            )
            return ""

        sample_rate = 16_000  # Whisper expects 16 kHz
        logger.info("Recording %.1f s from default microphone …", duration_seconds)
        audio = sd.rec(
            int(duration_seconds * sample_rate),
            samplerate=sample_rate,
            channels=1,
            dtype="int16",
        )
        sd.wait()

        # Write to a temp WAV file so transcribe() can use the standard path.
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as fh:
            tmp_path = fh.name

        try:
            _write_wav(tmp_path, audio, sample_rate)
            return self.transcribe(tmp_path)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    # ------------------------------------------------------------------
    # TTS
    # ------------------------------------------------------------------

    def speak(self, text: str, out_path: Optional[str] = None) -> None:
        """Synthesise *text* with Piper TTS.

        On Linux/macOS the audio is piped directly to aplay/afplay.
        On Windows a WAV file is written to *out_path* (or a temp file).

        Piper must be on PATH (or installed as a Python package).
        Errors are caught and logged so that a TTS failure never crashes
        the assistant loop.
        """
        if not text:
            return

        # Sanitise text for shell injection (basic): strip quotes / newlines.
        safe_text = text.replace('"', "'").replace("\n", " ").replace("\r", " ")

        if _IS_WINDOWS:
            self._speak_windows(safe_text, out_path)
        else:
            self._speak_unix(safe_text)

    def _speak_windows(self, text: str, out_path: Optional[str]) -> None:
        """Windows path: piper writes a WAV file, then plays via winsound."""
        owns_tmp = out_path is None
        if owns_tmp:
            fd, out_path = tempfile.mkstemp(suffix=".wav")
            os.close(fd)

        try:
            result = subprocess.run(
                ["piper", "--model", self.piper_voice, "--output_file", out_path],
                input=text,
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                logger.error(
                    "Piper TTS failed (rc=%d): %s", result.returncode, result.stderr
                )
                return

            # Play via winsound (stdlib, always available on Windows).
            import winsound  # noqa: PLC0415
            winsound.PlaySound(out_path, winsound.SND_FILENAME)
        except FileNotFoundError:
            logger.error(
                "piper executable not found.  "
                "Install from https://github.com/rhasspy/piper/releases "
                "and ensure it is on PATH."
            )
        except Exception:
            logger.exception("speak() failed on Windows")
        finally:
            if owns_tmp:
                try:
                    os.unlink(out_path)
                except OSError:
                    pass

    def _speak_unix(self, text: str) -> None:
        """Linux/macOS path: pipe raw PCM through aplay / afplay."""
        is_mac = platform.system() == "Darwin"
        player_cmd = (
            ["afplay", "-"]
            if is_mac
            else ["aplay", "-r", "22050", "-f", "S16_LE", "-c", "1"]
        )
        try:
            piper_result = subprocess.run(
                ["piper", "--model", self.piper_voice, "--output_raw"],
                input=text.encode(),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            if piper_result.returncode != 0:
                logger.error(
                    "Piper TTS failed (rc=%d): %s",
                    piper_result.returncode,
                    piper_result.stderr.decode(errors="replace"),
                )
                return
            subprocess.run(
                player_cmd,
                input=piper_result.stdout,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except FileNotFoundError:
            logger.error(
                "piper or audio player not found.  "
                "Install piper and ensure aplay (Linux) / afplay (macOS) is available."
            )
        except Exception:
            logger.exception("speak() failed on Unix")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _has_torch() -> bool:
    """Return True if torch is importable (needed for CUDA check)."""
    try:
        import torch  # noqa: F401, PLC0415
        return True
    except ImportError:
        return False


def _write_wav(path: str, audio: "np.ndarray", sample_rate: int) -> None:  # type: ignore[name-defined]
    """Write a mono int16 numpy array to a WAV file (no external deps)."""
    import struct  # noqa: PLC0415
    import numpy as np  # noqa: PLC0415

    data = audio.flatten().astype(np.int16).tobytes()
    num_samples = len(data) // 2
    num_channels = 1
    bits_per_sample = 16
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    data_chunk_size = len(data)
    riff_chunk_size = 36 + data_chunk_size

    with open(path, "wb") as fh:
        fh.write(b"RIFF")
        fh.write(struct.pack("<I", riff_chunk_size))
        fh.write(b"WAVE")
        fh.write(b"fmt ")
        fh.write(struct.pack("<I", 16))          # subchunk1 size
        fh.write(struct.pack("<H", 1))           # PCM
        fh.write(struct.pack("<H", num_channels))
        fh.write(struct.pack("<I", sample_rate))
        fh.write(struct.pack("<I", byte_rate))
        fh.write(struct.pack("<H", block_align))
        fh.write(struct.pack("<H", bits_per_sample))
        fh.write(b"data")
        fh.write(struct.pack("<I", data_chunk_size))
        fh.write(data)
