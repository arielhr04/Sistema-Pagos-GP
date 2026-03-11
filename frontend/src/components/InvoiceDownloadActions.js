import { Download } from 'lucide-react';
import { Button } from './ui/button';

const BUTTON_BASE_CLASS = 'w-full min-h-12 py-3 px-3 text-white font-medium rounded-lg flex items-center justify-center gap-2';

const DownloadActionButton = ({
  label,
  onClick,
  className,
  testId,
}) => (
  <Button
    onClick={onClick}
    className={`${BUTTON_BASE_CLASS} ${className}`}
    data-testid={testId}
  >
    <Download className="w-4 h-4 shrink-0" />
    <span className="text-center whitespace-normal break-words leading-tight">{label}</span>
  </Button>
);

const InvoiceDownloadActions = ({
  invoiceId,
  folioFiscal,
  isPaid,
  onDownload,
  invoiceButtonTestId,
  proofButtonTestId,
}) => {
  if (!invoiceId || !folioFiscal || !onDownload) {
    return null;
  }

  const invoiceButton = (
    <DownloadActionButton
      label="Descargar PDF de Factura"
      onClick={() => onDownload(`/api/invoices/${invoiceId}/download-pdf`, `FACGP_${folioFiscal}.pdf`)}
      className="bg-red-600 hover:bg-red-700"
      testId={invoiceButtonTestId}
    />
  );

  if (!isPaid) {
    return invoiceButton;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
      {invoiceButton}
      <DownloadActionButton
        label="Descargar Comprobante de Pago"
        onClick={() => onDownload(`/api/invoices/${invoiceId}/download-proof`, `PAGP_${folioFiscal}.pdf`)}
        className="bg-green-600 hover:bg-green-700"
        testId={proofButtonTestId}
      />
    </div>
  );
};

export default InvoiceDownloadActions;
