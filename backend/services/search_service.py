"""
Optimized search utilities for common filtering patterns.
Provides efficient query building for text searches across the system.
"""

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List, Optional, Dict, Any

from backend.models.invoice import Invoice
from backend.models.user import User
from backend.models.area import Area


class SearchService:
    """Optimized search queries using indexes."""
    
    @staticmethod
    def search_invoices(
        db: Session,
        search_term: Optional[str] = None,
        estatus: Optional[str] = None,
        area_id: Optional[str] = None,
        limite: int = 100,
        offset: int = 0
    ) -> tuple[List[Invoice], int]:
        """
        Search invoices with optimized filtering using indexes.
        
        Best practice: Filter by indexed columns first, then search.
        
        Args:
            db: Database session
            search_term: Text to search in provider name, folio, description
            estatus: Filter by status (indexed)
            area_id: Filter by area (indexed)
            limite: Result limit
            offset: Pagination offset
            
        Returns:
            Tuple of (invoices, total_count)
        """
        query = db.query(Invoice)
        
        # Apply indexed filters FIRST (most efficient)
        if estatus:
            query = query.filter(Invoice.estatus == estatus)
        
        if area_id:
            query = query.filter(Invoice.area_procedencia == area_id)
        
        # Then apply text search (uses indexes if columns have indexes)
        if search_term:
            search_pattern = f"%{search_term}%"
            query = query.filter(
                or_(
                    Invoice.nombre_proveedor.ilike(search_pattern),  # Uses idx_invoice_nombre_proveedor
                    Invoice.folio_fiscal.ilike(search_pattern),       # Uses idx_invoice_folio_fiscal
                    Invoice.descripcion_factura.ilike(search_pattern) # Full text search
                )
            )
        
        # Get total count BEFORE pagination
        total = query.count()
        
        # Apply pagination
        results = query.order_by(Invoice.created_at.desc()).offset(offset).limit(limite).all()
        
        return results, total
    
    @staticmethod
    def search_users(
        db: Session,
        search_term: Optional[str] = None,
        rol: Optional[str] = None,
        activo: Optional[bool] = None,
        limite: int = 100,
        offset: int = 0
    ) -> tuple[List[User], int]:
        """
        Search users with optimized filtering.
        
        Args:
            db: Database session
            search_term: Text to search in email, nombre
            rol: Filter by role (indexed)
            activo: Filter by active status (indexed)
            limite: Result limit
            offset: Pagination offset
            
        Returns:
            Tuple of (users, total_count)
        """
        query = db.query(User)
        
        # Indexed filters first
        if rol:
            query = query.filter(User.rol == rol)
        
        if activo is not None:
            query = query.filter(User.activo == activo)
        
        # Text search
        if search_term:
            search_pattern = f"%{search_term}%"
            query = query.filter(
                or_(
                    User.email.ilike(search_pattern),
                    User.nombre.ilike(search_pattern)
                )
            )
        
        total = query.count()
        results = query.order_by(User.created_at.desc()).offset(offset).limit(limite).all()
        
        return results, total
    
    @staticmethod
    def search_areas(
        db: Session,
        search_term: Optional[str] = None,
        limite: int = 100,
        offset: int = 0
    ) -> tuple[List[Area], int]:
        """
        Search areas (simple - few results expected).
        
        Args:
            db: Database session
            search_term: Text to search in nombre, descripcion
            limite: Result limit
            offset: Pagination offset
            
        Returns:
            Tuple of (areas, total_count)
        """
        query = db.query(Area)
        
        if search_term:
            search_pattern = f"%{search_term}%"
            query = query.filter(
                or_(
                    Area.nombre.ilike(search_pattern),
                    Area.descripcion.ilike(search_pattern)
                )
            )
        
        total = query.count()
        results = query.order_by(Area.nombre).offset(offset).limit(limite).all()
        
        return results, total


# ------ BEST PRACTICES FOR ILIKE() SEARCHES ------
"""
⚠️ IMPORTANT: ILIKE() performance tips:

1. ALWAYS Filter by indexed columns FIRST before ILIKE
   ✅ Good: query.filter(status == "active").filter(name.ilike("%test%"))
   ❌ Bad:  query.filter(name.ilike("%test%")).filter(status == "active")

2. Use ILIKE only on indexed TEXT columns (nombre_proveedor, email, folio_fiscal)
   ✅ Good: folio_fiscal.ilike("%ABC%")
   ❌ Bad:  description.ilike("%test%")  # Unless heavily queried

3. Limit search term length to prevent regex bombs
   ✅ Good: if len(search_term) <= 100: query.filter(...)
   ❌ Bad:  Accept unlimited search strings

4. Use OR with indexed columns, not non-indexed ones
   ✅ Good: (nombre.ilike() | folio.ilike())  # Both indexed
   ❌ Bad:  (description.ilike() | notes.ilike())  # Neither indexed

5. Always apply LIMIT after filters
   ✅ Good:  query.filter(...).order_by(...).limit(100)
   ❌ Bad:   query.limit(100).filter(...)

6. Cache repeated searches (e.g., provider autocomplete)
   ✅ Use cache_service for frequently searched terms

7. Consider FULL TEXT SEARCH for large text fields
   - SQL Server: FREETEXT, CONTAINS (more performant than ILIKE)
   - Can index these separately for even better performance
   
Example SQL Server Full Text Search:
    DECLARE FULLTEXT CATALOG ftc ON FILEGROUP [PRIMARY];
    CREATE FULLTEXT INDEX ON tesoreriapp_gp_invoices 
        (descripcion_factura) KEY INDEX pk_invoices
        ON ftc;
    
    SELECT * FROM invoices 
    WHERE CONTAINS(descripcion_factura, 'palabra');  -- Faster than ILIKE
"""
