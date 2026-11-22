<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/store.php';

/**
 * Maneja las rutas de planogramas (/api/planograms*).
 *
 * @param string $method
 * @param string $path
 * @param array<string,mixed> $user
 * @param PDO $pdo
 * @return bool true si manejó la ruta, false en caso contrario
 */
function um6_route_planograms(string $method, string $path, array $user, PDO $pdo): bool
{
    $mimeToExtension = static function (string $mime): string {
        return match ($mime) {
            'image/jpeg' => '.jpg',
            'image/png' => '.png',
            'image/webp' => '.webp',
            'application/pdf' => '.pdf',
            default => '.bin',
        };
    };

    $buildFileUrl = static function (string $filename): string {
        $baseUrl = um6_detect_base_url();
        return rtrim($baseUrl, '/') . '/uploads/planograms/' . rawurlencode($filename);
    };

    $cleanupUploadedFile = static function (?string $path): void {
        if ($path && is_file($path)) {
            @unlink($path);
        }
    };

    // GET /api/planograms/me
    if ($method === 'GET' && $path === '/api/planograms/me') {
        um6_require_role($user, ['UM6']);

        $store = um6_get_store_for_user($pdo, $user, null);
        $stmt = $pdo->prepare(
            'SELECT id, file_url, version, uploaded_by, uploaded_at
               FROM planograms
              WHERE store_id = ?
              ORDER BY version DESC, uploaded_at DESC
              LIMIT 1'
        );
        $stmt->execute([$store['id']]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($row === false) {
            um6_json_error(404, 'Sin planograma asignado');
        }

        um6_json_response(200, $row);
    }

    // GET /api/planograms
    if ($method === 'GET' && $path === '/api/planograms') {
        um6_require_role($user, ['gerente']);

        $filterSql = '';
        $params = [];
        $storeCodeParam = isset($_GET['storeCode']) ? trim((string) $_GET['storeCode']) : '';
        if ($storeCodeParam !== '') {
            $store = um6_require_store_by_code($pdo, $storeCodeParam);
            $filterSql = 'WHERE p.store_id = ?';
            $params[] = $store['id'];
        }

        $sql = 'SELECT p.id, s.code as store_code, p.file_url, p.version, p.uploaded_at
                  FROM planograms p
                  JOIN stores s ON s.id = p.store_id
                 ' . $filterSql . '
                 ORDER BY p.uploaded_at DESC
                 LIMIT 100';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        um6_json_response(200, $rows);
    }

    // POST /api/planograms
    if ($method === 'POST' && $path === '/api/planograms') {
        um6_require_role($user, ['gerente']);

        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        $isMultipart = stripos($contentType, 'multipart/form-data') !== false;

        $normalizedStoreCode = '';
        $rawVersion = '';
        $fileUrl = null;
        $uploadedPath = null;

        if ($isMultipart) {
            $normalizedStoreCode = isset($_POST['storeCode']) && is_string($_POST['storeCode'])
                ? strtoupper(trim($_POST['storeCode']))
                : '';
            $rawVersion = isset($_POST['version']) && is_string($_POST['version'])
                ? trim($_POST['version'])
                : '';

            if (
                isset($_FILES['file']) &&
                is_array($_FILES['file']) &&
                ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK
            ) {
                $tmpPath = $_FILES['file']['tmp_name'];
                $mime = (string) ($_FILES['file']['type'] ?? '');

                if (
                    $mime !== 'application/pdf' &&
                    !str_starts_with($mime, 'image/')
                ) {
                    $cleanupUploadedFile($tmpPath);
                    um6_json_error(400, 'Formato de archivo no permitido');
                }

                $size = (int) ($_FILES['file']['size'] ?? 0);
                if ($size > 20 * 1024 * 1024) {
                    $cleanupUploadedFile($tmpPath);
                    um6_json_error(400, 'Archivo demasiado grande (máx 20MB)');
                }

                $safeCode = preg_replace('/[^A-Z0-9_-]/', '', $normalizedStoreCode ?: 'PLANOGRAM');
                if ($safeCode === '') {
                    $safeCode = 'PLANOGRAM';
                }

                $originalName = (string) ($_FILES['file']['name'] ?? '');
                $ext = '';
                if (str_contains($originalName, '.')) {
                    $ext = strtolower((string) strrchr($originalName, '.'));
                }
                if ($ext === '' || $ext === false) {
                    $ext = $mimeToExtension($mime);
                }

                $uploadsRoot = dirname(__DIR__) . '/uploads/planograms';
                if (!is_dir($uploadsRoot)) {
                    mkdir($uploadsRoot, 0775, true);
                }

                $filename = $safeCode . '_' . time() . $ext;
                $destination = $uploadsRoot . '/' . $filename;

                if (!move_uploaded_file($tmpPath, $destination)) {
                    $cleanupUploadedFile($tmpPath);
                    um6_json_error(500, 'No se pudo guardar el archivo');
                }

                $uploadedPath = $destination;
                $fileUrl = $buildFileUrl($filename);
            } else {
                um6_json_error(400, 'Archivo de planograma requerido');
            }
        } else {
            $body = um6_get_json_body();
            if (!is_array($body)) {
                um6_json_error(400, 'Payload inválido');
            }
            $normalizedStoreCode = isset($body['storeCode']) && is_string($body['storeCode'])
                ? strtoupper(trim($body['storeCode']))
                : '';
            $rawVersion = isset($body['version']) ? (string) $body['version'] : '';
            $fileUrl = isset($body['fileUrl']) && is_string($body['fileUrl'])
                ? trim($body['fileUrl'])
                : null;
        }

        $normalizedStoreCode = strtoupper($normalizedStoreCode);
        if ($normalizedStoreCode === '' || strlen($normalizedStoreCode) < 3) {
            $cleanupUploadedFile($uploadedPath);
            um6_json_error(400, 'storeCode inválido');
        }

        $versionValue = null;
        if ($rawVersion !== '') {
            $versionValue = (int) $rawVersion;
            if ($versionValue <= 0) {
                $versionValue = null;
            }
        }

        if ($fileUrl === null || $fileUrl === '') {
            $cleanupUploadedFile($uploadedPath);
            um6_json_error(400, 'fileUrl es requerido');
        }
        if (filter_var($fileUrl, FILTER_VALIDATE_URL) === false) {
            $cleanupUploadedFile($uploadedPath);
            um6_json_error(400, 'fileUrl inválido');
        }

        $store = um6_require_store_by_code($pdo, $normalizedStoreCode);

        try {
            $sql = 'INSERT INTO planograms (store_id, file_url, version, uploaded_by)
                    VALUES (?, ?, COALESCE(?, (
                      SELECT COALESCE(MAX(version),0) + 1 FROM planograms WHERE store_id = ?
                    )), ?)';
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $store['id'],
                $fileUrl,
                $versionValue,
                $store['id'],
                (string) $user['id'],
            ]);
            $id = (int) $pdo->lastInsertId();
        } catch (Throwable $e) {
            $cleanupUploadedFile($uploadedPath);
            um6_json_error(500, 'No se pudo guardar el planograma', ['error' => $e->getMessage()]);
        }

        um6_json_response(201, [
            'id' => $id,
            'fileUrl' => $fileUrl,
        ]);
    }

    return false;
}

