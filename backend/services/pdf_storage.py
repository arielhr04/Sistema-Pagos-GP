"""
PDF storage service with compression support.
Compresses PDFs with gzip to save ~70-80% of space when storing in database.
"""

import gzip
import io


class PDFStorage:
    """Handles PDF compression and decompression for database storage"""

    @staticmethod
    def compress_pdf(pdf_content: bytes) -> bytes:
        """
        Compress PDF content using gzip.
        Typical reduction: 70-80% for text-heavy PDFs, 30-50% for image-heavy.
        
        Args:
            pdf_content: Raw PDF bytes
            
        Returns:
            Compressed PDF bytes
        """
        if not pdf_content:
            return b''
        
        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode='wb', compresslevel=9) as f:
            f.write(pdf_content)
        return buf.getvalue()

    @staticmethod
    def decompress_pdf(compressed_content: bytes) -> bytes:
        """
        Decompress PDF from gzip format.
        
        Args:
            compressed_content: Compressed PDF bytes
            
        Returns:
            Raw PDF bytes
            
        Raises:
            ValueError: If decompression fails
        """
        if not compressed_content:
            return b''
        
        try:
            buf = io.BytesIO(compressed_content)
            with gzip.GzipFile(fileobj=buf, mode='rb') as f:
                return f.read()
        except Exception as e:
            raise ValueError(f"Failed to decompress PDF: {str(e)}")

    @staticmethod
    def get_compression_ratio(original_size: int, compressed_size: int) -> float:
        """
        Calculate compression ratio as percentage.
        
        Args:
            original_size: Original size in bytes
            compressed_size: Compressed size in bytes
            
        Returns:
            Compression ratio (0-100%, where 100% means no compression)
        """
        if original_size == 0:
            return 0
        return (compressed_size / original_size) * 100
