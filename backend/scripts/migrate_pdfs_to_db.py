"""
Migration script to move existing PDF files from disk to compressed database storage.
Use before deploying the new PDF storage system.

Usage:
    python -m backend.scripts.migrate_pdfs_to_db
"""

import os
import sys
from pathlib import Path
from sqlalchemy.orm import Session

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.db.session import SessionLocal
from backend.models.invoice import Invoice
from backend.services.pdf_storage import PDFStorage


UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"


def migrate_pdfs_to_database():
    """
    Scan uploads folder and migrate existing PDFs to database storage.
    Only migrates files that reference an invoice in the database.
    """
    db: Session = SessionLocal()
    
    if not UPLOAD_DIR.exists():
        print(f"Upload directory not found: {UPLOAD_DIR}")
        return
    
    pdf_files = list(UPLOAD_DIR.glob("*.pdf"))
    print(f"Found {len(pdf_files)} PDF files to potentially migrate")
    
    migrated = 0
    skipped = 0
    errors = 0
    freed_space_mb = 0
    
    for pdf_path in pdf_files:
        filename = pdf_path.name
        
        try:
            # Try to find matching invoice
            # Filename format: FACGP_{folio}_{proveedor}.pdf or PAGP_{folio}_{proveedor}.pdf
            
            if filename.startswith("FACGP_"):
                # Extract folio fiscal from filename
                folio = filename.replace("FACGP_", "").rsplit("_", 1)[0]
                inv = db.query(Invoice).filter(Invoice.folio_fiscal == folio).first()
                
                if inv and not inv.pdf_data:
                    # Read and compress PDF
                    with open(pdf_path, 'rb') as f:
                        pdf_content = f.read()
                    
                    compressed = PDFStorage.compress_pdf(pdf_content)
                    original_mb = len(pdf_content) / (1024 ** 2)
                    compressed_mb = len(compressed) / (1024 ** 2)
                    saved_mb = original_mb - compressed_mb
                    
                    # Save to database
                    inv.pdf_data = compressed
                    db.commit()
                    
                    # Delete from disk
                    pdf_path.unlink()
                    freed_space_mb += original_mb
                    
                    print(f"✓ Migrated invoice {folio}: {original_mb:.2f}MB → {compressed_mb:.2f}MB (saved {saved_mb:.2f}MB)")
                    migrated += 1
                else:
                    if inv:
                        print(f"⊘ Skipped {filename}: already has pdf_data")
                    else:
                        print(f"⊘ Skipped {filename}: no matching invoice")
                    skipped += 1
                    
            elif filename.startswith("PAGP_"):
                # Extract folio fiscal from filename
                folio = filename.replace("PAGP_", "").rsplit("_", 1)[0]
                inv = db.query(Invoice).filter(Invoice.folio_fiscal == folio).first()
                
                if inv and not inv.comprobante_pago_data:
                    # Read and compress PDF
                    with open(pdf_path, 'rb') as f:
                        pdf_content = f.read()
                    
                    compressed = PDFStorage.compress_pdf(pdf_content)
                    original_mb = len(pdf_content) / (1024 ** 2)
                    compressed_mb = len(compressed) / (1024 ** 2)
                    saved_mb = original_mb - compressed_mb
                    
                    # Save to database
                    inv.comprobante_pago_data = compressed
                    db.commit()
                    
                    # Delete from disk
                    pdf_path.unlink()
                    freed_space_mb += original_mb
                    
                    print(f"✓ Migrated proof {folio}: {original_mb:.2f}MB → {compressed_mb:.2f}MB (saved {saved_mb:.2f}MB)")
                    migrated += 1
                else:
                    if inv:
                        print(f"⊘ Skipped {filename}: already has comprobante_pago_data")
                    else:
                        print(f"⊘ Skipped {filename}: no matching invoice")
                    skipped += 1
            else:
                print(f"⊘ Skipped {filename}: unknown filename format")
                skipped += 1
                
        except Exception as e:
            print(f"✗ Error migrating {filename}: {str(e)}")
            errors += 1
    
    # Summary
    print("\n" + "="*60)
    print(f"Migration Summary:")
    print(f"  Migrated: {migrated} files")
    print(f"  Skipped: {skipped} files")
    print(f"  Errors: {errors} files")
    print(f"  Disk space freed: {freed_space_mb:.2f}MB")
    print("="*60)
    
    db.close()


def cleanup_orphan_files():
    """
    Remove PDF files from disk if the corresponding invoice record
    already has the data stored in the database.
    """
    db: Session = SessionLocal()
    
    if not UPLOAD_DIR.exists():
        return
    
    pdf_files = list(UPLOAD_DIR.glob("*.pdf"))
    removed = 0
    freed_mb = 0
    
    for pdf_path in pdf_files:
        filename = pdf_path.name
        
        try:
            if filename.startswith("FACGP_"):
                folio = filename.replace("FACGP_", "").rsplit("_", 1)[0]
                inv = db.query(Invoice).filter(Invoice.folio_fiscal == folio).first()
                
                if inv and inv.pdf_data:
                    file_size_mb = pdf_path.stat().st_size / (1024 ** 2)
                    pdf_path.unlink()
                    freed_mb += file_size_mb
                    removed += 1
                    print(f"✓ Removed orphan file: {filename} ({file_size_mb:.2f}MB)")
                    
            elif filename.startswith("PAGP_"):
                folio = filename.replace("PAGP_", "").rsplit("_", 1)[0]
                inv = db.query(Invoice).filter(Invoice.folio_fiscal == folio).first()
                
                if inv and inv.comprobante_pago_data:
                    file_size_mb = pdf_path.stat().st_size / (1024 ** 2)
                    pdf_path.unlink()
                    freed_mb += file_size_mb
                    removed += 1
                    print(f"✓ Removed orphan file: {filename} ({file_size_mb:.2f}MB)")
                    
        except Exception as e:
            print(f"✗ Error removing {filename}: {str(e)}")
    
    print(f"\nCleanup: Removed {removed} orphan files, freed {freed_mb:.2f}MB")
    db.close()


if __name__ == "__main__":
    print("PDF File Migration Tool")
    print("="*60)
    print("\nPhase 1: Migrating existing PDFs to database...")
    migrate_pdfs_to_database()
    
    print("\nPhase 2: Cleaning up orphan files...")
    cleanup_orphan_files()
    
    print("\n✓ Migration complete!")
