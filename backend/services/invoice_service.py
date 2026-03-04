import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from models.movement import MovementHistory

# Movement History

def log_movement(
    db: Session,
    factura_id: str,
    usuario_id: str,
    estatus_anterior: str,
    estatus_nuevo: str,
):
    movement = MovementHistory(
        id=str(uuid.uuid4()),
        factura_id=factura_id,
        usuario_id=usuario_id,
        estatus_anterior=estatus_anterior,
        estatus_nuevo=estatus_nuevo,
        fecha_cambio=datetime.now(timezone.utc),
    )
    db.add(movement)
    db.commit()

