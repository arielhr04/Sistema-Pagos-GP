import { Label } from '../components/ui/label';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

/**
 * Componente de campo de formulario con feedback de extracción de PDF
 * Muestra verde si el campo fue rellenado automáticamente
 * Muestra azul si necesita ser completado manualmente
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
  
  // Estilos basados en status de facturas (similar a los del proyecto)
  const styles = {
    filled: {
      container: 'bg-green-50 border-l-4 border-green-400',
      label: 'text-green-900 font-medium',
      icon: CheckCircle2,
      iconColor: 'text-green-600',
      message: '✓ Completado automáticamente',
      messageColor: 'text-green-700',
    },
    empty: {
      container: 'bg-blue-50 border-l-4 border-blue-400',
      label: 'text-blue-900 font-medium',
      icon: AlertCircle,
      iconColor: 'text-blue-600',
      message: 'Completar manualmente',
      messageColor: 'text-blue-700',
    },
    default: {
      container: 'bg-white',
      label: 'text-zinc-900',
      icon: null,
      iconColor: '',
      message: '',
      messageColor: '',
    },
  };

  const currentStyle = status ? styles[status] : styles.default;
  const IconComponent = currentStyle.icon;

  return (
    <div className={`space-y-1.5 sm:space-y-2 p-3 sm:p-4 rounded-lg transition-colors ${currentStyle.container}`}>
      <Label className={`text-sm sm:text-base ${currentStyle.label}`}>
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>

      {/* Render el input/select */}
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
