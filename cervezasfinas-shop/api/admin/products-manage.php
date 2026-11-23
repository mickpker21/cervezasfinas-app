<?php
require_once '../common.php';
require_once __DIR__ . '/../products/presentations-helper.php';

handleCORS();
requireSupabaseRole(['admin', 'operaciones', 'jefe de operaciones', 'sistemas']);
$pdo = getDB();

// Ensure schema is up to date
$columns = ['empresa', 'precio_envase', 'returnable_factor', 'allowed_zones', 'brand', 'presentacion', 'tamano'];
foreach ($columns as $col) {
    try {
        $check = $pdo->query("SHOW COLUMNS FROM shop_products LIKE '$col'")->fetch();
        if (!$check) {
            $type = in_array($col, ['empresa', 'allowed_zones', 'brand', 'presentacion', 'tamano'], true)
                ? 'VARCHAR(500) NULL'
                : 'DECIMAL(10,2) DEFAULT 0';
            $pdo->exec("ALTER TABLE shop_products ADD COLUMN $col $type");
        }
    } catch (Exception $e) {}
}

// Ensure shop_product_zones relational table exists
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS shop_product_zones (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sku VARCHAR(50) NOT NULL,
            zone VARCHAR(100) NOT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_sku_zone (sku, zone),
            INDEX idx_zone (zone),
            INDEX idx_sku (sku)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");
} catch (Exception $e) {}

