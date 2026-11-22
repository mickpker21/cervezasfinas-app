import React, { useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import * as XLSX from 'xlsx';

const PriceUploadPage = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) {
      toast({ title: 'Error', description: 'Por favor, selecciona un archivo.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        // Map Excel columns to database columns, making it case-insensitive
        const formattedData = json
          .map(row => ({
            cve_marca: row['cve_marca'] || row['Cve_Marc'],
            des_marca: row['des_marca'] || row['Des_Marca'],
            bronce: row['bronce'] || row['Bronce'],
            plata: row['plata'] || row['Plata'],
            oro: row['oro'] || row['Oro'],
            platino: row['platino'] || row['Platino'],
            titanio: row['titanio'] || row['Titanio'],
            titanio2: row['titanio2'] || row['Titanio2']
          }))
          .filter(row => row.cve_marca); // Filter out rows where cve_marca is null, undefined or empty

        if (formattedData.length === 0) {
          toast({
            title: 'Archivo vacío o inválido',
            description: 'El archivo no contiene filas con un "cve_marca" válido.',
            variant: 'destructive',
          });
          setUploading(false);
          return;
        }
        
        const { error } = await supabase.from('precios').upsert(formattedData, { onConflict: 'cve_marca' });

        if (error) throw error;

        toast({ title: 'Éxito', description: 'Lista de precios actualizada correctamente.' });
      } catch (error) {
        console.error('Error uploading prices:', error);
        toast({ title: 'Error', description: 'Hubo un error al procesar el archivo. Revisa la consola para más detalles.', variant: 'destructive' });
      } finally {
        setUploading(false);
        setFile(null);
        // Reset the file input
        if (document.getElementById('price-file-input')) {
          document.getElementById('price-file-input').value = '';
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Cargar Lista de Precios</h1>
      <Card>
        <CardHeader>
          <CardTitle>Subir archivo Excel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>Selecciona el archivo .xlsx con la lista de precios. Las columnas deben ser: cve_marca, des_marca, bronce, plata, oro, platino, titanio, titanio2.</p>
          <Input
            id="price-file-input"
            type="file"
            accept=".xlsx, .xls"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <Button onClick={handleUpload} disabled={uploading}>
            {uploading ? 'Subiendo...' : 'Subir y Procesar'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PriceUploadPage;
