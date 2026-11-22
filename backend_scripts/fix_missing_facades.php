<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

include_once 'db_config.php';

try {
    $pdo = getDBConnection();
    $pdo->beginTransaction();

    // 1. Encuentra los items de fachadas en ordenes completadas
    $sqlItems = "
        SELECT 
            i.asset_serial, 
            i.asset_type, 
            o.client_id, 
            o.id as order_id, 
            o.created_at
        FROM installation_order_items i
        JOIN installation_orders o ON i.order_id = o.id
        WHERE i.asset_type = 'FACHADA' AND o.status = 'COMPLETADA'
    ";
    
    $stmtItems = $pdo->query($sqlItems);
    $items = $stmtItems->fetchAll();

    $fixedCount = 0;

    foreach ($items as $item) {
        $serial = $item['asset_serial'];
        if (empty($serial)) continue;

        // Comprobar si existe en assets
        $stmtFindAsset = $pdo->prepare("SELECT id FROM assets WHERE serial = ? LIMIT 1");
        $stmtFindAsset->execute([$serial]);
        $asset = $stmtFindAsset->fetch();

        $assetId = "";

        if (!$asset) {
            // Generar UUID como hace uuidv4
            $assetId = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                mt_rand(0, 0xffff), mt_rand(0, 0xffff),
                mt_rand(0, 0xffff),
                mt_rand(0, 0x0fff) | 0x4000,
                mt_rand(0, 0x3fff) | 0x8000,
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
            );

            // Insertar en assets
            $stmtInsertAsset = $pdo->prepare("INSERT INTO assets (id, serial, type, status, created_at) VALUES (?, ?, ?, 'INSTALADO', ?)");
            $stmtInsertAsset->execute([$assetId, $serial, $item['asset_type'], $item['created_at']]);
        } else {
            $assetId = $asset['id'];
            
            // Actualizar status a INSTALADO si no lo está
            $stmtUpdateAsset = $pdo->prepare("UPDATE assets SET status = 'INSTALADO' WHERE id = ?");
            $stmtUpdateAsset->execute([$assetId]);
        }

        // 3. Crear o actualizar la ubicación del activo (current_asset_locations)
        $stmtLocation = $pdo->prepare("
            INSERT INTO current_asset_locations (asset_id, asset_serial, asset_type, client_id, action, created_at) 
            VALUES (?, ?, ?, ?, 'INSTALAR', ?) 
            ON DUPLICATE KEY UPDATE 
            client_id = VALUES(client_id), 
            action = VALUES(action), 
            created_at = VALUES(created_at)
        ");
        
        $stmtLocation->execute([
            $assetId,
            $serial,
            $item['asset_type'],
            $item['client_id'],
            $item['created_at']
        ]);

        $fixedCount++;
    }

    $pdo->commit();
    echo json_encode(["status" => "success", "message" => "Proceso terminado. Se revisaron/arreglaron $fixedCount registros de fachadas."]);

} catch (Exception $e) {
    if (isset($pdo)) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
?>
