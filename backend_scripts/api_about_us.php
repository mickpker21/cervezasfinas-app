<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

include_once 'db_config.php';

$method = $_SERVER['REQUEST_METHOD'];

function handleUpload($fileArray, $uploadDir) {
    if (!isset($fileArray) || $fileArray['error'] !== UPLOAD_ERR_OK) {
        return null;
    }
    
    if (!is_dir($uploadDir)) {
        if (!mkdir($uploadDir, 0755, true)) {
            return null;
        }
    }

    $fileName = basename($fileArray["name"]);
    $uniqueName = uniqid() . '_' . preg_replace('/[^A-Za-z0-9.\-]/', '_', $fileName);
    $targetFilePath = $uploadDir . $uniqueName;

    if (move_uploaded_file($fileArray["tmp_name"], $targetFilePath)) {
        return $uniqueName;
    }
    return null;
}

try {
    $pdo = getDBConnection();
    
    $aboutUploadDir = __DIR__ . '/uploads/about_us/';
    $publicPathPrefix = '/api/uploads/about_us/';

    if ($method === 'GET') {
        $stmt = $pdo->query("SELECT * FROM about_us_content");
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $response = [];
        foreach ($items as $item) {
            $value = $item['content_value'];
            if ($item['content_type'] === 'image' && !empty($value)) {
                $value = $publicPathPrefix . $value;
            }
            $response[$item['section_key']] = $value;
        }
        
        echo json_encode(['status' => 'success', 'data' => $response]);

    } elseif ($method === 'POST') {
        // We receive standard POST data (multipart/form-data)
        $updates = [];
        $stmt = $pdo->prepare("INSERT INTO about_us_content (id, section_key, content_value, content_type) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE content_value = VALUES(content_value), updated_at = NOW()");

        // Handle text fields
        $textFields = ['mision', 'vision', 'historia', 'descripcion'];
        foreach ($textFields as $field) {
            if (isset($_POST[$field])) {
                $id = bin2hex(random_bytes(16));
                $stmt->execute([$id, $field, $_POST[$field], 'text']);
                $updates[] = $field;
            }
        }

        // Handle image fields
        $imageFields = ['main_image', 'secondary_image'];
        foreach ($imageFields as $field) {
            if (isset($_FILES[$field])) {
                // Fetch old image to delete it
                $oldStmt = $pdo->prepare("SELECT content_value FROM about_us_content WHERE section_key = ? AND content_type = 'image'");
                $oldStmt->execute([$field]);
                $oldRow = $oldStmt->fetch(PDO::FETCH_ASSOC);
                
                $fileName = handleUpload($_FILES[$field], $aboutUploadDir);
                if ($fileName) {
                    $id = bin2hex(random_bytes(16));
                    $stmt->execute([$id, $field, $fileName, 'image']);
                    $updates[] = $field;

                    // Delete old file
                    if ($oldRow && $oldRow['content_value'] && file_exists($aboutUploadDir . $oldRow['content_value'])) {
                        unlink($aboutUploadDir . $oldRow['content_value']);
                    }
                }
            }
        }

        echo json_encode(['status' => 'success', 'message' => 'Contenido actualizado', 'updated_fields' => $updates]);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
?>
