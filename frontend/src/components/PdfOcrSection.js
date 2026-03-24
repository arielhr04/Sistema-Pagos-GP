import React from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle2, FileText, FileCode } from 'lucide-react';
import { Label } from './ui/label';

export function PdfOcrSection({
  pdfFile,
  xmlFile,
  onFilesChange,
  isExtracting,
  extractionStatus,
  extractedData,
  onChangeFiles,
  required = true,
  inputId = 'file-input'
}) {
  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'text/xml': ['.xml'],
      'application/xml': ['.xml'],
    },
    maxFiles: 2,
    onDrop: (acceptedFiles) => {
      let newPdf = pdfFile;
      let newXml = xmlFile;

      for (const file of acceptedFiles) {
        if (file.name.endsWith('.pdf')) newPdf = file;
        else if (file.name.endsWith('.xml')) newXml = file;
      }

      // Validate: max 1 PDF and 1 XML
      const pdfs = acceptedFiles.filter(f => f.name.endsWith('.pdf'));
      const xmls = acceptedFiles.filter(f => f.name.endsWith('.xml'));

      if (pdfs.length > 1 || xmls.length > 1) {
        alert('Solo se permite 1 archivo PDF y 1 archivo XML');
        return;
      }

      onFilesChange({ pdfFile: newPdf, xmlFile: newXml });
    },
  });

  return (
    <div className="space-y-2 md:col-span-2">
      <Label className="flex items-center gap-2">
        <span>Archivos de factura {required ? '*' : ''}</span>
        <span className="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-1 rounded">
          XML CFDI Automático
        </span>
      </Label>

      <div
        className="border-2 border-dashed border-zinc-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition"
        {...getRootProps()}
      >
        <input {...getInputProps()} id={inputId} />
        <Upload className="w-8 h-8 mx-auto text-zinc-400 mb-2" />

        {(pdfFile || xmlFile) ? (
          <div className="space-y-2">
            {pdfFile && (
              <p className="text-sm text-green-600 font-medium flex items-center justify-center gap-1">
                <FileText className="w-4 h-4" /> {pdfFile.name}
              </p>
            )}
            {xmlFile && (
              <p className="text-sm text-blue-600 font-medium flex items-center justify-center gap-1">
                <FileCode className="w-4 h-4" /> {xmlFile.name}
              </p>
            )}
            {isExtracting && (
              <p className="text-xs text-blue-600 font-medium">
                Extrayendo datos del XML...
              </p>
            )}
            {extractedData && Object.values(extractedData).some(v => v) && (
              <div className="text-xs text-green-600 space-y-1">
                {extractedData.razon_social && (
                  <p className="flex items-center gap-1 justify-center">
                    <CheckCircle2 className="w-3 h-3" /> Proveedor detectado
                  </p>
                )}
                {extractedData.total && (
                  <p className="flex items-center gap-1 justify-center">
                    <CheckCircle2 className="w-3 h-3" /> Monto detectado
                  </p>
                )}
                {extractedData.folio_fiscal && (
                  <p className="flex items-center gap-1 justify-center">
                    <CheckCircle2 className="w-3 h-3" /> Folio UUID detectado
                  </p>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={onChangeFiles}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium underline mt-2"
            >
              Cambiar archivos
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-zinc-600 font-medium">
              Arrastra el PDF y/o XML aquí, o haz clic para seleccionar
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              PDF requerido · XML opcional · Máximo 1 de cada uno
            </p>
            <p className="text-xs text-blue-600 mt-2 font-medium">
              Si subes el XML, los datos se rellenarán automáticamente
            </p>
          </>
        )}
      </div>
    </div>
  );
}
