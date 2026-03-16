"""
Dashboard statistics service with caching.
Provides optimized queries for dashboard metrics and reports.
"""

from typing import Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta

from backend.models.invoice import Invoice
from backend.models.user import User
from backend.models.area import Area
from backend.services.cache_service import cache_result, set_cache, get_cache, delete_cache
from backend.schemas.enums import InvoiceStatusEnum


class DashboardService:
    """Service for dashboard statistics with built-in caching."""
    
    @staticmethod
    @cache_result(ttl_seconds=600, key_prefix="dashboard")
    def get_dashboard_stats(db: Session, user_id: str = None) -> Dict[str, Any]:
        """
        Get dashboard overview statistics (cached 10 minutes).
        
        Args:
            db: Database session
            user_id: Optional user ID for filtering (Usuario Área only)
            
        Returns:
            Dict with totals, by-status counts, and amounts
        """
        query = db.query(Invoice)
        
        # Filter for Usuario Área
        if user_id:
            query = query.filter(Invoice.created_by == user_id)
        
        total_invoices = query.count()
        
        # Calculate amounts by status
        stats = {}
        for status in InvoiceStatusEnum:
            count = query.filter(Invoice.estatus == status.value).count()
            amount = db.query(func.sum(Invoice.monto)).filter(
                Invoice.estatus == status.value
            ).scalar() or 0
            stats[status.value] = {
                "count": count,
                "amount": float(amount)
            }
        
        # Calculate overdue/due soon
        today = datetime.utcnow().date()
        overdue_count = query.filter(
            Invoice.fecha_vencimiento < today.isoformat()
        ).filter(
            Invoice.estatus != InvoiceStatusEnum.PAGADA.value,
            Invoice.estatus != InvoiceStatusEnum.RECHAZADA.value
        ).count()
        
        due_soon_count = query.filter(
            Invoice.fecha_vencimiento.between(
                today.isoformat(),
                (today + timedelta(days=7)).isoformat()
            )
        ).filter(
            Invoice.estatus != InvoiceStatusEnum.PAGADA.value,
            Invoice.estatus != InvoiceStatusEnum.RECHAZADA.value
        ).count()
        
        return {
            "total_invoices": total_invoices,
            "overdue_count": overdue_count,
            "due_soon_count": due_soon_count,
            "by_status": stats,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    @staticmethod
    @cache_result(ttl_seconds=900, key_prefix="monthly_report")
    def get_monthly_report(db: Session, year: int, month: int) -> Dict[str, Any]:
        """
        Get monthly invoice report (cached 15 minutes).
        
        Args:
            db: Database session
            year: Year
            month: Month (1-12)
            
        Returns:
            Monthly statistics and trends
        """
        from datetime import date
        
        month_start = date(year, month, 1)
        if month == 12:
            month_end = date(year + 1, 1, 1)
        else:
            month_end = date(year, month + 1, 1)
       
        query = db.query(Invoice).filter(
            Invoice.fecha_vencimiento >= month_start.isoformat(),
            Invoice.fecha_vencimiento < month_end.isoformat()
        )
        
        total_amount = db.query(func.sum(Invoice.monto)).filter(
            Invoice.fecha_vencimiento >= month_start.isoformat(),
            Invoice.fecha_vencimiento < month_end.isoformat()
        ).scalar() or 0
        
        by_status = {}
        for status in InvoiceStatusEnum:
            count = query.filter(Invoice.estatus == status.value).count()
            amount = db.query(func.sum(Invoice.monto)).filter(
                Invoice.estatus == status.value,
                Invoice.fecha_vencimiento >= month_start.isoformat(),
                Invoice.fecha_vencimiento < month_end.isoformat()
            ).scalar() or 0
            by_status[status.value] = {
                "count": count,
                "amount": float(amount)
            }
        
        return {
            "period": f"{year}-{month:02d}",
            "total_invoices": query.count(),
            "total_amount": float(total_amount),
            "by_status": by_status
        }
    
    @staticmethod
    def get_provider_summary(db: Session, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get top providers by volume (not cached - lightweight query).
        
        Args:
            db: Database session
            limit: Number of top providers to return
            
        Returns:
            List of provider summaries sorted by total amount
        """
        # Query aggregated by provider
        provider_stats = db.query(
            Invoice.nombre_proveedor,
            func.count(Invoice.id).label("invoice_count"),
            func.sum(Invoice.monto).label("total_amount")
        ).group_by(Invoice.nombre_proveedor).order_by(
            func.sum(Invoice.monto).desc()
        ).limit(limit).all()
        
        return [
            {
                "nombre_proveedor": name,
                "invoice_count": count,
                "total_amount": float(amount or 0)
            }
            for name, count, amount in provider_stats
        ]
    
    @staticmethod
    def invalidate_dashboard_cache(user_id: str = None) -> None:
        """
        Invalidate dashboard cache when invoice data changes.
        Called after create/update/delete invoice operations.
        
        Args:
            user_id: Optional specific user cache to invalidate
        """
        from backend.services.cache_service import invalidate_stats_cache
        invalidate_stats_cache(user_id)
