import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import QrScanner from './QrScanner';
import { X } from 'lucide-react';

const ScannerModal = ({ isOpen, onClose, onScanSuccess, title, description }) => {
  if (!isOpen) return null;

  const handleSuccess = (decodedText, decodedResult) => {
    onScanSuccess(decodedText, decodedResult);
    onClose(); 
  };

  const handleFailure = (error) => {
    // You can optionally handle scan failures here, e.g., logging
    // console.error("Scan failure:", error);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 text-white border-gray-700">
        <DialogHeader>
          <DialogTitle>{title || 'Escanear Código'}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="py-4">
          <QrScanner 
            onScanSuccess={handleSuccess}
            onScanFailure={handleFailure}
            containerId="modal-qr-reader" // Use a unique ID for the modal scanner
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScannerModal;
