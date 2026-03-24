import { useState, useEffect } from 'react';

/**
 * Hook para detectar si el dispositivo es móvil
 * Utiliza media queries para detectar pantallas pequeñas (<=768px)
 * Se actualiza en tiempo real cuando cambia el tamaño de la ventana
 */
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    // Server-side rendering safe check
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= breakpoint;
  });

  useEffect(() => {
    // Crear media query
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`);

    // Handler para cambios
    const handleChange = (e) => {
      setIsMobile(e.matches);
    };

    // Listener moderno (soportado en navegadores modernos)
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      // Fallback para navegadores antiguos
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, [breakpoint]);

  return isMobile;
}

export default useIsMobile;
