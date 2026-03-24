import React from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';

export function PdfOcrSection({
  pdfFile,
  onPdfChange,
  isExtracting,
  extractionStatus,
  extractedData,
  onChangeFile,
  required = true,
  inputId = 'pdf-input'
}) {
  const { getRootProps, getInputProps } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: 10485760, // 10 MB
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        onPdfChange(acceptedFiles[0]);
      }
    },
  });

  const handleChangeFile = () => {
    onChangeFile();
    // Reset the input
    const input = document.getElementById(inputId);
    if (input) input.value = '';
  };

  return (
    <div className="space-y-2 md:col-span-2">
      <Label className="flex items-center gap-2">
        <span>Archivo PDF {required ? '*' : ''}</span>
        <span className="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-1 rounded">
          OCR Automático
        </span>
      </Label>

      <div
        className="border-2 border-dashed border-zinc-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition"
        {...getRootProps()}
      >
        <input {...getInputProps()} id={inputId} />
        <Upload className="w-8 h-8 mx-auto text-zinc-400 mb-2" />
        {pdfFile ? (
          <div className="space-y-2">
            <p className="text-sm text-green-600 font-medium">
              ✓ {pdfFile.name}
            </p>
            {isExtracting && (
              <p className="text-xs text-blue-600 font-medium">
                Extrayendo datos del PDF...
              </p>
            )}
            {extractedData &&
              Object.values(extractedData).some((v) => v) && (
                <div className="text-xs text-green-600 space-y-1">
                  {extractedData.nombre_proveedor && (
                    <p className="flex items-center gap-1 justify-center">
                      <CheckCircle2 className="w-3 h-3" />
                      Proveedor detectado
                    </p>
                  )}
                  {extractedData.monto && (
                    <p className="flex items-center gap-1 justify-center">
                      <CheckCircle2 className="w-3 h-3" />
                      Monto detectado
                    </p>
                  )}
                  {extractedData.folio_fiscal && (
                    <p className="flex items-center gap-1 justify-center">
                      <CheckCircle2 className="w-3 h-3" />
                      Folio detectado
                    </p>
                  )}
                </div>
              )}
            <button
              type="button"
              onClick={handleChangeFile}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium underline mt-2"
            >
              Cambiar archivo
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-zinc-600 font-medium">
              Arrastra el PDF aquí o haz clic para seleccionar
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              Máximo 10 MB, solo PDF
            </p>
            <p className="text-xs text-blue-600 mt-2 font-medium">
              Los datos de la factura se rellenarán automáticamente
            </p>
          </>
        )}
      </div>
    </div>
  );
}
