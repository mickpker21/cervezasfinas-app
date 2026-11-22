<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

include_once 'db_config.php';

$method = $_SERVER['REQUEST_METHOD'];

// Helper to handle file uploads
function handleUpload($fileArray, $uploadDir) {
    if (!isset($fileArray) || $fileArray['error'] !== UPLOAD_ERR_OK) {
        return null;
    }
    
    // Ensure directory exists
    if (!is_dir($uploadDir)) {
        if (!mkdir($uploadDir, 0755, true)) {
            error_log("Failed to create upload directory: " . $uploadDir);
            return null; // Failed to create directory
        }
    }

    $fileName = basename($fileArray["name"]);
    // Create a unique name to avoid overwriting
    $uniqueName = uniqid() . '_' . preg_replace('/[^A-Za-z0-9.\-]/', '_', $fileName);
    $targetFilePath = $uploadDir . $uniqueName;

    if (move_uploaded_file($fileArray["tmp_name"], $targetFilePath)) {
        return $uniqueName; // Return just the file name to store in DB
    }
    return null;
}

try {
    $pdo = getDBConnection();
    
    $portfolioUploadDir = __DIR__ . '/uploads/portfolio/';
    // The public URL path relative to the domain
    $publicPathPrefix = '/api/uploads/portfolio/'; 

    if ($method === 'GET') {
        $stmt = $pdo->query("SELECT * FROM portfolio_items ORDER BY order_index ASC, created_at DESC");
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Append public path prefix to filenames for the frontend
        foreach ($items as &$item) {
            if ($item['video_url']) {
                $item['video_url'] = $publicPathPrefix . $item['video_url'];
            }
            if ($item['thumbnail_url']) {
                $item['thumbnail_url'] = $publicPathPrefix . $item['thumbnail_url'];
            }
        }
        
        echo json_encode(['status' => 'success', 'data' => $items]);

    } elseif ($method === 'POST') {
        // Upload new item or update existing
        // Check if we are updating order
        $data = json_decode(file_get_contents("php://input"), true);
        if ($data && isset($data['action']) && $data['action'] === 'reorder') {
            // Reorder items
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare("UPDATE portfolio_items SET order_index = :idx WHERE id = :id");
                foreach ($data['items'] as $item) {
                    $stmt->execute([':idx' => $item['order_index'], ':id' => $item['id']]);
                }
                $pdo->commit();
                echo json_encode(['status' => 'success', 'message' => 'Order updated']);
            } catch (Exception $e) {
                $pdo->rollBack();
                throw $e;
            }
            exit();
        }

        // Standard Form Data for creation
        $title = $_POST['title'] ?? '';
        $history_text = $_POST['history_text'] ?? '';
        
        if (empty($title)) {
            throw new Exception("Title is required.");
        }

        $videoFileName = null;
        if (isset($_FILES['video'])) {
            $videoFileName = handleUpload($_FILES['video'], $portfolioUploadDir);
            if (!$videoFileName) {
                throw new Exception("Failed to upload video file.");
            }
        }

        $thumbnailFileName = null;
        if (isset($_FILES['thumbnail'])) {
            $thumbnailFileName = handleUpload($_FILES['thumbnail'], $portfolioUploadDir);
        }

        if (!$videoFileName) {
            throw new Exception("A video file is required.");
        }

        $id = bin2hex(random_bytes(16)); // simple UUID
        
        $stmt = $pdo->prepare("INSERT INTO portfolio_items (id, title, video_url, history_text, thumbnail_url) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$id, $title, $videoFileName, $history_text, $thumbnailFileName]);
        
        echo json_encode(['status' => 'success', 'message' => 'Item created successfully']);

    } elseif ($method === 'DELETE') {
        $id = $_GET['id'] ?? null;
        if (!$id) {
            throw new Exception("ID is required for deletion");
        }

        // Fetch file names to delete physically
        $stmt = $pdo->prepare("SELECT video_url, thumbnail_url FROM portfolio_items WHERE id = ?");
        $stmt->execute([$id]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($item) {
            if ($item['video_url'] && file_exists($portfolioUploadDir . $item['video_url'])) {
                unlink($portfolioUploadDir . $item['video_url']);
            }
            if ($item['thumbnail_url'] && file_exists($portfolioUploadDir . $item['thumbnail_url'])) {
                unlink($portfolioUploadDir . $item['thumbnail_url']);
            }
        }

        $stmt = $pdo->prepare("DELETE FROM portfolio_items WHERE id = ?");
        $stmt->execute([$id]);

        echo json_encode(['status' => 'success', 'message' => 'Item deleted']);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
?>
