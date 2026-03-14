"""Rate limiter en memoria — protege endpoints contra fuerza bruta."""

import time
import threading
from typing import Optional

# Configuración por defecto (ajustable)
MAX_ATTEMPTS = 5          # Intentos permitidos por ventana
WINDOW_SECONDS = 15 * 60  # Ventana de 15 minutos
CLEANUP_INTERVAL = 300    # Limpiar entradas expiradas cada 5 min

_store: dict[str, dict] = {}
_lock = threading.Lock()
_last_cleanup = time.time()


def _cleanup_expired() -> None:
    """Eliminar entradas expiradas del store (se ejecuta periódicamente)."""
    now = time.time()
    expired_keys = [k for k, v in _store.items() if now - v["first"] > WINDOW_SECONDS]
    for key in expired_keys:
        del _store[key]


def check_rate_limit(key: str) -> Optional[int]:
    """Verificar si una clave (IP) excedió el límite.

    Retorna None si puede continuar, o los segundos restantes de bloqueo.
    """
    global _last_cleanup
    now = time.time()

    with _lock:
        # Limpieza periódica de entradas viejas
        if now - _last_cleanup > CLEANUP_INTERVAL:
            _cleanup_expired()
            _last_cleanup = now

        entry = _store.get(key)

        if entry is None:
            # Primer intento — registrar
            _store[key] = {"count": 1, "first": now}
            return None

        elapsed = now - entry["first"]

        # Ventana expirada — reiniciar
        if elapsed > WINDOW_SECONDS:
            _store[key] = {"count": 1, "first": now}
            return None

        # Dentro de la ventana — verificar límite
        if entry["count"] >= MAX_ATTEMPTS:
            remaining = int(WINDOW_SECONDS - elapsed)
            return max(remaining, 1)

        # Incrementar contador
        entry["count"] += 1
        return None


def reset_rate_limit(key: str) -> None:
    """Reiniciar contador tras login exitoso."""
    with _lock:
        _store.pop(key, None)
