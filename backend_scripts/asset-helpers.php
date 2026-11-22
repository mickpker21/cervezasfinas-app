<?php
// asset-helpers.php

/**
 * Maps census model/facade strings to official asset types.
 */
function getMappedAssetType($rawModel, $rawFacade, $hasEnfriador, $hasFachada) {
    static $modelMap = [
        'CCV900' => 'ENFRIADOR CCV900',
        'CCV552' => 'ENFRIADOR CCV552',
        'CCV500' => 'ENFRIADOR CCV500',
        'CCV376' => 'ENFRIADOR CCV376',
        'CCV320' => 'ENFRIADOR CCV320',
        'CCV192' => 'ENFRIADOR CCV192',
        'CCV144' => 'ENFRIADOR CCV144',
        'CCV1250' => 'ENFRIADOR CCV1250',
        'Z11'    => 'ENFRIADOR Z11'
    ];

    static $facadeMap = [
        'BÁSICA' => 'FACHADA BASICA',
        'HIGH'   => 'FACHADA HIGH'
    ];

    if ($hasEnfriador && !empty($rawModel)) {
        $modelo = trim($rawModel);
        return isset($modelMap[$modelo]) ? $modelMap[$modelo] : "ENFRIADOR $modelo";
    }

    if ($hasFachada && !empty($rawFacade)) {
        $tipo_fachada = trim($rawFacade);
        return isset($facadeMap[$tipo_fachada]) ? $facadeMap[$tipo_fachada] : "FACHADA $tipo_fachada";
    }

    return 'OTRO';
}

/**
 * Registers an asset and its location based on a census record.
 */
function registerAssetFromCensus($pdo, $c) {
    if (!$pdo) return false;

    $client_id = $c['client_id'];
    $client_code = $c['client_code'];
    $processedCount = 0;

    // --- 1. Process Enfriador ---
    if ($c['tiene_enfriador'] && !empty($c['serial'])) {
        $serial = trim($c['serial']);
        $type = getMappedAssetType($c['modelo'], null, true, false);
        $assetId = "AST-" . md5($serial);

        // Upsert Asset
        $stmtAsset = $pdo->prepare("INSERT INTO assets (id, serial, type, status) 
                                  VALUES (?, ?, ?, 'INSTALADO') 
                                  ON DUPLICATE KEY UPDATE 
                                  type = VALUES(type), 
                                  status = 'INSTALADO'");
        $stmtAsset->execute([$assetId, $serial, $type]);

        // Upsert Location
        $stmtLoc = $pdo->prepare("INSERT INTO current_asset_locations (asset_id, asset_serial, asset_type, client_id, action, created_at)
                                VALUES (?, ?, ?, ?, 'CENSO', NOW())
                                ON DUPLICATE KEY UPDATE 
                                client_id = VALUES(client_id),
                                action = 'CENSO',
                                created_at = NOW()");
        $stmtLoc->execute([$assetId, $serial, $type, $client_id]);
        $processedCount++;
    }

    // --- 2. Process Fachada ---
    if ($c['tiene_fachada']) {
        $type = getMappedAssetType(null, $c['tipo_fachada'], false, true);
        $facadeSerial = "FAC-" . ($client_code ?: $client_id);
        $facadeAssetId = "AST-" . md5($facadeSerial);

        // Upsert Asset
        $stmtAsset = $pdo->prepare("INSERT INTO assets (id, serial, type, status) 
                                  VALUES (?, ?, ?, 'INSTALADO') 
                                  ON DUPLICATE KEY UPDATE 
                                  type = VALUES(type), 
                                  status = 'INSTALADO'");
        $stmtAsset->execute([$facadeAssetId, $facadeSerial, $type]);

        // Upsert Location
        $stmtLoc = $pdo->prepare("INSERT INTO current_asset_locations (asset_id, asset_serial, asset_type, client_id, action, created_at)
                                VALUES (?, ?, ?, ?, 'CENSO', NOW())
                                ON DUPLICATE KEY UPDATE 
                                client_id = VALUES(client_id),
                                action = 'CENSO',
                                created_at = NOW()");
        $stmtLoc->execute([$facadeAssetId, $facadeSerial, $type, $client_id]);
        $processedCount++;
    }

    return $processedCount > 0;
}
