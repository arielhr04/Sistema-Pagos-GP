import uuid
from datetime import datetime, timezone

# Movement History
async def log_movement(factura_id: str, usuario_id: str, estatus_anterior: str, estatus_nuevo: str):
    movement = {
        "id": str(uuid.uuid4()),
        "factura_id": factura_id,
        "usuario_id": usuario_id,
        "estatus_anterior": estatus_anterior,
        "estatus_nuevo": estatus_nuevo,
        "fecha_cambio": datetime.now(timezone.utc).isoformat()
    }
    await db.movement_history.insert_one(movement)
