import { supabase } from '@/mysqlClient';

const BUCKET = 'employee-docs';

/**
 * Obtiene todos los documentos de un empleado específico.
 */
export async function getEmployeeDocs(employeeId) {
    if (!employeeId) return [];
    const { data, error } = await supabase
        .from('employee_documents')
        .select('*')
        .eq('hr_employee_id', employeeId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[employeeDocsRepository] Error fetching docs:', error);
        return [];
    }
    return data || [];
}

/**
 * Obtiene documentos de TODOS los empleados (para panel de alertas de vencimiento).
 */
export async function getAllEmployeeDocsWithExpiry() {
    const { data, error } = await supabase
        .from('employee_documents')
        .select('*, hr_employees(first_name, last_name, job_title)')
        .not('expires_at', 'is', null)
        .order('expires_at', { ascending: true });

    if (error) {
        console.error('[employeeDocsRepository] Error fetching expiry docs:', error);
        return [];
    }
    return data || [];
}

/**
 * Sube un documento al Storage y guarda sus metadatos en la tabla.
 */
export async function uploadEmployeeDoc(employeeId, file, meta, uploadedBy) {
    const ext = file.name.split('.').pop();
    const uniqueName = `${crypto.randomUUID()}.${ext}`;
    const filePath = `${employeeId}/${meta.category}/${uniqueName}`;

    // 1. Subir archivo a Supabase Storage
    const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, { contentType: file.type, upsert: false });

    if (uploadError) {
        console.error('[employeeDocsRepository] Upload error:', uploadError);
        throw new Error(`Error al subir archivo: ${uploadError.message}`);
    }

    // 2. Guardar metadatos en la tabla
    const { data, error: dbError } = await supabase
        .from('employee_documents')
        .insert({
            hr_employee_id: employeeId,
            name: meta.name,
            category: meta.category,
            file_path: filePath,
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
            expires_at: meta.expires_at || null,
            uploaded_by: uploadedBy,
        })
        .select()
        .single();

    if (dbError) {
        // Si falla el guardado en DB, limpiar el archivo del storage
        await supabase.storage.from(BUCKET).remove([filePath]);
        console.error('[employeeDocsRepository] DB insert error:', dbError);
        throw new Error(`Error al guardar metadatos: ${dbError.message}`);
    }

    return data;
}

/**
 * Genera una URL firmada (válida 60 minutos) para previsualizar o descargar un documento.
 */
export async function getSignedUrl(filePath, expiresIn = 3600) {
    const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(filePath, expiresIn);

    if (error) {
        console.error('[employeeDocsRepository] Signed URL error:', error);
        return null;
    }
    return data?.signedUrl;
}

/**
 * Elimina un documento del Storage y su registro en la tabla.
 */
export async function deleteEmployeeDoc(docId, filePath) {
    // 1. Eliminar de Storage
    const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .remove([filePath]);

    if (storageError) {
        console.warn('[employeeDocsRepository] Storage delete warning:', storageError);
        // Continuamos igual para limpiar la DB
    }

    // 2. Eliminar de la tabla
    const { error: dbError } = await supabase
        .from('employee_documents')
        .delete()
        .eq('id', docId);

    if (dbError) {
        console.error('[employeeDocsRepository] DB delete error:', dbError);
        throw new Error(`Error al eliminar documento: ${dbError.message}`);
    }

    return true;
}
