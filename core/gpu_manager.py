"""Re-export the shared GPUManager from aria-audit.

The audit core owns the lifecycle policy; the assistant is just another consumer.
Keeping a single instance prevents the assistant and the audit layer from
racing for VRAM.
"""

from aria_audit.gpu_manager import (
    BGE_M3,
    COLPALI,
    DISTIL_WHISPER_V3,
    GPUManager,
    HHEM_21,
    QWEN3_8B,
    SAFETY_MARGIN_GB,
    VRAMExceeded,
    get_manager,
)

__all__ = [
    "BGE_M3",
    "COLPALI",
    "DISTIL_WHISPER_V3",
    "GPUManager",
    "HHEM_21",
    "QWEN3_8B",
    "SAFETY_MARGIN_GB",
    "VRAMExceeded",
    "get_manager",
]
