"""CPU / GPU / RAM / disk live stats via psutil + pynvml."""

from __future__ import annotations

import logging
import shutil
import time
from typing import Any

from core.jarvis.registry import ARIATool, register

log = logging.getLogger(__name__)

# Cache pynvml handle to avoid re-init on every poll
_NVML_INITED = False
_NVML_OK = False


def _nvml() -> bool:
    """Lazy-init pynvml. Returns True if usable."""
    global _NVML_INITED, _NVML_OK
    if _NVML_INITED:
        return _NVML_OK
    try:
        import pynvml  # noqa: PLC0415
        pynvml.nvmlInit()
        _NVML_OK = True
    except Exception as exc:  # noqa: BLE001
        log.debug("pynvml init skipped: %s", exc)
        _NVML_OK = False
    _NVML_INITED = True
    return _NVML_OK


def _gpu_info() -> dict[str, Any] | None:
    if not _nvml():
        return None
    try:
        import pynvml  # noqa: PLC0415
        h = pynvml.nvmlDeviceGetHandleByIndex(0)
        name = pynvml.nvmlDeviceGetName(h)
        if isinstance(name, bytes):
            name = name.decode()
        mem = pynvml.nvmlDeviceGetMemoryInfo(h)
        util = pynvml.nvmlDeviceGetUtilizationRates(h)
        try:
            temp = pynvml.nvmlDeviceGetTemperature(h, pynvml.NVML_TEMPERATURE_GPU)
        except Exception:  # noqa: BLE001
            temp = None
        return {
            "name": name,
            "vram_used_gb": round(mem.used / 1024**3, 2),
            "vram_total_gb": round(mem.total / 1024**3, 2),
            "vram_pct": round(mem.used * 100 / max(mem.total, 1), 1),
            "util_pct": util.gpu,
            "mem_util_pct": util.memory,
            "temp_c": temp,
        }
    except Exception as exc:  # noqa: BLE001
        log.debug("pynvml read failed: %s", exc)
        return None


def snapshot() -> dict[str, Any]:
    """Single point-in-time stats snapshot for the dashboard."""
    try:
        import psutil  # noqa: PLC0415
    except Exception as exc:  # noqa: BLE001
        log.warning("psutil unavailable: %s", exc)
        return {"ok": False, "error": "psutil not installed"}

    vm = psutil.virtual_memory()
    cpu_pct = psutil.cpu_percent(interval=0.05)
    cpu_count = psutil.cpu_count(logical=True) or 1

    try:
        import os as _os  # noqa: PLC0415
        _disk_path = _os.path.splitdrive(_os.getcwd())[0] or "/"
        disk_total, disk_used, disk_free = shutil.disk_usage(_disk_path)
        disk = {
            "total_gb": round(disk_total / 1024**3, 1),
            "used_gb":  round(disk_used  / 1024**3, 1),
            "free_gb":  round(disk_free  / 1024**3, 1),
            "pct":      round(disk_used * 100 / max(disk_total, 1), 1),
        }
    except Exception:  # noqa: BLE001
        disk = None

    try:
        load1, load5, load15 = psutil.getloadavg()
    except Exception:  # noqa: BLE001
        load1 = load5 = load15 = None

    return {
        "ok": True,
        "ts": time.time(),
        "cpu":  {"pct": cpu_pct, "cores": cpu_count, "load1": load1, "load5": load5, "load15": load15},
        "ram":  {"total_gb": round(vm.total / 1024**3, 1),
                 "used_gb":  round(vm.used  / 1024**3, 1),
                 "pct":      vm.percent},
        "disk": disk,
        "gpu":  _gpu_info(),
    }


register(ARIATool(
    name="system_stats",
    category="utilities",
    description="Return current CPU / RAM / GPU / disk usage as JSON.",
    handler=snapshot,
    schema={"type": "object", "properties": {}},
    requires_audit=False,
    voice_phrases=("ARIA, system stats", "ARIA, how's the GPU"),
))
