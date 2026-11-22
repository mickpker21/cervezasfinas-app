import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { supabase } from '@/supabaseClient';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Generates a Premium PDF for a new client registration.
 * @param {Object} clientData - The client data object.
 * @returns {Promise<boolean>} - True if successful.
 */
export async function generateClientPdf(clientData, signatureDataUrl = null) {
    try {
        console.log("Started generateClientPdf (Premium Dark)", clientData);

        // 1. Create container - Fix visibility for html2canvas
        // Use z-index trick: visible but behind everything
        let container = document.getElementById('pdf-gen-container');
        if (container) document.body.removeChild(container);

        container = document.createElement('div');
        container.id = 'pdf-gen-container';
        container.style.position = 'fixed';
        container.style.left = '0';
        container.style.top = '0';
        container.style.width = '800px';
        container.style.minHeight = '1123px';
        container.style.zIndex = '-9999';
        // Force White background
        container.style.backgroundColor = '#ffffff';
        container.style.color = '#000';
        container.style.fontFamily = "Arial, sans-serif";
        document.body.appendChild(container);

        // Date
        let dateStr = "Fecha";
        try {
            dateStr = new Date().toLocaleDateString('es-MX', {
                year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (e) { }

        // Helpers
        const hasDay = (d) => (clientData.visit_days || '').includes(d) ? 'X' : '';
        const hasTeleventa = (d) => (clientData.visit_day_televenta || '').includes(d) ? 'X' : '';
        const val = (v) => (v === undefined || v === null) ? '' : v;
        const logoUrl2 = '/logo3.png';

        // FORM LAYOUT (Heineken Green Mode)
        container.innerHTML = `
          <div style="width: 800px; padding: 40px; background: white; color: black; font-family: Arial, sans-serif; box-sizing: border-box;">
            
            <!-- HEADER -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div style="width: 45%;">
                    <img src="${logoUrl2}?v=${Date.now()}" style="width: 550px; height: auto; object-fit: contain;" crossorigin="anonymous" />
                </div>
                <div style="width: 50%;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
                        <tr>
                            <td style="border: 1px solid black; padding: 4px; background: #e6ffe6; font-weight: bold; width: 45%; color: #004d00;">FECHA DE SOLICITUD:</td>
                            <td style="border: 1px solid black; padding: 4px;">${dateStr}</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid black; padding: 4px; background: #e6ffe6; font-weight: bold; color: #004d00;">RUTA DE CAPTACION:</td>
                            <td style="border: 1px solid black; padding: 4px;">${val(clientData.internal_route)}</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid black; padding: 4px; background: #e6ffe6; font-weight: bold; color: #004d00;">RUTA DE VENTA:</td>
                            <td style="border: 1px solid black; padding: 4px;">${val(clientData.sales_route)}</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid black; padding: 4px; background: #e6ffe6; font-weight: bold; color: #004d00;">RUTA DE REPARTO:</td>
                            <td style="border: 1px solid black; padding: 4px;">&nbsp;</td>
                        </tr>
                    </table>
                </div>
            </div>

            <!-- GENERALES -->
            <div style="background: #007f00; color: white; font-weight: bold; text-align: center; font-size: 11px; padding: 4px; margin-bottom: 5px; border-radius: 4px 4px 0 0;">GENERALES</div>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 15px;">
                <tr>
                    <td colspan="2" style="border: 1px solid black; padding: 5px;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">NOMBRE DEL ESTABLECIMIENTO:</div>
                        <div style="font-weight: bold; font-size: 12px; margin-top: 2px;">${val(clientData.business_name || clientData.businessName)}</div>
                    </td>
                    <td style="border: 1px solid black; padding: 5px;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">NO DE CLIENTE:</div>
                        <div style="margin-top: 2px;">${val(clientData.client_code)}</div>
                    </td>
                    <td style="border: 1px solid black; padding: 5px;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">NO DE PROVEEDOR:</div>
                        <div style="margin-top: 2px;">&nbsp;</div>
                    </td>
                </tr>
                <tr>
                    <td colspan="3" style="border: 1px solid black; padding: 5px;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">CALLE Y CALLE:</div>
                        <div style="margin-top: 2px;">${val(clientData.address)}</div>
                    </td>
                    <td style="border: 1px solid black; padding: 5px;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">COLONIA:</div>
                        <div style="margin-top: 2px;">${val(clientData.colony)}</div>
                    </td>
                </tr>
                <tr>
                    <td colspan="2" style="border: 1px solid black; padding: 5px;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">ENTRE CALLE:</div>
                         <div style="margin-top: 2px;">${val(clientData.cross_street)}</div>
                    </td>
                    <td style="border: 1px solid black; padding: 5px;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">NUMERO EXT:</div>
                        <div style="margin-top: 2px;">${val(clientData.exterior_number)}</div>
                    </td>
                     <td style="border: 1px solid black; padding: 5px;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">CP:</div>
                        <div style="margin-top: 2px;">${val(clientData.postal_code)}</div>
                    </td>
                </tr>
                 <tr>
                    <td style="border: 1px solid black; padding: 5px;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">NO INT:</div>
                        <div style="margin-top: 2px;">${val(clientData.interior_number)}</div>
                    </td>
                    <td colspan="3" style="border: 1px solid black; padding: 5px;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">REFERENCIAS:</div>
                        <div style="margin-top: 2px;">${val(clientData.reference || clientData.comments)}</div>
                    </td>
                </tr>
                <tr>
                    <td style="border: 1px solid black; padding: 5px;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">POBLACION:</div>
                        <div style="margin-top: 2px;">${val(clientData.city)}</div>
                    </td>
                    <td style="border: 1px solid black; padding: 5px;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">ESTADO:</div>
                         <div style="margin-top: 2px;">${val(clientData.state)}</div>
                    </td>
                    <td colspan="2" style="border: 1px solid black; padding: 5px;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">TELEFONO / EMAIL:</div>
                        <div style="margin-top: 2px;">${val(clientData.phone)} / ${val(clientData.email)}</div>
                    </td>
                </tr>
            </table>

            <!-- DATOS DE FACTURACION -->
            <div style="background: #007f00; color: white; font-weight: bold; text-align: center; font-size: 11px; padding: 4px; margin-bottom: 5px; border-radius: 4px 4px 0 0;">DATOS DE FACTURACION</div>
            <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 15px;">
                <tr>
                     <td style="border: 1px solid black; padding: 5px; width: 30%;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">RFC:</div>
                        <div style="margin-top: 2px;">${val(clientData.rfc)}</div>
                    </td>
                    <td style="border: 1px solid black; padding: 5px;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">RAZON SOCIAL:</div>
                        <div style="font-weight: bold; margin-top: 2px;">${val(clientData.fiscal_name)}</div>
                    </td>
                </tr>
                 <tr>
                    <td colspan="2" style="border: 1px solid black; padding: 5px;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">DOMICILIO FISCAL:</div>
                        <div style="margin-top: 2px;">${val(clientData.fiscal_address)}</div>
                    </td>
                </tr>
                 <tr>
                    <td style="border: 1px solid black; padding: 5px;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">COLONIA O BARRIO:</div>
                        <div style="margin-top: 2px;">${val(clientData.fiscal_colony)}</div>
                    </td>
                     <td style="border: 1px solid black; padding: 5px;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">CP Y CEDULA IEPS:</div>
                        <div style="margin-top: 2px;">CP: ${val(clientData.fiscal_postal_code)} - IEPS: ${val(clientData.cedula_ieps)}</div>
                    </td>
                </tr>
            </table>

            <!-- CONTACTOS Y ROLES -->
            <div style="background: #007f00; color: white; font-weight: bold; text-align: center; font-size: 11px; padding: 4px; margin-bottom: 5px; border-radius: 4px 4px 0 0;">CONTACTOS Y ROLES</div>
             <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 15px;">
                <tr>
                     <td style="border: 1px solid black; padding: 5px; width: 50%;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">DUEÑO:</div>
                        <div style="margin-top: 2px;">${val(clientData.name)}</div>
                    </td>
                    <td style="border: 1px solid black; padding: 5px;">
                        <div style="font-size: 8px; color: #007f00; font-weight: bold;">TELEFONO:</div>
                        <div style="margin-top: 2px;">${val(clientData.phone)}</div>
                    </td>
                </tr>
            </table>

            <!-- DATOS DE VENTA -->
             <div style="background: #007f00; color: white; font-weight: bold; text-align: center; font-size: 11px; padding: 4px; margin-bottom: 5px; border-radius: 4px 4px 0 0;">DATOS DE VENTA</div>
             <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 15px;">
                <tr>
                    <td style="border: 1px solid black; padding: 5px; width: 20%;">
                        <div style="font-weight: bold; margin-bottom: 5px; font-size: 9px; color: #007f00;">MODALIDAD DE VENTA</div>
                         <div>${val(clientData.sales_modality)}</div>
                    </td>
                     <td style="border: 1px solid black; padding: 5px; width: 15%;">
                        <div style="font-weight: bold; margin-bottom: 5px; font-size: 9px; color: #007f00;">RITMO</div>
                         <div>${val(clientData.ritmo)}</div>
                    </td>
                    <td style="border: 1px solid black; padding: 2px; width: 65%;">
                        <table style="width: 100%; text-align: center; font-size: 8px; border-collapse: collapse;">
                            <tr style="background: #e6ffe6; color: #004d00; font-weight: bold;">
                                <td style="border: 1px solid #ccc; padding: 2px; width: 25%;">VISITAS</td>
                                <td style="border: 1px solid #ccc; padding: 2px;">L</td>
                                <td style="border: 1px solid #ccc; padding: 2px;">M</td>
                                <td style="border: 1px solid #ccc; padding: 2px;">M</td>
                                <td style="border: 1px solid #ccc; padding: 2px;">J</td>
                                <td style="border: 1px solid #ccc; padding: 2px;">V</td>
                                <td style="border: 1px solid #ccc; padding: 2px;">S</td>
                                <td style="border: 1px solid #ccc; padding: 2px;">D</td>
                            </tr>
                            <tr>
                                <td style="font-weight: bold; text-align: left; padding-left: 5px; border: 1px solid #ccc;">PRESENCIAL</td>
                                <td style="border: 1px solid #ccc;">${hasDay('Lunes')}</td>
                                <td style="border: 1px solid #ccc;">${hasDay('Martes')}</td>
                                <td style="border: 1px solid #ccc;">${hasDay('Miércoles')}</td>
                                <td style="border: 1px solid #ccc;">${hasDay('Jueves')}</td>
                                <td style="border: 1px solid #ccc;">${hasDay('Viernes')}</td>
                                <td style="border: 1px solid #ccc;">${hasDay('Sábado')}</td>
                                <td style="border: 1px solid #ccc;">${hasDay('Domingo')}</td>
                            </tr>
                             <tr>
                                <td style="font-weight: bold; text-align: left; padding-left: 5px; border: 1px solid #ccc;">TELEVENTA</td>
                                <td style="border: 1px solid #ccc;">${hasTeleventa('Lunes')}</td>
                                <td style="border: 1px solid #ccc;">${hasTeleventa('Martes')}</td>
                                <td style="border: 1px solid #ccc;">${hasTeleventa('Miércoles')}</td>
                                <td style="border: 1px solid #ccc;">${hasTeleventa('Jueves')}</td>
                                <td style="border: 1px solid #ccc;">${hasTeleventa('Viernes')}</td>
                                <td style="border: 1px solid #ccc;">${hasTeleventa('Sábado')}</td>
                                <td style="border: 1px solid #ccc;">${hasTeleventa('Domingo')}</td>
                            </tr>
                             <tr>
                                <td style="font-weight: bold; text-align: left; padding-left: 5px; border: 1px solid #ccc;">REPARTO</td>
                                <td style="border: 1px solid #ccc;">&nbsp;</td>
                                <td style="border: 1px solid #ccc;">&nbsp;</td>
                                <td style="border: 1px solid #ccc;">&nbsp;</td>
                                <td style="border: 1px solid #ccc;">&nbsp;</td>
                                <td style="border: 1px solid #ccc;">&nbsp;</td>
                                <td style="border: 1px solid #ccc;">&nbsp;</td>
                                <td style="border: 1px solid #ccc;">&nbsp;</td>
                            </tr>
                        </table>
                    </td>
                </tr>
             </table>

             <!-- CANAL Y SEGMENTO -->
             <div style="background: #007f00; color: white; font-weight: bold; text-align: center; font-size: 11px; padding: 4px; margin-bottom: 5px; border-radius: 4px 4px 0 0;">CLASIFICACION Y CANAL</div>
             <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 25px;">
                <tr>
                    <td style="border: 1px solid black; padding: 5px;">
                        <span style="font-weight: bold; color: #007f00;">TIPO CLIENTE:</span> ${val(clientData.client_type || clientData.type).toUpperCase()}
                    </td>
                     <td style="border: 1px solid black; padding: 5px;">
                        <span style="font-weight: bold; color: #007f00;">NIVEL (GEC):</span> ${val(clientData.level || clientData.gec)}
                    </td>
                     <td style="border: 1px solid black; padding: 5px;">
                        <span style="font-weight: bold; color: #007f00;">COORDENADAS:</span> ${val(clientData.coords?.lat)}, ${val(clientData.coords?.lng)}
                    </td>
                </tr>
             </table>

             <!-- FIRMAS -->
             <div style="background: #007f00; color: white; font-weight: bold; text-align: center; font-size: 11px; padding: 4px; margin-bottom: 5px; border-radius: 4px 4px 0 0;">FIRMAS AUTORIZADAS</div>
             <table style="width: 100%; border-collapse: collapse; font-size: 10px; text-align: center;">
                <tr>
                    <td style="border: 1px solid black; height: 80px; vertical-align: bottom; width: 33%;">
                        ${signatureDataUrl
                            ? `<img src="${signatureDataUrl}" style="max-height:70px; max-width:95%; object-fit:contain; display:block; margin:0 auto 2px;" />`
                            : '_______________________<br>'
                        }
                        <span style="font-size: 8px;">SOLICITANTE</span>
                    </td>
                    <td style="border: 1px solid black; height: 80px; vertical-align: bottom; width: 33%;">
                        _______________________<br>
                        <span style="font-size: 8px;">AUTORIZA</span>
                    </td>
                    <td style="border: 1px solid black; height: 80px; vertical-align: bottom; width: 33%;">
                        _______________________<br>
                        <span style="font-size: 8px;">SUPERVISOR DE LOG. PRIMARIA</span>
                    </td>
                </tr>
             </table>

             <!-- FOOTER -->
              <div style="text-align: center; margin-top: 30px; font-size: 9px; color: #555;">
                <p style="font-weight: bold; color: #007f00;">CERVEZAS FINAS - FORMATO OFICIAL</p>
                <p>Fecha y hora de generación: ${new Date().toLocaleString()}</p>
            </div>

          </div>
        `;

        console.log("Waiting for images...");
        // Wait for images
        const images = container.querySelectorAll('img');
        const promises = Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
                img.onload = resolve;
                img.onerror = () => { console.warn("Failed img:", img.src); resolve(); }
            });
        });

        await Promise.race([Promise.all(promises), new Promise(r => setTimeout(r, 3000))]);

        console.log("Rendering Canvas...");
        const canvas = await html2canvas(container, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff', // Match bg
            logging: true,
            width: 800,
            height: 1123,
            windowWidth: 1600, // Simulate desktop
        });

        // 3. PDF
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = pdf.internal.pageSize.getHeight();

        pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);

        const safeName = (clientData.business_name || clientData.businessName || clientData.name || 'Cliente').replace(/[^a-z0-9]/gi, '_');
        const filename = `Alta_${safeName}_${Math.floor(Date.now() / 1000)}.pdf`;

        console.log("Saving PDF:", filename);

        // 🏢 ENTERPRISE: Multiplataforma - APK vs WEB
        if (Capacitor.isNativePlatform()) {
            // 📱 ANDROID/iOS: Use Filesystem + Share
            try {
                console.log('[PDF] Saving to native filesystem...');

                // Get PDF as base64
                const pdfBase64 = pdf.output('datauristring').split(',')[1];

                // Save to Cache directory (no permissions needed)
                const result = await Filesystem.writeFile({
                    path: filename,
                    data: pdfBase64,
                    directory: Directory.Cache,
                });

                console.log('[PDF] File saved to cache:', result.uri);

                // Use Share API to let user choose destination
                try {
                    await Share.share({
                        title: 'Alta de Cliente PDF',
                        text: `Formato de alta: ${clientData.business_name || clientData.name}`,
                        url: result.uri,
                        dialogTitle: 'Guardar PDF en...'
                    });

                    console.log('[PDF] PDF shared successfully');
                    document.body.removeChild(container);
                    return { success: true, uri: result.uri, filename };

                } catch (shareError) {
                    console.warn('[PDF] Share cancelled or failed:', shareError);
                    // Even if share fails, file is in cache
                    document.body.removeChild(container);
                    return { success: true, uri: result.uri, filename, shared: false };
                }

            } catch (error) {
                console.error('[PDF] Error saving to filesystem:', error);
                document.body.removeChild(container);
                return { success: false, error: error.message };
            }
        } else {
            // 🌐 WEB: Use browser download
            pdf.save(filename);
            document.body.removeChild(container);
            return { success: true, filename };
        }

    } catch (e) {
        console.error("FATAL Error PDF:", e);
        if (document.getElementById('pdf-gen-container')) {
            document.body.removeChild(document.getElementById('pdf-gen-container'));
        }
        return { success: false, error: e.message };
    }
}