// Auto-poblar marca en productos existentes que aún la tengan vacía
try {
    $bRows = $pdo->query("SELECT name FROM shop_brands WHERE name IS NOT NULL AND name != '' ORDER BY LENGTH(name) DESC")->fetchAll(PDO::FETCH_COLUMN);
    if (!empty($bRows)) {
        $unbrandedStmt = $pdo->query("SELECT id, name, sku FROM shop_products WHERE brand IS NULL OR brand = ''");
        $upBStmt = $pdo->prepare("UPDATE shop_products SET brand = ? WHERE id = ?");
        while ($pRow = $unbrandedStmt->fetch(PDO::FETCH_ASSOC)) {
            $txt = strtolower($pRow['name'] . ' ' . $pRow['sku']);
            foreach ($bRows as $bName) {
                $bLower = strtolower(trim($bName));
                if ($bLower !== '' && stripos($txt, $bLower) !== false) {
                    $upBStmt->execute([$bName, $pRow['id']]);
                    break;
                }
                if ($bLower === 'xx' && (stripos($txt, 'xx') !== false || stripos($txt, 'dos equis') !== false)) {
                    $upBStmt->execute([$bName, $pRow['id']]);
                    break;
                }
            }
        }
    }
} catch (Exception $e) {}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $action = $_GET['action'] ?? 'list';

    if ($action === 'zones') {
        // Return unique zones available in the business
        try {
            $zones = [];
            
            // From clients table
            try {
                $stmtC = $pdo->query("SELECT DISTINCT TRIM(zona_comercial) AS z FROM clients WHERE zona_comercial IS NOT NULL AND zona_comercial != ''");
                while ($r = $stmtC->fetch(PDO::FETCH_ASSOC)) {
                    $val = strtoupper(trim($r['z']));
                    if ($val !== '' && !in_array($val, $zones)) $zones[] = $val;
                }
            } catch (Exception $e) {}

            // From ventas_por_sku table
            try {
                $stmtV = $pdo->query("SELECT DISTINCT TRIM(zona) AS z FROM ventas_por_sku WHERE zona IS NOT NULL AND zona != ''");
                while ($r = $stmtV->fetch(PDO::FETCH_ASSOC)) {
                    $val = strtoupper(trim($r['z']));
                    if ($val !== '' && !in_array($val, $zones)) $zones[] = $val;
                }
            } catch (Exception $e) {}

            // From shop_special_prices
            try {
                $stmtS = $pdo->query("SELECT DISTINCT TRIM(zone) AS z FROM shop_special_prices WHERE zone IS NOT NULL AND zone != ''");
                while ($r = $stmtS->fetch(PDO::FETCH_ASSOC)) {
                    $val = strtoupper(trim($r['z']));
                    if ($val !== '' && !in_array($val, $zones)) $zones[] = $val;
                }
            } catch (Exception $e) {}

            // Return only existing zones from database (no hardcoded defaults)
            sort($zones);
            sendJSON(['success' => true, 'data' => $zones]);
        } catch (Exception $e) {
            sendJSON(['error' => $e->getMessage()], 500);
        }
    }

    // List all products + physical portafolio images on server
    try {
        $stmt = $pdo->query("SELECT * FROM shop_products ORDER BY name ASC");
        $products = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $presMap = getActivePresentationsBySku($pdo);
        foreach ($products as &$prodRow) {
            $prodRow['presentations'] = $presMap[$prodRow['sku']] ?? [];
        }
        unset($prodRow);

        // Scan /portafolio/ directory on server to detect which SKUs physically have photos
        $portafolioSkus = [];
        $possibleDirs = [
            ($_SERVER['DOCUMENT_ROOT'] ?? '') . '/portafolio',
            __DIR__ . '/../../../portafolio',
            __DIR__ . '/../../../../portafolio'
        ];
        foreach ($possibleDirs as $dir) {
            if ($dir && is_dir($dir)) {
                $files = @scandir($dir);
                if (is_array($files)) {
                    foreach ($files as $f) {
                        if ($f === '.' || $f === '..') continue;
                        $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
                        if (in_array($ext, ['png', 'jpg', 'jpeg', 'webp', 'gif'], true)) {
                            $base = strtoupper(trim(pathinfo($f, PATHINFO_FILENAME)));
                            if ($base !== '') {
                                $portafolioSkus[$base] = '/portafolio/' . $f;
                            }
                        }
                    }
                }
                break;
            }
        }

        sendJSON([
            'success' => true,
            'data' => $products,
            'portafolio_skus' => $portafolioSkus
        ]);
    } catch (PDOException $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
} elseif ($method === 'POST') {
    // Handle Multipart form data or JSON
    $data = $_POST;
    $rawInput = file_get_contents('php://input');
    if ($rawInput) {
        $jsonInput = json_decode($rawInput, true);
        if (is_array($jsonInput)) {
            $data = array_merge($data, $jsonInput);
        }
    }
    $action = $data['action'] ?? '';
    
    if (!$action && isset($data['allowed_zones']) && (isset($data['sku']) || isset($data['skus']))) {
        $action = 'update_zones';
    }

    if (!$action) {
        sendJSON(['error' => 'Action required'], 400);
    }

    $savePresentationsForSku = static function (PDO $pdo, string $targetSku, $rawPresentations) {
        ensurePresentationsSchema($pdo);
        $cleanSku = trim($targetSku);
        if ($cleanSku === '') return;

        $list = is_string($rawPresentations) ? json_decode($rawPresentations, true) : $rawPresentations;
        if (!is_array($list)) return;

        $pdo->prepare("DELETE FROM shop_product_presentations WHERE sku = ?")->execute([$cleanSku]);
        if (empty($list)) return;

        $insP = $pdo->prepare("
            INSERT INTO shop_product_presentations
                (sku, code, label, divisor, pieces_count, sub_label, custom_price, is_default, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ");
        $idx = 0;
        foreach ($list as $item) {
            if (!is_array($item)) continue;
            $label = trim((string)($item['label'] ?? ''));
            if ($label === '') continue;
            $code = strtoupper(preg_replace('/[^A-Za-z0-9_-]/', '_', trim((string)($item['code'] ?? ''))));
            if ($code === '') {
                $code = 'PRES_' . ($idx + 1);
            }
            $divisor = max(0.0001, (float)($item['divisor'] ?? 1));
            $pieces = max(0, (int)($item['pieces_count'] ?? 0));
            $subLabel = trim((string)($item['sub_label'] ?? ''));
            $customPrice = (isset($item['custom_price']) && $item['custom_price'] !== '' && $item['custom_price'] !== null)
                ? (float)$item['custom_price']
                : null;
            $isDefault = !empty($item['is_default']) ? 1 : 0;
            $insP->execute([
                $cleanSku,
                $code,
                $label,
                $divisor,
                $pieces,
                $subLabel !== '' ? $subLabel : null,
                $customPrice,
                $isDefault,
                $idx
            ]);
            $idx++;
        }
    };

    if ($action === 'save_presentations') {
        $targetSku = trim((string)($data['sku'] ?? ''));
        if ($targetSku === '') {
            sendJSON(['error' => 'SKU is required'], 400);
        }
        try {
            $savePresentationsForSku($pdo, $targetSku, $data['presentations'] ?? []);
            $updated = getActivePresentationsBySku($pdo, [$targetSku])[$targetSku] ?? [];
            sendJSON(['success' => true, 'data' => $updated]);
        } catch (Exception $e) {
            sendJSON(['error' => $e->getMessage()], 500);
        }
    }
    
    // Bulk sync SKUs from sku_descripcion / external
    if ($action === 'sync_skus') {
        $items = $data['items'] ?? [];
        if (is_string($items)) {
            $decoded = json_decode($items, true);
            if (is_array($decoded)) $items = $decoded;
        }
        if (empty($items) || !is_array($items)) {
            sendJSON(['error' => 'No se enviaron SKUs para sincronizar'], 400);
        }
        
        $inserted = 0;
        $updated = 0;
        
        $existing = [];
        $stmtEx = $pdo->query("SELECT sku, id, name, description, image_url, allowed_zones, brand FROM shop_products");
        while ($r = $stmtEx->fetch(PDO::FETCH_ASSOC)) {
            $existing[strtoupper(trim($r['sku']))] = $r;
        }

        // Obtener marcas oficiales de shop_brands para auto-asignar inteligentemente
        $allBrands = [];
        try {
            $bStmt = $pdo->query("SELECT name FROM shop_brands ORDER BY LENGTH(name) DESC");
            while ($br = $bStmt->fetch(PDO::FETCH_ASSOC)) {
                if (!empty($br['name'])) $allBrands[] = trim($br['name']);
            }
        } catch (Exception $e) {}

        $pdo->beginTransaction();
        try {
            $insertStmt = $pdo->prepare("
                INSERT INTO shop_products (sku, name, description, base_price, category, image_url, is_active, allowed_zones, brand) 
                VALUES (?, ?, ?, 0, 'Cerveza', ?, 1, NULL, ?)
            ");
            $updateStmt = $pdo->prepare("
                UPDATE shop_products 
                SET name = ?, 
                    description = COALESCE(NULLIF(description, ''), ?),
                    image_url = COALESCE(NULLIF(image_url, ''), ?),
                    brand = COALESCE(NULLIF(brand, ''), ?)
                WHERE id = ?
            ");

            foreach ($items as $item) {
                $sku = trim((string)($item['sku'] ?? $item['cve_marca'] ?? ''));
                $desc = trim((string)($item['descripcion'] ?? $item['name'] ?? $item['description'] ?? ''));
                if ($sku === '') continue;

                $upperSku = strtoupper($sku);
                $img = 'portafolio/' . $sku . '.png';

                // Detectar marca inteligente si viene en el item o en el texto de la descripción
                $brandToAssign = null;
                if (!empty($item['brand'])) {
                    $brandToAssign = trim((string)$item['brand']);
                } else {
                    $textToSearch = strtolower($desc . ' ' . $sku);
                    foreach ($allBrands as $bName) {
                        if ($bName !== '' && stripos($textToSearch, strtolower($bName)) !== false) {
                            $brandToAssign = $bName;
                            break;
                        }
                    }
                    if (!$brandToAssign && (stripos($textToSearch, 'xx') !== false || stripos($textToSearch, 'dos equis') !== false)) {
                        foreach ($allBrands as $bName) {
                            if (stripos($bName, 'xx') !== false || stripos($bName, 'dos equis') !== false) {
                                $brandToAssign = $bName;
                                break;
                            }
                        }
                    }
                }

                if (!isset($existing[$upperSku])) {
                    $nameToUse = $desc !== '' ? $desc : ('SKU ' . $sku);
                    $insertStmt->execute([$sku, $nameToUse, $nameToUse, $img, $brandToAssign]);
                    $inserted++;
                    $existing[$upperSku] = true;
                } else {
                    $existRow = $existing[$upperSku];
                    if (is_array($existRow)) {
                        $curName = trim((string)($existRow['name'] ?? ''));
                        $curImg = trim((string)($existRow['image_url'] ?? ''));
                        $curBrand = trim((string)($existRow['brand'] ?? ''));
                        $needsNameUpdate = ($curName === '' || $curName === $sku || stripos($curName, 'SKU ') === 0) && $desc !== '';
                        $needsImgUpdate = ($curImg === '');
                        $needsBrandUpdate = ($curBrand === '' && $brandToAssign !== null);
                        if ($needsNameUpdate || $needsImgUpdate || $needsBrandUpdate) {
                            $newName = $needsNameUpdate ? $desc : ($curName ?: $sku);
                            $newBrand = $needsBrandUpdate ? $brandToAssign : ($curBrand ?: null);
                            $updateStmt->execute([$newName, $newName, $img, $newBrand, $existRow['id']]);
                            $updated++;
                        }
                    }
                }
            }
            $pdo->commit();
        } catch (Exception $ex) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            sendJSON(['error' => 'Error al sincronizar SKUs: ' . $ex->getMessage()], 500);
        }

        sendJSON([
            'success' => true,
            'message' => "Sincronización completada: $inserted nuevos productos añadidos al catálogo Shop, $updated actualizados.",
            'inserted' => $inserted,
            'updated' => $updated
        ]);
    }

    // Direct update of product brand
    if ($action === 'update_brand') {
        $id = $data['id'] ?? null;
        $sku = $data['sku'] ?? null;
        $brand = isset($data['brand']) ? trim((string)$data['brand']) : null;
        if ($brand === '' || $brand === 'none') $brand = null;
        
        try {
            if ($id) {
                $stmt = $pdo->prepare("UPDATE shop_products SET brand = ? WHERE id = ?");
                $stmt->execute([$brand, $id]);
            } elseif ($sku) {
                $stmt = $pdo->prepare("UPDATE shop_products SET brand = ? WHERE sku = ?");
                $stmt->execute([$brand, $sku]);
            } else {
                sendJSON(['error' => 'ID o SKU requerido'], 400);
            }
            sendJSON(['success' => true, 'message' => 'Marca actualizada correctamente', 'brand' => $brand]);
        } catch (PDOException $e) {
            sendJSON(['error' => $e->getMessage()], 500);
        }
    }

    // Direct update of allowed zones for single/multiple SKUs
    if ($action === 'update_zones') {
        $skus = $data['skus'] ?? [];
        if (!is_array($skus) && isset($data['sku'])) {
            $skus = [$data['sku']];
        }
        if (empty($skus)) {
            sendJSON(['error' => 'Se requiere al menos un SKU'], 400);
        }

        $allowedZones = isset($data['allowed_zones']) ? trim((string)$data['allowed_zones']) : null;
        if ($allowedZones === '' || strtoupper($allowedZones) === 'TODAS' || strtoupper($allowedZones) === 'ALL') {
            $allowedZones = null;
        }

        $stmtUp = $pdo->prepare("UPDATE shop_products SET allowed_zones = ? WHERE sku = ?");
        $stmtDelZone = $pdo->prepare("DELETE FROM shop_product_zones WHERE sku = ?");
        $stmtInsZone = $pdo->prepare("INSERT IGNORE INTO shop_product_zones (sku, zone, is_active) VALUES (?, ?, 1)");

        foreach ($skus as $s) {
            $s = trim((string)$s);
            if (!$s) continue;
            $stmtUp->execute([$allowedZones, $s]);
            $stmtDelZone->execute([$s]);

            if ($allowedZones) {
                $parts = array_filter(array_map('trim', explode(',', $allowedZones)));
                foreach ($parts as $pZone) {
                    if ($pZone !== '') {
                        $stmtInsZone->execute([$s, strtoupper($pZone)]);
                    }
                }
            }
        }

        sendJSON([
            'success' => true,
            'message' => 'Restricción de zonas actualizada correctamente.',
            'allowed_zones' => $allowedZones
        ]);
    }

    $sku = trim((string)($data['sku'] ?? ''));
    $name = trim((string)($data['name'] ?? ''));
    $description = trim((string)($data['description'] ?? ''));
    $basePrice = $data['base_price'] ?? 0;
    $category = $data['category'] ?? 'General';
    $isActive = isset($data['is_active']) ? ((int)$data['is_active']) : 1;
    $id = $data['id'] ?? null;
    $currentImageUrl = $data['current_image_url'] ?? '';
    $empresa = $data['empresa'] ?? '';
    $precioEnvase = $data['precio_envase'] ?? 0;
    $returnableFactor = $data['returnable_factor'] ?? 0;
    $allowedZones = isset($data['allowed_zones']) ? trim((string)$data['allowed_zones']) : null;
    if ($allowedZones === '' || strtoupper($allowedZones) === 'TODAS' || strtoupper($allowedZones) === 'ALL') {
        $allowedZones = null;
    }
    $brand = isset($data['brand']) ? trim((string)$data['brand']) : null;
    if ($brand === '' || $brand === 'none') {
        $brand = null;
    }
    $presentacion = isset($data['presentacion']) ? trim((string)$data['presentacion']) : null;
    if ($presentacion === '') {
        $presentacion = null;
    }
    $tamano = isset($data['tamano']) ? trim((string)$data['tamano']) : null;
    if ($tamano === '') {
        $tamano = null;
    }

    // Handle Image Upload
    $imageUrl = $currentImageUrl;
    if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
        $uploadDir = '../../assets/products/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }
        
        $extension = strtolower(pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION));
        if (!in_array($extension, ['jpg', 'jpeg', 'png', 'webp', 'gif'], true)) {
            sendJSON(['error' => 'Formato de imagen no permitido (solo JPG, PNG, WEBP, GIF)'], 400);
        }
        $safeSku = preg_replace('/[^a-zA-Z0-9_-]/', '_', (string)$sku);
        $filename = $safeSku . '_' . time() . '.' . $extension;
        $targetPath = $uploadDir . $filename;
        
        if (move_uploaded_file($_FILES['image']['tmp_name'], $targetPath)) {
            $imageUrl = 'assets/products/' . $filename;
        }
    }

    try {
        if ($action === 'create') {
            $sql = "INSERT INTO shop_products (sku, name, description, base_price, category, image_url, is_active, empresa, precio_envase, returnable_factor, allowed_zones, brand, presentacion, tamano) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$sku, $name, $description, $basePrice, $category, $imageUrl, $isActive, $empresa, $precioEnvase, $returnableFactor, $allowedZones, $brand, $presentacion, $tamano]);
            
            // Sync shop_product_zones
            if ($sku) {
                $pdo->prepare("DELETE FROM shop_product_zones WHERE sku = ?")->execute([$sku]);
                if ($allowedZones) {
                    $insZ = $pdo->prepare("INSERT IGNORE INTO shop_product_zones (sku, zone, is_active) VALUES (?, ?, 1)");
                    foreach (array_filter(array_map('trim', explode(',', $allowedZones))) as $z) {
                        $insZ->execute([$sku, strtoupper($z)]);
                    }
                }
            }

            if ($sku && isset($data['presentations'])) {
                $savePresentationsForSku($pdo, $sku, $data['presentations']);
            }

            sendJSON(['success' => true, 'message' => 'Product created']);
            
        } elseif ($action === 'update') {
            $sql = "UPDATE shop_products SET 
                    name = ?, description = ?, base_price = ?, category = ?, image_url = ?, is_active = ?, empresa = ?, precio_envase = ?, returnable_factor = ?, allowed_zones = ?, brand = ?, presentacion = ?, tamano = ? 
                    WHERE id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$name, $description, $basePrice, $category, $imageUrl, $isActive, $empresa, $precioEnvase, $returnableFactor, $allowedZones, $brand, $presentacion, $tamano, $id]);

            // Sync shop_product_zones if sku available
            if ($sku) {
                $pdo->prepare("DELETE FROM shop_product_zones WHERE sku = ?")->execute([$sku]);
                if ($allowedZones) {
                    $insZ = $pdo->prepare("INSERT IGNORE INTO shop_product_zones (sku, zone, is_active) VALUES (?, ?, 1)");
                    foreach (array_filter(array_map('trim', explode(',', $allowedZones))) as $z) {
                        $insZ->execute([$sku, strtoupper($z)]);
                    }
                }
            }

            if ($sku && isset($data['presentations'])) {
                $savePresentationsForSku($pdo, $sku, $data['presentations']);
            }

            sendJSON(['success' => true, 'message' => 'Product updated']);
        } elseif ($action === 'delete') {
            if (!$id) sendJSON(['error' => 'ID required for deletion'], 400);
            $sql = "DELETE FROM shop_products WHERE id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$id]);
            sendJSON(['success' => true, 'message' => 'Product deleted']);
        }
    } catch (PDOException $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
}
?>