import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, LargeBinary, String, UniqueConstraint
from sqlalchemy.orm import relationship

from backend.db.base import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class InvoiceDocument(Base):
    __tablename__ = "tesoreriapp_gp_invoice_documents"
    __table_args__ = (
        UniqueConstraint("invoice_id", "document_type", name="uq_invoice_document_type"),
    )

    id = Column(String(36), primary_key=True, default=generate_uuid)
    invoice_id = Column(String(36), ForeignKey("tesoreriapp_gp_invoices.id"), nullable=False)
    document_type = Column(String(50), nullable=False)
    file_data = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    invoice = relationship("Invoice", back_populates="documents")
