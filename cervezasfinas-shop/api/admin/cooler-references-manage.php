<?php
require_once '../common.php';

handleCORS();
$pdo = getDB();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    try {
        $stmt = $pdo->query("SELECT * FROM shop_cooler_reference_photos ORDER BY created_at DESC");
        $photos = $stmt->fetchAll(PDO::FETCH_ASSOC);
        sendJSON(['success' => true, 'data' => $photos]);
    } catch (PDOException $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
} elseif ($method === 'POST') {
    $action = $_POST['action'] ?? '';
    
    // Only 'upload' action requires file
    if ($action === 'upload') {
        if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
            $uploadDir = '../../assets/cooler_refs/';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }
            
            $extension = pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION);
            $filename = 'ref_' . time() . '.' . $extension;
            $targetPath = $uploadDir . $filename;
            
            if (move_uploaded_file($_FILES['image']['tmp_name'], $targetPath)) {
                $imageUrl = 'assets/cooler_refs/' . $filename;
                
                try {
                    $stmt = $pdo->prepare("INSERT INTO shop_cooler_reference_photos (photo_url, title, description) VALUES (?, ?, ?)");
                    $stmt->execute([
                        $imageUrl, 
                        $_POST['title'] ?? 'Reference', 
                        $_POST['description'] ?? ''
                    ]);
                    sendJSON(['success' => true, 'message' => 'Photo uploaded']);
                } catch (PDOException $e) {
                    sendJSON(['error' => $e->getMessage()], 500);
                }
            } else {
                sendJSON(['error' => 'Failed to move uploaded file'], 500);
            }
        } else {
             sendJSON(['error' => 'No file uploaded'], 400);
        }
    } elseif ($action === 'delete') {
         $id = $_POST['id'] ?? null;
         if ($id) {
             // Ideally fetch URL and delete file too
             $pdo->prepare("DELETE FROM shop_cooler_reference_photos WHERE id = ?")->execute([$id]);
             sendJSON(['success' => true, 'message' => 'Photo deleted']);
         }
    }
}
?>
