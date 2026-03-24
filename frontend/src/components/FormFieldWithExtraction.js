import { Label } from '../components/ui/label';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

/**
 * Componente de campo de formulario con feedback de extracción de PDF
 * Mantiene el layout normal inicialmente
 * Solo aplica estilos visuales cuando hay extracción (filled/empty)
 */
export const FormFieldWithExtraction = ({
  label,
  fieldName,
  extractionStatus,
  children, // El Input/Select/etc
  required = false,
}) => {
  // Determinar estado: 'filled' | 'empty' | undefined (no extraído)
  const status = extractionStatus?.[fieldName];
  
  // Estilos solo se aplican cuando hay extracción
  const styles = {
    filled: {
      wrapper: 'bg-green-50 border-l-4 border-green-400 rounded-lg p-3',
      label: 'text-green-900 font-medium',
      icon: CheckCircle2,
      iconColor: 'text-green-600',
      message: '✓ Completado automáticamente',
      messageColor: 'text-green-700',
    },
    empty: {
      wrapper: 'bg-blue-50 border-l-4 border-blue-400 rounded-lg p-3',
      label: 'text-blue-900 font-medium',
      icon: AlertCircle,
      iconColor: 'text-blue-600',
      message: 'Completar manualmente',
      messageColor: 'text-blue-700',
    },
    default: {
      wrapper: '',
      label: 'text-zinc-900',
      icon: null,
      iconColor: '',
      message: '',
      messageColor: '',
    },
  };

  const currentStyle = status ? styles[status] : styles.default;
  const IconComponent = currentStyle.icon;

  // Si no hay extracción, renderizar sin estilos extra (layout normal)
  if (!status) {
    return (
      <div className="space-y-1.5 sm:space-y-2">
        <Label className="text-sm">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        {children}
      </div>
    );
  }

  // Si hay extracción, aplicar estilos
  return (
    <div className={`space-y-1.5 sm:space-y-2 transition-all duration-200 ${currentStyle.wrapper}`}>
      <Label className={`text-sm sm:text-base ${currentStyle.label}`}>
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>

      <div className="space-y-1.5">
        {children}

        {/* Mensaje de feedback */}
        {status && (
          <div className={`flex items-center gap-2 text-xs sm:text-sm ${currentStyle.messageColor}`}>
            {IconComponent && <IconComponent className={`w-4 h-4 flex-shrink-0 ${currentStyle.iconColor}`} />}
            <span>{currentStyle.message}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default FormFieldWithExtraction;
