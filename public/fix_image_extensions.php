<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$folder = isset($_GET['folder']) ? $_GET['folder'] : 'evaluaciones';
$targetDir = 'uploads/' . $folder . '/';

if (!is_dir($targetDir)) {
    echo json_encode(['error' => "Directory '$targetDir' not found."]);
    exit;
}

$files = scandir($targetDir);
$renamed = [];
$errors = [];

foreach ($files as $file) {
    if ($file === '.' || $file === '..') continue;

    // Check if file ends with a dot
    if (substr($file, -1) === '.') {
        $oldPath = $targetDir . $file;
        $newPath = $targetDir . $file . 'jpg'; // Append jpg assumption

        if (rename($oldPath, $newPath)) {
            $renamed[] = [
                'old' => $file,
                'new' => $file . 'jpg'
            ];
        } else {
            $errors[] = "Failed to rename $file";
        }
    }
}

echo json_encode([
    'status' => 'success',
    'scanned_dir' => $targetDir,
    'renamed_count' => count($renamed),
    'renamed_files' => $renamed,
    'errors' => $errors
]);
?>
