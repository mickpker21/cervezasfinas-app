<?php
/**
 * Maintenance script to fix broken Census photo URLs
 * Run this via your browser or CLI to update records that are missing the /api/ path
 * or have incorrect localhost paths.
 */

require_once __DIR__ . '/db_config.php';
$pdo = getDBConnection();

echo "Starting Census URL repair...\n";

// Debug: List all tables
echo "Listing all tables in database:\n";
try {
    $tablesStmt = $pdo->query("SHOW TABLES");
    $tables = $tablesStmt->fetchAll(PDO::FETCH_COLUMN);
    echo "Tables: " . implode(", ", $tables) . "\n\n";
} catch (Exception $e) {
    echo "ERROR LISTING TABLES: " . $e->getMessage() . "\n";
}

// Subfolders for photos
$photoDir = __DIR__ . '/uploads/visitas-fotos/';
echo "Photo directory: $photoDir\n";
if (!is_dir($photoDir)) {
    echo "WARNING: Photo directory DOES NOT EXIST or is not a directory.\n";
}

// 1. Get all censos (broad search)
$sql = "SELECT id, photo_url, photo_fachada FROM censos_supervisor";
try {
    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "Found " . count($rows) . " records in censos_supervisor table.\n";
    
    if (count($rows) > 0) {
        echo "First record sample (ID: " . $rows[0]['id'] . "):\n";
        echo " - photo_url: [" . $rows[0]['photo_url'] . "]\n";
        echo " - photo_fachada: [" . $rows[0]['photo_fachada'] . "]\n";
    }
} catch (Exception $e) {
    echo "DATABASE ERROR: " . $e->getMessage() . "\n";
    // Check if table exists by another name
    echo "Maybe the table name is slightly different? Check the list above.\n";
    die();
}

$updated = 0;
$renamed = 0;

foreach ($rows as $row) {
    $fixUrlRes = fixUrlWithDisk($row['photo_url'], $photoDir);
    $new_photo_url = $fixUrlRes['url'];
    if ($fixUrlRes['renamed']) $renamed++;

    $fixFachadaRes = fixUrlWithDisk($row['photo_fachada'], $photoDir);
    $new_photo_fachada = $fixFachadaRes['url'];
    if ($fixFachadaRes['renamed']) $renamed++;
    
    if ($new_photo_url !== $row['photo_url'] || $new_photo_fachada !== $row['photo_fachada']) {
        $updateStmt = $pdo->prepare("UPDATE censos_supervisor SET photo_url = ?, photo_fachada = ? WHERE id = ?");
        $updateStmt->execute([$new_photo_url, $new_photo_fachada, $row['id']]);
        $updated++;
        echo "Updated Census ID: {$row['id']} | Result: DB entry fixed\n";
    }
}

echo "\nFinished.\n";
echo "- Records updated in DB: $updated\n";
echo "- Files renamed on Disk: $renamed\n";

function fixUrlWithDisk($url, $baseDir) {
    if (empty($url)) return ['url' => $url, 'renamed' => false];
    
    $newUrl = $url;
    $renamed = false;

    // 1. Ensure /api/ path exists on remote domain
    if (strpos($newUrl, 'cervezasfinas.com/uploads/') !== false) {
        $newUrl = str_replace('cervezasfinas.com/uploads/', 'cervezasfinas.com/api/uploads/', $newUrl);
    }
    
    // 2. Extract filename to check on disk
    $filename = basename($url);
    
    // If it ends with a dot, we need to fix disk and URL
    if (substr($filename, -1) === '.') {
        $oldPath = $baseDir . $filename;
        $newFilename = rtrim($filename, '.') . '.jpg';
        $newPath = $baseDir . $newFilename;
        
        if (file_exists($oldPath)) {
            if (rename($oldPath, $newPath)) {
                echo "Renamed on disk: $filename -> $newFilename\n";
                $renamed = true;
            } else {
                echo "ERROR: Failed to rename $filename\n";
            }
        }
        
        // Update URL part
        $newUrl = str_replace($filename, $newFilename, $newUrl);
    } 
    // Case where URL doesn't have the dot but file on disk might/should
    elseif (strpos(substr($filename, -6), '.') === false) {
        $newUrl .= '.jpg';
    }
    
    return ['url' => $newUrl, 'renamed' => $renamed];
}
