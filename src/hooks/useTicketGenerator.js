import { useRef, useCallback } from 'react';
import html2canvas from 'html2canvas';

export const useTicketGenerator = () => {
    const ticketRef = useRef(null);

    const generateAndShare = useCallback(async (fileName = 'ticket.png', message = '') => {
        if (!ticketRef.current) {
            console.error("Ticket ref is null");
            return null;
        }

        try {
            // Wait a moment for rendering if needed
            await new Promise(resolve => setTimeout(resolve, 100));

            const canvas = await html2canvas(ticketRef.current, {
                scale: 2, // High resolution
                backgroundColor: '#1f2031', // Ensure bg is captured
                logging: false,
                useCORS: true
            });

            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const file = new File([blob], fileName, { type: 'image/png' });

            // 1. Try Native Sharing (Mobile)
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        title: 'Ticket de Venta',
                        text: message,
                        files: [file]
                    });
                    return { success: true, method: 'native_share' };
                } catch (shareError) {
                    if (shareError.name !== 'AbortError') {
                        console.warn('Share failed, falling back', shareError);
                    }
                }
            }

            // 2. Fallback: Download (Desktop) + WhatsApp Link (Text only)
            // On desktop we can't auto-attach to WhatsApp Web, so we download the image
            // and open WhatsApp for the user to attach it manually.

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            return { success: true, method: 'download' };

        } catch (error) {
            console.error("Error generating ticket:", error);
            return { success: false, error };
        }
    }, []);

    return { ticketRef, generateAndShare };
};
