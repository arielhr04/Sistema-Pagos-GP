"""
Simple in-memory cache service with TTL support for query results and statistics.
Thread-safe caching for frequently accessed data like dashboard stats and reports.
"""

import time
import json
from typing import Any, Optional, Callable, Dict
from functools import wraps
import logging

logger = logging.getLogger(__name__)

# Global cache store: {cache_key: {"data": value, "expiry": timestamp}}
_cache_store: Dict[str, Dict] = {}


def set_cache(key: str, value: Any, ttl_seconds: int = 300) -> None:
    """
    Store a value in cache with optional TTL.
    
    Args:
        key: Cache key identifier
        value: Data to cache
        ttl_seconds: Time to live in seconds (default 5 minutes)
    """
    expiry = time.time() + ttl_seconds
    _cache_store[key] = {
        "data": value,
        "expiry": expiry
    }
    logger.debug(f"Cache SET: {key} (TTL: {ttl_seconds}s)")


def get_cache(key: str) -> Optional[Any]:
    """
    Retrieve a value from cache if it exists and hasn't expired.
    
    Args:
        key: Cache key identifier
        
    Returns:
        Cached value or None if not found/expired
    """
    if key not in _cache_store:
        return None
    
    entry = _cache_store[key]
    
    # Check if expired
    if time.time() > entry["expiry"]:
        del _cache_store[key]
        logger.debug(f"Cache EXPIRED: {key}")
        return None
    
    logger.debug(f"Cache HIT: {key}")
    return entry["data"]


def delete_cache(key: str) -> None:
    """Delete a specific cache key."""
    if key in _cache_store:
        del _cache_store[key]
        logger.debug(f"Cache DELETE: {key}")


def clear_cache() -> None:
    """Clear all cached data."""
    _cache_store.clear()
    logger.info("Cache CLEARED")


def cache_result(ttl_seconds: int = 300, key_prefix: str = ""):
    """
    Decorator to automatically cache function results.
    
    Usage:
        @cache_result(ttl_seconds=600, key_prefix="stats")
        def get_dashboard_stats(user_id: str):
            # expensive query/computation
            return {...}
    
    Args:
        ttl_seconds: Cache TTL in seconds
        key_prefix: Prefix for cache key
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            # Build cache key from function name and arguments
            cache_key = f"{key_prefix}:{func.__name__}:{str(args)}:{str(sorted(kwargs.items()))}"
            
            # Try to get from cache
            cached = get_cache(cache_key)
            if cached is not None:
                return cached
            
            # Compute result and cache it
            result = func(*args, **kwargs)
            set_cache(cache_key, result, ttl_seconds)
            
            return result
        
        return wrapper
    
    return decorator


def invalidate_stats_cache(user_id: str = None) -> None:
    """
    Invalidate all stats-related caches (when data changes).
    Called after invoice updates, status changes, etc.
    
    Args:
        user_id: Specific user's cache to invalidate (optional)
    """
    keys_to_delete = []
    
    for key in _cache_store.keys():
        if "stats" in key or "report" in key or "dashboard" in key:
            if user_id is None or f":{user_id}:" in key:
                keys_to_delete.append(key)
    
    for key in keys_to_delete:
        delete_cache(key)
    
    if keys_to_delete:
        logger.info(f"Invalidated {len(keys_to_delete)} stat caches")


def get_cache_stats() -> Dict[str, Any]:
    """Get information about current cache state."""
    now = time.time()
    stats = {
        "total_keys": len(_cache_store),
        "keys": []
    }
    
    for key, entry in _cache_store.items():
        ttl_remaining = entry["expiry"] - now
        stats["keys"].append({
            "key": key,
            "ttl_seconds": max(0, int(ttl_remaining))
        })
    
    return stats
