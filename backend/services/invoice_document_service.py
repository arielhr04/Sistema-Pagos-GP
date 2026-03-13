from datetime import datetime
from typing import Dict, Iterable, Optional, Set, Tuple

from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.models.invoice import Invoice
from backend.models.invoice_document import InvoiceDocument


DOC_TYPE_INVOICE_PDF = "invoice_pdf"
DOC_TYPE_PAYMENT_PROOF = "payment_proof"


def get_invoice_document(db: Session, invoice_id: str, document_type: str) -> Optional[InvoiceDocument]:
    return (
        db.query(InvoiceDocument)
        .filter(
            InvoiceDocument.invoice_id == invoice_id,
            InvoiceDocument.document_type == document_type,
        )
        .first()
    )


def has_invoice_document(db: Session, invoice_id: str, document_type: str) -> bool:
    return (
        db.query(InvoiceDocument.id)
        .filter(
            InvoiceDocument.invoice_id == invoice_id,
            InvoiceDocument.document_type == document_type,
        )
        .first()
        is not None
    )


def get_invoice_document_presence_map(
    db: Session,
    invoice_ids: Iterable[str],
    document_type: str,
) -> Set[str]:
    ids = [invoice_id for invoice_id in invoice_ids if invoice_id]
    if not ids:
        return set()

    rows = (
        db.query(InvoiceDocument.invoice_id)
        .filter(
            InvoiceDocument.invoice_id.in_(ids),
            InvoiceDocument.document_type == document_type,
        )
        .all()
    )
    return {invoice_id for (invoice_id,) in rows}


def upsert_invoice_document(
    db: Session,
    invoice_id: str,
    document_type: str,
    file_data: bytes,
) -> InvoiceDocument:
    existing = get_invoice_document(db, invoice_id, document_type)
    now = datetime.utcnow()

    if existing:
        existing.file_data = file_data
        existing.updated_at = now
        return existing

    doc = InvoiceDocument(
        invoice_id=invoice_id,
        document_type=document_type,
        file_data=file_data,
        created_at=now,
        updated_at=now,
    )
    db.add(doc)
    return doc


def migrate_legacy_invoice_documents(db: Session) -> Dict[str, int]:
    existing_keys: Set[Tuple[str, str]] = {
        (invoice_id, document_type)
        for invoice_id, document_type in db.query(
            InvoiceDocument.invoice_id,
            InvoiceDocument.document_type,
        ).all()
    }

    invoices = (
        db.query(Invoice)
        .filter(
            or_(
                Invoice.pdf_data.is_not(None),
                Invoice.comprobante_pago_data.is_not(None),
            )
        )
        .all()
    )

    migrated_count = 0
    cleaned_legacy_count = 0

    if not invoices:
        return {
            "invoices_scanned": 0,
            "documents_migrated": 0,
            "legacy_fields_cleared": 0,
        }

    for invoice in invoices:
        if invoice.pdf_data:
            key = (invoice.id, DOC_TYPE_INVOICE_PDF)
            if key not in existing_keys:
                upsert_invoice_document(db, invoice.id, DOC_TYPE_INVOICE_PDF, invoice.pdf_data)
                existing_keys.add(key)
                migrated_count += 1

            invoice.pdf_data = None
            cleaned_legacy_count += 1

        if invoice.comprobante_pago_data:
            key = (invoice.id, DOC_TYPE_PAYMENT_PROOF)
            if key not in existing_keys:
                upsert_invoice_document(db, invoice.id, DOC_TYPE_PAYMENT_PROOF, invoice.comprobante_pago_data)
                existing_keys.add(key)
                migrated_count += 1

            invoice.comprobante_pago_data = None
            cleaned_legacy_count += 1

    db.commit()

    return {
        "invoices_scanned": len(invoices),
        "documents_migrated": migrated_count,
        "legacy_fields_cleared": cleaned_legacy_count,
    }
