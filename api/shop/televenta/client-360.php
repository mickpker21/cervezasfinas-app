<?php
// api/shop/televenta/client-360.php
// Panel Todo-en-Uno de Atención al Cliente 360° para Televenta:
// - Búsqueda rápida de cualquier cliente o prospecto de WhatsApp
// - Expediente completo (Datos generales, ruta, zona, GEC, días de visita)
// - Cuenta UM6 SHOP: estatus, saldo de puntos, historial de puntos y cambio/creación de contraseña
// - Teléfono y WhatsApp Bot: vincular, cambiar o desvincular número, ver logs del bot y estado de ventana gratuita 24h
// - Chat en vivo de Soporte / Solicitudes de hablar con asesor
// - Historial de pedidos anteriores (Tienda + WhatsApp) y modificaciones

require_once '../common.php';

$waHandoffPaths = [
    __DIR__ . '/../../whatsapp/handoff.php',
    ($_SERVER['DOCUMENT_ROOT'] ?? '') . '/api/whatsapp/handoff.php'
];
foreach ($waHandoffPaths as $p) {
    if ($p && file_exists($p)) {
        require_once $p;
        break;
    }
}

$waSenderPaths = [
    __DIR__ . '/../../whatsapp/sender.php',
    ($_SERVER['DOCUMENT_ROOT'] ?? '') . '/api/whatsapp/sender.php'
];
foreach ($waSenderPaths as $p) {
    if ($p && file_exists($p)) {
        require_once $p;
        break;
    }
}

handleCORS();
requireSupabaseRole(['admin', 'televenta', 'supervisor', 'operaciones', 'jefe de operaciones', 'sistemashop', 'sistema shop']);
$pdo = getDB();

if (class_exists('WhatsAppHandoff')) {
    WhatsAppHandoff::ensureSchema($pdo);
}

function getWhatsAppUsageSummary($pdo) {
    $waUsage = [
        'outbound_today' => 0,
        'inbound_today' => 0,
        'outbound_month' => 0,
        'pause_outbound' => false,
        'only_24h_free_window' => true,
        'daily_per_phone_limit' => 40,
        'daily_global_limit' => 500,
        'televenta_schedule_days' => 'Lunes a Sábado',
        'televenta_hours_start' => '08:00',
        'televenta_hours_end' => '18:00',
        'bot_training_rules' => ''
    ];
    try {
        $uStmt = $pdo->query("
            SELECT 
                COALESCE(SUM(CASE WHEN direction = 'OUTBOUND' AND message_type != 'status_update' AND status = 'sent' AND DATE(created_at) = CURDATE() THEN 1 ELSE 0 END), 0) AS outbound_today,
                COALESCE(SUM(CASE WHEN direction = 'INBOUND' AND DATE(created_at) = CURDATE() THEN 1 ELSE 0 END), 0) AS inbound_today,
                COALESCE(SUM(CASE WHEN direction = 'OUTBOUND' AND message_type != 'status_update' AND status = 'sent' AND YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE()) THEN 1 ELSE 0 END), 0) AS outbound_month
            FROM shop_whatsapp_logs
        ");
        $uRow = $uStmt->fetch(PDO::FETCH_ASSOC);
        if ($uRow) {
            $waUsage['outbound_today'] = intval($uRow['outbound_today']);
            $waUsage['inbound_today'] = intval($uRow['inbound_today']);
            $waUsage['outbound_month'] = intval($uRow['outbound_month']);
        }
        $setStmt = $pdo->query("SELECT setting_key, setting_value FROM shop_whatsapp_settings");
        while ($sRow = $setStmt->fetch(PDO::FETCH_ASSOC)) {
            $k = $sRow['setting_key'];
            $v = $sRow['setting_value'];
            if ($k === 'pause_outbound') $waUsage['pause_outbound'] = ($v === '1' || $v === 'true');
            if ($k === 'only_24h_free_window') $waUsage['only_24h_free_window'] = ($v !== '0' && $v !== 'false');
            if ($k === 'daily_per_phone_limit') $waUsage['daily_per_phone_limit'] = max(5, intval($v));
            if ($k === 'daily_global_limit') $waUsage['daily_global_limit'] = max(20, intval($v));
            if ($k === 'televenta_schedule_days' && trim((string)$v) !== '') $waUsage['televenta_schedule_days'] = trim((string)$v);
            if ($k === 'televenta_hours_start' && trim((string)$v) !== '') $waUsage['televenta_hours_start'] = trim((string)$v);
            if ($k === 'televenta_hours_end' && trim((string)$v) !== '') $waUsage['televenta_hours_end'] = trim((string)$v);
            if ($k === 'bot_training_rules') $waUsage['bot_training_rules'] = (string)$v;
        }
    } catch (Exception $e) {}
    return $waUsage;
}

function calculateNextDayDelivery($visitDaysRaw) {
    if (empty($visitDaysRaw)) return '';
    $mapNextDay = [
        'lunes'     => 'Martes',
        'martes'    => 'Miércoles',
        'miercoles' => 'Jueves',
        'miércoles' => 'Jueves',
        'jueves'    => 'Viernes',
        'viernes'   => 'Sábado',
        'sabado'    => 'Lunes',
        'sábado'    => 'Lunes',
        'domingo'   => 'Lunes',
        'lun'       => 'Martes',
        'mar'       => 'Miércoles',
        'mie'       => 'Jueves',
        'mié'       => 'Jueves',
        'jue'       => 'Viernes',
        'vie'       => 'Sábado',
        'sab'       => 'Lunes',
        'sáb'       => 'Lunes',
        'dom'       => 'Lunes'
    ];
    $clean = str_replace(['[', ']', '"', "'"], '', (string)$visitDaysRaw);
    $tokens = preg_split('/[,;\/|\s]+/', mb_strtolower(trim($clean)));
    $deliveryDays = [];
    foreach ($tokens as $t) {
        $t = trim($t);
        if (isset($mapNextDay[$t])) {
            $deliveryDays[] = $mapNextDay[$t];
        }
    }
    $deliveryDays = array_values(array_unique($deliveryDays));
    return implode(', ', $deliveryDays);
}

// Asegurar columna delivery_days en clients para guardar explícitamente Día de Reparto si se edita
try {
    $colCheck = $pdo->query("SHOW COLUMNS FROM clients LIKE 'delivery_days'");
    if ($colCheck && $colCheck->rowCount() === 0) {
        $pdo->exec("ALTER TABLE clients ADD COLUMN delivery_days VARCHAR(120) NULL AFTER visit_days");
    }
} catch (Exception $e) {}

function resolveClientCodeByPhone($pdo, $rawPhone) {
    $digits = preg_replace('/[^0-9]/', '', (string)$rawPhone);
    if (strlen($digits) < 10) return null;
    $last10 = substr($digits, -10);

    // 1. Buscar en shop_client_users por últimos 10 dígitos
    try {
        $stmt = $pdo->prepare("
            SELECT client_code
            FROM shop_client_users
            WHERE phone IS NOT NULL AND phone != ''
              AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 10) = ?
            ORDER BY is_active DESC, id DESC
            LIMIT 1
        ");
        $stmt->execute([$last10]);
        $code = trim((string)$stmt->fetchColumn());
        if ($code !== '') return $code;
    } catch (Exception $e) {}

    // 2. Buscar en tabla maestra clients por últimos 10 dígitos
    try {
        $stmt = $pdo->prepare("
            SELECT client_code
            FROM clients
            WHERE phone IS NOT NULL AND phone != ''
              AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 10) = ?
            LIMIT 1
        ");
        $stmt->execute([$last10]);
        $code = trim((string)$stmt->fetchColumn());
        if ($code !== '') return $code;
    } catch (Exception $e) {}

    // 3. Buscar en verificaciones aprobadas de WhatsApp
    try {
        $stmt = $pdo->prepare("
            SELECT client_code
            FROM shop_whatsapp_verifications
            WHERE status = 'APPROVED'
              AND client_code IS NOT NULL AND client_code != ''
              AND RIGHT(phone_number, 10) = ?
            ORDER BY id DESC
            LIMIT 1
        ");
        $stmt->execute([$last10]);
        $code = trim((string)$stmt->fetchColumn());
        if ($code !== '') return $code;
    } catch (Exception $e) {}

    return null;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $clientCode = trim((string)($_GET['client_code'] ?? ''));
    $search = trim((string)($_GET['q'] ?? ''));

    // =========================================================================
    // MODO 1: EXPEDIENTE 360° DE UN CLIENTE ESPECÍFICO (?client_code=...)
    // =========================================================================
    if ($clientCode !== '') {
        try {
            $isWaProspect = (strpos($clientCode, 'WA-') === 0);
            $rawWaPhone = $isWaProspect ? preg_replace('/[^0-9]/', '', substr($clientCode, 3)) : '';

            // Auto-resolver WA-<telefono> al cliente real si el número (últimos 10 dígitos) ya está vinculado
            if ($isWaProspect && $rawWaPhone !== '') {
                $resolvedCode = resolveClientCodeByPhone($pdo, $rawWaPhone);
                if ($resolvedCode !== null) {
                    $clientCode = $resolvedCode;
                    $isWaProspect = false;
                    // Auto-reparar shop_whatsapp_sessions para que ya quede vinculado
                    try {
                        $last10Fix = substr($rawWaPhone, -10);
                        $bName = $pdo->prepare("SELECT business_name FROM clients WHERE client_code = ? LIMIT 1");
                        $bName->execute([$resolvedCode]);
                        $bnVal = (string)($bName->fetchColumn() ?: '');
                        $pdo->prepare("
                            UPDATE shop_whatsapp_sessions
                            SET client_code = ?, business_name = COALESCE(NULLIF(?, ''), business_name)
                            WHERE RIGHT(phone_number, 10) = ? AND (client_code IS NULL OR client_code = '')
                        ")->execute([$resolvedCode, $bnVal, $last10Fix]);
                    } catch (Exception $e) {}
                }
            }

            // 1. Datos de tabla clients
            $clientRow = null;
            if (!$isWaProspect) {
                $stmtC = $pdo->prepare("SELECT * FROM clients WHERE client_code = ? LIMIT 1");
                $stmtC->execute([$clientCode]);
                $clientRow = $stmtC->fetch(PDO::FETCH_ASSOC) ?: null;
            }

            if (!$clientRow) {
                $clientRow = [
                    'client_code' => $clientCode,
                    'business_name' => $isWaProspect ? ('Prospecto WhatsApp +' . $rawWaPhone) : ('Cliente ' . $clientCode),
                    'contact' => '',
                    'phone' => $rawWaPhone,
                    'address' => '',
                    'sales_route' => '',
                    'zona_comercial' => '',
                    'gec' => '',
                    'visit_days' => '',
                    'delivery_days' => '',
                    'is_prospect' => $isWaProspect
                ];
            }

            // Especificar claramente Día de Visita de Venta vs Día de Reparto
            $clientRow['visit_days_venta'] = $clientRow['visit_days'] ?? '';
            $clientRow['delivery_days'] = !empty($clientRow['delivery_days'])
                ? $clientRow['delivery_days']
                : calculateNextDayDelivery($clientRow['visit_days'] ?? '');

            // 2. Cuenta en UM6 SHOP (shop_client_users) y Puntos
            $shopUser = null;
            $pointsBalance = 0;
            $pointsHistory = [];
            $redemptions = [];

            if (!$isWaProspect) {
                try {
                    $stmtU = $pdo->prepare("
                        SELECT id, client_code, phone, is_active, COALESCE(must_change_password, 1) AS must_change_password, created_at, last_login
                        FROM shop_client_users
                        WHERE client_code = ?
                        ORDER BY is_active DESC, id DESC
                        LIMIT 1
                    ");
                    $stmtU->execute([$clientCode]);
                    $shopUser = $stmtU->fetch(PDO::FETCH_ASSOC) ?: null;
                } catch (Exception $e) {}

                try {
                    $stmtP = $pdo->prepare("SELECT points_balance, updated_at FROM shop_client_points WHERE client_code = ? LIMIT 1");
                    $stmtP->execute([$clientCode]);
                    $pRow = $stmtP->fetch(PDO::FETCH_ASSOC);
                    if ($pRow && $shopUser && intval($shopUser['is_active']) === 1) {
                        $pointsBalance = intval($pRow['points_balance']);
                    }
                } catch (Exception $e) {}

                try {
                    $stmtTx = $pdo->prepare("
                        SELECT id, transaction_type, points_amount, description, created_at
                        FROM shop_points_transactions
                        WHERE client_code = ?
                        ORDER BY id DESC
                        LIMIT 20
                    ");
                    $stmtTx->execute([$clientCode]);
                    $pointsHistory = $stmtTx->fetchAll(PDO::FETCH_ASSOC);
                } catch (Exception $e) {}

                try {
                    $stmtRed = $pdo->prepare("
                        SELECT r.*, p.name AS product_name
                        FROM shop_redemptions r
                        LEFT JOIN shop_redemption_catalog p ON p.id = r.catalog_item_id
                        WHERE r.client_code = ?
                        ORDER BY r.id DESC
                        LIMIT 15
                    ");
                    $stmtRed->execute([$clientCode]);
                    $redemptions = $stmtRed->fetchAll(PDO::FETCH_ASSOC);
                } catch (Exception $e) {}
            }

            // 3. Sesión de WhatsApp Bot, Ventana Gratuita 24h, Verificaciones y Bitácora de mensajes
            $waSession = null;
            $inFreeWindow = false;
            $verifications = [];
            $waLogs = [];

            $candidatePhone = $rawWaPhone ?: preg_replace('/[^0-9]/', '', (string)($clientRow['phone'] ?? ($shopUser['phone'] ?? '')));
            $last10 = strlen($candidatePhone) >= 10 ? substr($candidatePhone, -10) : '';

            try {
                if (!$isWaProspect) {
                    $stmtS = $pdo->prepare("
                        SELECT *, (last_interaction >= (NOW() - INTERVAL 24 HOUR)) AS within_24h
                        FROM shop_whatsapp_sessions
                        WHERE client_code = ? OR (? != '' AND RIGHT(phone_number, 10) = ?)
                        ORDER BY last_interaction DESC
                        LIMIT 1
                    ");
                    $stmtS->execute([$clientCode, $last10, $last10]);
                    $waSession = $stmtS->fetch(PDO::FETCH_ASSOC) ?: null;
                } elseif ($last10 !== '') {
                    $stmtS = $pdo->prepare("
                        SELECT *, (last_interaction >= (NOW() - INTERVAL 24 HOUR)) AS within_24h
                        FROM shop_whatsapp_sessions
                        WHERE RIGHT(phone_number, 10) = ?
                        ORDER BY last_interaction DESC
                        LIMIT 1
                    ");
                    $stmtS->execute([$last10]);
                    $waSession = $stmtS->fetch(PDO::FETCH_ASSOC) ?: null;
                }
            } catch (Exception $e) {}

            if ($waSession) {
                $inFreeWindow = !empty($waSession['within_24h']);
                if (!empty($waSession['phone_number'])) {
                    $candidatePhone = preg_replace('/[^0-9]/', '', (string)$waSession['phone_number']);
                    $last10 = strlen($candidatePhone) >= 10 ? substr($candidatePhone, -10) : '';
                }
            }

            if ($last10 !== '') {
                try {
                    $stmtIn = $pdo->prepare("
                        SELECT COUNT(*) FROM shop_whatsapp_logs
                        WHERE direction = 'INBOUND' AND RIGHT(phone_number, 10) = ? AND created_at >= (NOW() - INTERVAL 24 HOUR)
                    ");
                    $stmtIn->execute([$last10]);
                    if (intval($stmtIn->fetchColumn()) > 0) {
                        $inFreeWindow = true;
                    }
                } catch (Exception $e) {}

                try {
                    $stmtLogs = $pdo->prepare("
                        SELECT id, phone_number, direction, message_type, message_body, status, created_at
                        FROM shop_whatsapp_logs
                        WHERE RIGHT(phone_number, 10) = ? AND message_type != 'status_update'
                        ORDER BY id DESC
                        LIMIT 40
                    ");
                    $stmtLogs->execute([$last10]);
                    $waLogs = array_reverse($stmtLogs->fetchAll(PDO::FETCH_ASSOC));
                } catch (Exception $e) {}
            }

            try {
                if (!$isWaProspect) {
                    $stmtV = $pdo->prepare("
                        SELECT * FROM shop_whatsapp_verifications
                        WHERE client_code = ? OR (? != '' AND RIGHT(phone_number, 10) = ?)
                        ORDER BY id DESC
                        LIMIT 10
                    ");
                    $stmtV->execute([$clientCode, $last10, $last10]);
                    $verifications = $stmtV->fetchAll(PDO::FETCH_ASSOC);
                }
            } catch (Exception $e) {}

            // 4. Mensajes del Chat de Soporte (tanto bajo client_code como bajo WA-<phone>)
            $supportMessages = [];
            try {
                $waKey = $candidatePhone !== '' ? ('WA-' . $candidatePhone) : '';
                $waKey10 = $last10 !== '' ? ('WA-521' . $last10) : '';
                $stmtChat = $pdo->prepare("
                    SELECT id, client_code, sender_type, message, is_read, created_at
                    FROM shop_support_messages
                    WHERE client_code = ?
                       OR (? != '' AND client_code = ?)
                       OR (? != '' AND client_code = ?)
                    ORDER BY created_at ASC
                    LIMIT 100
                ");
                $stmtChat->execute([$clientCode, $waKey, $waKey, $waKey10, $waKey10]);
                $supportMessages = $stmtChat->fetchAll(PDO::FETCH_ASSOC);

                // Marcar como leídos al abrir el expediente
                $pdo->prepare("UPDATE shop_support_messages SET is_read = 1 WHERE client_code = ? AND sender_type = 'client'")->execute([$clientCode]);
            } catch (Exception $e) {}

            // 5. Pedidos Solicitados / Pendientes de Entrega (shop_orders + preventa) y Entregados Reales (ventas_por_sku)
            $orders = [];
            $deliveredSales = [];
            if (!$isWaProspect) {
                // 5A. SOLAMENTE Pedidos Solicitados / Pendientes de Entrega en shop_orders (status IN ('pending', 'confirmed'))
                try {
                    $stmtOrd = $pdo->prepare("
                        SELECT id, order_number, client_code, total_amount, status, delivery_date, notes, created_at
                        FROM shop_orders
                        WHERE client_code = ?
                          AND status IN ('pending', 'confirmed')
                        ORDER BY created_at DESC
                        LIMIT 40
                    ");
                    $stmtOrd->execute([$clientCode]);
                    $orders = $stmtOrd->fetchAll(PDO::FETCH_ASSOC);

                    if (!empty($orders)) {
                        $orderIds = array_column($orders, 'id');
                        $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
                        $stmtItems = $pdo->prepare("
                            SELECT oi.*, COALESCE(p.name, s.descripcion, oi.sku) AS product_name
                            FROM shop_order_items oi
                            LEFT JOIN shop_products p ON p.sku = oi.sku
                            LEFT JOIN skus s ON s.cve_marca = oi.sku
                            WHERE oi.order_id IN ($placeholders)
                        ");
                        $stmtItems->execute($orderIds);
                        $allItems = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

                        $itemsByOrder = [];
                        foreach ($allItems as $it) {
                            $itemsByOrder[$it['order_id']][] = [
                                'sku' => $it['sku'],
                                'product_name' => $it['product_name'] ?: $it['sku'],
                                'quantity' => intval($it['quantity']),
                                'unit_price' => floatval($it['unit_price']),
                                'subtotal' => floatval($it['subtotal'])
                            ];
                        }

                        foreach ($orders as &$ord) {
                            $ord['source'] = 'shop';
                            $ord['client_name'] = $clientRow['business_name'] ?? ('Cliente ' . $clientCode);
                            $ord['phone'] = $candidatePhone ?: ($clientRow['phone'] ?? '');
                            $ord['is_shop_registered'] = ($shopUser && intval($shopUser['is_active']) === 1);
                            $ord['items'] = $itemsByOrder[$ord['id']] ?? [];
                        }
                        unset($ord);
                    }
                } catch (Exception $e) {}

                // 5B. También incluir pedidos levantados por Televenta en llamada (shop_preventa_overrides pendientes/confirmados)
                try {
                    $stmtPrev = $pdo->prepare("
                        SELECT preventa_id, client_code, status, total_amount, delivery_date, items_json, notes, created_at, updated_at
                        FROM shop_preventa_overrides
                        WHERE client_code = ?
                          AND LOWER(COALESCE(status, 'pending')) IN ('pending', 'pendiente', 'confirmed', 'confirmado', 'cargado', 'en_ruta')
                        ORDER BY COALESCE(created_at, updated_at) DESC
                        LIMIT 25
                    ");
                    $stmtPrev->execute([$clientCode]);
                    $prevRows = $stmtPrev->fetchAll(PDO::FETCH_ASSOC);
                    foreach ($prevRows as $pr) {
                        $rawSt = strtolower(trim((string)($pr['status'] ?? 'pending')));
                        $normStatus = in_array($rawSt, ['confirmed', 'confirmado', 'cargado', 'en_ruta'], true) ? 'confirmed' : 'pending';
                        $decodedItems = json_decode((string)($pr['items_json'] ?? '[]'), true);
                        $normItems = [];
                        if (is_array($decodedItems)) {
                            foreach ($decodedItems as $it) {
                                $qty = intval($it['quantity'] ?? 0);
                                $up = floatval($it['unit_price'] ?? 0);
                                $normItems[] = [
                                    'sku' => (string)($it['sku'] ?? ''),
                                    'product_name' => (string)($it['name'] ?? ($it['product_name'] ?? ($it['sku'] ?? 'Producto'))),
                                    'quantity' => $qty,
                                    'unit_price' => $up,
                                    'subtotal' => floatval($it['subtotal'] ?? ($qty * $up))
                                ];
                            }
                        }
                        $orders[] = [
                            'id' => $pr['preventa_id'],
                            'order_number' => 'PREV-' . strtoupper(substr((string)$pr['preventa_id'], 0, 8)),
                            'client_code' => $clientCode,
                            'client_name' => $clientRow['business_name'] ?? ('Cliente ' . $clientCode),
                            'phone' => $candidatePhone ?: ($clientRow['phone'] ?? ''),
                            'total_amount' => floatval($pr['total_amount'] ?? 0),
                            'status' => $normStatus,
                            'delivery_date' => $pr['delivery_date'] ?? null,
                            'notes' => !empty($pr['notes']) ? $pr['notes'] : 'Pedido levantado por Televenta en llamada',
                            'created_at' => $pr['created_at'] ?? $pr['updated_at'],
                            'source' => 'preventa',
                            'is_shop_registered' => ($shopUser && intval($shopUser['is_active']) === 1),
                            'items' => $normItems
                        ];
                    }
                } catch (Exception $e) {}

                // 5C. SOLAMENTE Pedidos Reales Entregados que existen en ventas_por_sku
                try {
                    $stmtSales = $pdo->prepare("
                        SELECT *
                        FROM ventas_por_sku
                        WHERE cve_cliente = ?
                        ORDER BY fecha_alta DESC
                        LIMIT 300
                    ");
                    $stmtSales->execute([$clientCode]);
                    $rawSales = $stmtSales->fetchAll(PDO::FETCH_ASSOC);

                    if (!empty($rawSales)) {
                        $skuSet = [];
                        foreach ($rawSales as $rs) {
                            $skuCode = trim((string)($rs['cve_marca'] ?? ''));
                            if ($skuCode !== '') $skuSet[$skuCode] = true;
                        }
                        $skuNames = [];
                        if (!empty($skuSet)) {
                            $skuList = array_keys($skuSet);
                            $ph = implode(',', array_fill(0, count($skuList), '?'));
                            try {
                                $stmtN1 = $pdo->prepare("SELECT sku, name FROM shop_products WHERE sku IN ($ph)");
                                $stmtN1->execute($skuList);
                                while ($r1 = $stmtN1->fetch(PDO::FETCH_ASSOC)) {
                                    $skuNames[$r1['sku']] = $r1['name'];
                                }
                            } catch (Exception $e) {}
                            try {
                                $stmtN2 = $pdo->prepare("SELECT cve_marca, descripcion FROM skus WHERE cve_marca IN ($ph)");
                                $stmtN2->execute($skuList);
                                while ($r2 = $stmtN2->fetch(PDO::FETCH_ASSOC)) {
                                    if (!isset($skuNames[$r2['cve_marca']]) && !empty($r2['descripcion'])) {
                                        $skuNames[$r2['cve_marca']] = $r2['descripcion'];
                                    }
                                }
                            } catch (Exception $e) {}
                        }

                        $groupedSales = [];
                        foreach ($rawSales as $rs) {
                            $fecha = substr((string)($rs['fecha_alta'] ?? ''), 0, 10);
                            $remision = trim((string)($rs['num_remision'] ?? ($rs['remision'] ?? '')));
                            $groupKey = $remision !== '' ? $remision : ('DIA-' . ($fecha ?: 'SN'));

                            $qty = floatval($rs['unidades'] ?? ($rs['cantidad'] ?? 0));
                            $amount = floatval($rs['venta'] ?? ($rs['importe'] ?? ($rs['monto'] ?? 0)));
                            $unitPrice = $qty > 0 ? round($amount / $qty, 2) : $amount;
                            $skuCode = trim((string)($rs['cve_marca'] ?? ''));
                            $prodName = $skuNames[$skuCode] ?? ($rs['des_marca'] ?? ($rs['descripcion'] ?? ($skuCode ?: 'Producto')));

                            if (!isset($groupedSales[$groupKey])) {
                                $groupedSales[$groupKey] = [
                                    'id' => 'VTA-' . $groupKey,
                                    'order_number' => $remision !== '' ? ('REM-' . $remision) : ('ENT-' . str_replace('-', '', $fecha)),
                                    'remision' => $remision,
                                    'client_code' => $clientCode,
                                    'client_name' => $clientRow['business_name'] ?? ('Cliente ' . $clientCode),
                                    'phone' => $candidatePhone ?: ($clientRow['phone'] ?? ''),
                                    'total_amount' => 0.0,
                                    'total_units' => 0,
                                    'status' => 'delivered',
                                    'delivery_date' => $fecha ?: null,
                                    'created_at' => $rs['fecha_alta'] ?? $fecha,
                                    'notes' => $remision !== '' ? ("Venta real entregada · Remisión #" . $remision) : "Venta real entregada en ruta (ventas_por_sku)",
                                    'source' => 'ventas_por_sku',
                                    'is_shop_registered' => ($shopUser && intval($shopUser['is_active']) === 1),
                                    'items' => []
                                ];
                            }

                            $groupedSales[$groupKey]['total_amount'] = round($groupedSales[$groupKey]['total_amount'] + $amount, 2);
                            $groupedSales[$groupKey]['total_units'] += $qty;
                            $groupedSales[$groupKey]['items'][] = [
                                'sku' => $skuCode,
                                'product_name' => $prodName,
                                'quantity' => $qty,
                                'unit_price' => $unitPrice,
                                'subtotal' => round($amount, 2)
                            ];
                        }

                        $deliveredSales = array_values($groupedSales);
                    }
                } catch (Exception $e) {}
            }

            sendJSON([
                'success' => true,
                'client' => $clientRow,
                'shop_account' => [
                    'registered' => ($shopUser !== null),
                    'is_active' => ($shopUser && intval($shopUser['is_active']) === 1),
                    'user' => $shopUser,
                    'points_balance' => $pointsBalance,
                    'points_transactions' => $pointsHistory,
                    'redemptions' => $redemptions
                ],
                'whatsapp' => [
                    'active_phone' => $candidatePhone,
                    'session' => $waSession,
                    'bot_stage' => $waSession['stage'] ?? 'IDLE',
                    'in_free_24h_window' => $inFreeWindow,
                    'verifications' => $verifications,
                    'recent_logs' => $waLogs
                ],
                'support_chat' => $supportMessages,
                'orders' => $orders,
                'delivered_sales' => $deliveredSales,
                'whatsapp_usage' => getWhatsAppUsageSummary($pdo)
            ]);
        } catch (Exception $e) {
            sendJSON(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    // =========================================================================
    // MODO 2: BUSCADOR DE CLIENTES + COLA DE SOLICITUDES DE ASESOR (?q=...)
    // =========================================================================
    try {
        $params = [];
        $where = "1=1";
        if ($search !== '') {
            $like = '%' . $search . '%';
            $where = "(c.client_code LIKE ? OR c.business_name LIKE ? OR c.contact LIKE ? OR c.phone LIKE ? OR c.sales_route LIKE ? OR s.phone_number LIKE ?)";
            $params = [$like, $like, $like, $like, $like, $like];
        }

        $sql = "
            SELECT 
                c.client_code,
                c.business_name,
                c.contact,
                c.phone,
                c.sales_route,
                c.zona_comercial,
                c.gec,
                c.visit_days,
                c.address,
                u.id AS shop_user_id,
                u.is_active AS shop_is_active,
                u.last_login AS shop_last_login,
                COALESCE(p.points_balance, 0) AS points_balance,
                s.phone_number AS wa_session_phone,
                s.stage AS bot_stage,
                s.last_interaction AS wa_last_interaction
            FROM clients c
            LEFT JOIN shop_client_users u ON u.client_code = c.client_code
            LEFT JOIN shop_client_points p ON p.client_code = c.client_code
            LEFT JOIN shop_whatsapp_sessions s ON s.client_code = c.client_code
            WHERE $where
            ORDER BY (s.stage = 'HUMAN') DESC, s.last_interaction DESC, c.business_name ASC
            LIMIT 45
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $clients = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Cola de clientes que solicitaron hablar con un asesor o tienen mensajes sin leer
        $advisorQueue = [];
        try {
            $qStmt = $pdo->query("
                SELECT 
                    m.client_code,
                    MAX(m.created_at) AS last_activity,
                    SUM(CASE WHEN m.sender_type = 'client' AND m.is_read = 0 THEN 1 ELSE 0 END) AS unread_count,
                    (SELECT message FROM shop_support_messages WHERE client_code = m.client_code ORDER BY id DESC LIMIT 1) AS last_message
                FROM shop_support_messages m
                GROUP BY m.client_code
                HAVING unread_count > 0
                ORDER BY unread_count DESC, last_activity DESC
                LIMIT 25
            ");
            $rawQueue = $qStmt->fetchAll(PDO::FETCH_ASSOC);
            $seenCodes = [];

            foreach ($rawQueue as $rq) {
                $code = $rq['client_code'];
                if (strpos($code, 'WA-') === 0) {
                    $resolvedFromMsg = resolveClientCodeByPhone($pdo, substr($code, 3));
                    if ($resolvedFromMsg !== null) {
                        $code = $resolvedFromMsg;
                    }
                }
                $seenCodes[$code] = true;
                if (!isset($advisorQueue[$code])) {
                    $advisorQueue[$code] = [
                        'client_code' => $code,
                        'business_name' => 'Cliente ' . $code,
                        'phone' => '',
                        'sales_route' => '',
                        'unread_count' => intval($rq['unread_count']),
                        'last_message' => $rq['last_message'],
                        'last_activity' => $rq['last_activity'],
                        'bot_stage' => 'IDLE'
                    ];
                } else {
                    $advisorQueue[$code]['unread_count'] += intval($rq['unread_count']);
                }
            }

            $hStmt = $pdo->query("
                SELECT phone_number, client_code, business_name, stage, last_interaction
                FROM shop_whatsapp_sessions
                WHERE stage = 'HUMAN'
                ORDER BY last_interaction DESC
                LIMIT 25
            ");
            while ($hRow = $hStmt->fetch(PDO::FETCH_ASSOC)) {
                $cleanP = preg_replace('/[^0-9]/', '', (string)$hRow['phone_number']);
                $code = !empty($hRow['client_code']) ? trim((string)$hRow['client_code']) : '';
                if ($code === '' && strlen($cleanP) >= 10) {
                    $resolvedH = resolveClientCodeByPhone($pdo, $cleanP);
                    if ($resolvedH !== null) {
                        $code = $resolvedH;
                        // Auto-reparar sesión en shop_whatsapp_sessions
                        try {
                            $pdo->prepare("UPDATE shop_whatsapp_sessions SET client_code = ? WHERE RIGHT(phone_number, 10) = ? AND (client_code IS NULL OR client_code = '')")
                                ->execute([$code, substr($cleanP, -10)]);
                        } catch (Exception $e) {}
                    }
                }
                if ($code === '') {
                    $code = 'WA-' . $cleanP;
                }
                if (!isset($advisorQueue[$code])) {
                    $advisorQueue[$code] = [
                        'client_code' => $code,
                        'business_name' => !empty($hRow['business_name']) ? $hRow['business_name'] : ('WhatsApp +' . $cleanP),
                        'phone' => $cleanP,
                        'sales_route' => '',
                        'unread_count' => 1,
                        'last_message' => '🙋‍♂️ Solicita hablar con un asesor en WhatsApp',
                        'last_activity' => $hRow['last_interaction'],
                        'bot_stage' => 'HUMAN'
                    ];
                } else {
                    $advisorQueue[$code]['bot_stage'] = 'HUMAN';
                    $advisorQueue[$code]['phone'] = $cleanP;
                }
            }

            foreach ($advisorQueue as $code => &$aq) {
                if (strpos($code, 'WA-') !== 0) {
                    $cStmt = $pdo->prepare("SELECT business_name, contact, phone, sales_route FROM clients WHERE client_code = ? LIMIT 1");
                    $cStmt->execute([$code]);
                    $cRow = $cStmt->fetch(PDO::FETCH_ASSOC);
                    if ($cRow) {
                        $aq['business_name'] = $cRow['business_name'] ?: ($cRow['contact'] ?: ('Cliente ' . $code));
                        $aq['sales_route'] = $cRow['sales_route'] ?? '';
                        if (empty($aq['phone']) && !empty($cRow['phone'])) {
                            $aq['phone'] = $cRow['phone'];
                        }
                    }
                }
            }
            unset($aq);
        } catch (Exception $e) {}

        sendJSON([
            'success' => true,
            'clients' => $clients,
            'advisor_queue' => array_values($advisorQueue),
            'whatsapp_usage' => getWhatsAppUsageSummary($pdo)
        ]);
    } catch (Exception $e) {
        sendJSON(['success' => false, 'error' => $e->getMessage()], 500);
    }
}

// =========================================================================
// ACCIONES POST DESDE EL PANEL 360° (Contraseña, Teléfono, Datos, Estatus)
// =========================================================================
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $action = strtoupper(trim((string)($input['action'] ?? '')));
    $clientCode = trim((string)($input['client_code'] ?? ''));

    if ($clientCode === '' && $action !== 'SET_WHATSAPP_LIMITS') {
        sendJSON(['success' => false, 'error' => 'Se requiere el código de cliente (client_code).'], 400);
    }

    try {
        // 1. CAMBIAR O CREAR CONTRASEÑA DE UM6 SHOP
        if ($action === 'CHANGE_PASSWORD') {
            $newPassword = trim((string)($input['password'] ?? ''));
            $mustChange = isset($input['must_change_password']) ? (intval($input['must_change_password']) ? 1 : 0) : 0;

            if (strlen($newPassword) < 4) {
                sendJSON(['success' => false, 'error' => 'La contraseña debe tener al menos 4 caracteres.'], 400);
            }

            $hash = password_hash($newPassword, PASSWORD_DEFAULT);

            $stmtCheck = $pdo->prepare("SELECT id, phone FROM shop_client_users WHERE client_code = ? LIMIT 1");
            $stmtCheck->execute([$clientCode]);
            $existing = $stmtCheck->fetch(PDO::FETCH_ASSOC);

            if ($existing) {
                $stmtUpd = $pdo->prepare("
                    UPDATE shop_client_users
                    SET password_hash = ?, is_active = 1, must_change_password = ?
                    WHERE client_code = ?
                ");
                $stmtUpd->execute([$hash, $mustChange, $clientCode]);
            } else {
                // Obtener teléfono del cliente en tabla clients
                $stmtC = $pdo->prepare("SELECT phone FROM clients WHERE client_code = ? LIMIT 1");
                $stmtC->execute([$clientCode]);
                $clientPhone = $stmtC->fetchColumn() ?: null;

                $stmtIns = $pdo->prepare("
                    INSERT INTO shop_client_users (client_code, password_hash, phone, is_active, must_change_password)
                    VALUES (?, ?, ?, 1, ?)
                ");
                $stmtIns->execute([$clientCode, $hash, $clientPhone, $mustChange]);

                $newId = intval($pdo->lastInsertId());
                if ($newId <= 0) {
                    $maxId = intval($pdo->query("SELECT COALESCE(MAX(id), 0) + 1 FROM shop_client_users WHERE client_code != " . $pdo->quote($clientCode))->fetchColumn());
                    if ($maxId <= 0) $maxId = 1;
                    $pdo->prepare("UPDATE shop_client_users SET id = ? WHERE client_code = ? AND (id <= 0 OR id IS NULL)")->execute([$maxId, $clientCode]);
                }
            }

            sendJSON([
                'success' => true,
                'message' => "Contraseña de UM6 SHOP actualizada y cuenta activada para el cliente {$clientCode}.",
                'client_code' => $clientCode,
                'password' => $newPassword
            ]);
        }

        // 2. ACTIVAR / DESACTIVAR CUENTA EN UM6 SHOP
        if ($action === 'TOGGLE_SHOP_ACTIVE') {
            $isActive = !empty($input['is_active']) ? 1 : 0;
            $stmtCheck = $pdo->prepare("SELECT id FROM shop_client_users WHERE client_code = ? LIMIT 1");
            $stmtCheck->execute([$clientCode]);
            if (!$stmtCheck->fetch()) {
                $defaultPass = 'CF' . $clientCode;
                $hash = password_hash($defaultPass, PASSWORD_DEFAULT);
                $pdo->prepare("INSERT INTO shop_client_users (client_code, password_hash, is_active, must_change_password) VALUES (?, ?, ?, 0)")
                    ->execute([$clientCode, $hash, $isActive]);
            } else {
                $pdo->prepare("UPDATE shop_client_users SET is_active = ? WHERE client_code = ?")
                    ->execute([$isActive, $clientCode]);
            }

            sendJSON([
                'success' => true,
                'message' => $isActive
                    ? "Cuenta UM6 SHOP activada para {$clientCode} (ya acumula puntos)."
                    : "Cuenta UM6 SHOP desactivada para {$clientCode}."
            ]);
        }

        // 3. VINCULAR O CAMBIAR NÚMERO DE TELÉFONO / WHATSAPP
        if ($action === 'LINK_PHONE') {
            $rawPhone = preg_replace('/[^0-9]/', '', (string)($input['phone_number'] ?? ''));
            $notifyClient = !empty($input['notify_client']);

            if (strlen($rawPhone) < 10) {
                sendJSON(['success' => false, 'error' => 'Ingresa un número de teléfono válido de 10 dígitos.'], 400);
            }

            $phone10 = substr($rawPhone, -10);
            $waPhone = strlen($rawPhone) === 10 ? '521' . $rawPhone : $rawPhone;

            $stmtC = $pdo->prepare("SELECT business_name, contact, phone, sales_route FROM clients WHERE client_code = ? LIMIT 1");
            $stmtC->execute([$clientCode]);
            $clientRow = $stmtC->fetch(PDO::FETCH_ASSOC);
            $businessName = $clientRow['business_name'] ?? ('Cliente ' . $clientCode);
            $oldPhone = $clientRow['phone'] ?? null;

            // Actualizar en clients y shop_client_users
            $pdo->prepare("UPDATE clients SET phone = ? WHERE client_code = ?")->execute([$phone10, $clientCode]);
            try {
                $pdo->prepare("UPDATE shop_client_users SET phone = ? WHERE client_code = ?")->execute([$phone10, $clientCode]);
            } catch (Exception $e) {}

            // Limpiar sesiones previas de este cliente con otro número
            $pdo->prepare("
                UPDATE shop_whatsapp_sessions
                SET client_code = NULL, business_name = NULL, stage = 'IDLE', cart_json = NULL
                WHERE client_code = ? AND RIGHT(phone_number, 10) != ?
            ")->execute([$clientCode, $phone10]);

            // Crear o actualizar sesión en shop_whatsapp_sessions
            $stmtCheckS = $pdo->prepare("SELECT phone_number FROM shop_whatsapp_sessions WHERE RIGHT(phone_number, 10) = ? LIMIT 1");
            $stmtCheckS->execute([$phone10]);
            $existingSessionPhone = $stmtCheckS->fetchColumn();
            $sessionPhoneKey = $existingSessionPhone ?: $waPhone;

            $pdo->prepare("
                INSERT INTO shop_whatsapp_sessions (phone_number, client_code, business_name, stage, cart_json)
                VALUES (?, ?, ?, 'IDLE', NULL)
                ON DUPLICATE KEY UPDATE client_code = VALUES(client_code), business_name = VALUES(business_name), stage = 'IDLE', cart_json = NULL
            ")->execute([$sessionPhoneKey, $clientCode, $businessName]);

            // Registrar en shop_whatsapp_verifications
            $pdo->prepare("
                UPDATE shop_whatsapp_verifications
                SET status = 'UNLINKED', reviewed_by = 'Televenta 360', notes = 'Reemplazado por nuevo número', reviewed_at = NOW()
                WHERE client_code = ? AND status IN ('APPROVED', 'PENDING')
            ")->execute([$clientCode]);

            $pdo->prepare("
                INSERT INTO shop_whatsapp_verifications
                (phone_number, client_code, business_name, contact_name, current_client_phone, sales_route, requested_message, status, reviewed_by, notes, reviewed_at)
                VALUES (?, ?, ?, ?, ?, ?, 'Vinculación desde Centro de Ayuda 360°', 'APPROVED', 'Televenta 360', 'Teléfono actualizado por Televenta', NOW())
            ")->execute([
                $sessionPhoneKey,
                $clientCode,
                $businessName,
                $clientRow['contact'] ?? '',
                $oldPhone,
                $clientRow['sales_route'] ?? ''
            ]);

            if (class_exists('WhatsAppHandoff')) {
                WhatsAppHandoff::migrateSupportChat($pdo, $sessionPhoneKey, $clientCode);
            }

            $waSent = false;
            if ($notifyClient && class_exists('WhatsAppSender')) {
                $resWa = WhatsAppSender::sendText(
                    $sessionPhoneKey,
                    "🎉 *¡NÚMERO VINCULADO CON ÉXITO!*\n\n"
                    . "El equipo de *Televenta de Cervezas Finas* ha vinculado este número para tu negocio *{$businessName}* (Código `{$clientCode}`).\n\n"
                    . "Ya puedes levantar tus pedidos por *cajas* escribiendo directamente aquí."
                );
                $waSent = !empty($resWa['success']);
            }

            sendJSON([
                'success' => true,
                'whatsapp_sent' => $waSent,
                'message' => "Teléfono {$phone10} vinculado oficialmente al cliente {$businessName} ({$clientCode})."
            ]);
        }

        // 4. DESVINCULAR NÚMERO DE TELÉFONO / WHATSAPP
        if ($action === 'UNLINK_PHONE') {
            $pdo->prepare("UPDATE clients SET phone = NULL WHERE client_code = ?")->execute([$clientCode]);
            try {
                $pdo->prepare("UPDATE shop_client_users SET phone = NULL WHERE client_code = ?")->execute([$clientCode]);
            } catch (Exception $e) {}

            $pdo->prepare("
                UPDATE shop_whatsapp_sessions
                SET client_code = NULL, business_name = NULL, stage = 'IDLE', cart_json = NULL
                WHERE client_code = ?
            ")->execute([$clientCode]);

            $pdo->prepare("
                UPDATE shop_whatsapp_verifications
                SET status = 'UNLINKED', reviewed_by = 'Televenta 360', notes = 'Desvinculado desde Centro de Ayuda 360°', reviewed_at = NOW()
                WHERE client_code = ? AND status IN ('APPROVED', 'PENDING')
            ")->execute([$clientCode]);

            sendJSON([
                'success' => true,
                'message' => "El teléfono ha sido desvinculado del cliente {$clientCode}."
            ]);
        }

        // 0. GUARDAR HORARIO DE ATENCIÓN DE TELEVENTA Y LÍMITES DE WHATSAPP
        if ($action === 'SET_WHATSAPP_LIMITS') {
            $stmtSet = $pdo->prepare("
                INSERT INTO shop_whatsapp_settings (setting_key, setting_value)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
            ");
            if (isset($input['pause_outbound'])) {
                $stmtSet->execute(['pause_outbound', !empty($input['pause_outbound']) ? '1' : '0']);
            }
            if (isset($input['only_24h_free_window'])) {
                $stmtSet->execute(['only_24h_free_window', !empty($input['only_24h_free_window']) ? '1' : '0']);
            }
            if (isset($input['daily_per_phone_limit'])) {
                $stmtSet->execute(['daily_per_phone_limit', (string)max(5, intval($input['daily_per_phone_limit']))]);
            }
            if (isset($input['daily_global_limit'])) {
                $stmtSet->execute(['daily_global_limit', (string)max(20, intval($input['daily_global_limit']))]);
            }
            if (isset($input['televenta_schedule_days'])) {
                $stmtSet->execute(['televenta_schedule_days', trim((string)$input['televenta_schedule_days']) ?: 'Lunes a Sábado']);
            }
            if (isset($input['televenta_hours_start'])) {
                $stmtSet->execute(['televenta_hours_start', trim((string)$input['televenta_hours_start']) ?: '08:00']);
            }
            if (isset($input['televenta_hours_end'])) {
                $stmtSet->execute(['televenta_hours_end', trim((string)$input['televenta_hours_end']) ?: '18:00']);
            }
            if (isset($input['bot_training_rules'])) {
                $stmtSet->execute(['bot_training_rules', trim((string)$input['bot_training_rules'])]);
            }

            sendJSON([
                'success' => true,
                'message' => 'Horario de atención de Televenta y configuración de WhatsApp actualizados.',
                'whatsapp_usage' => getWhatsAppUsageSummary($pdo)
            ]);
        }

        // 5. ACTUALIZAR DATOS GENERALES DEL CLIENTE (ESPECIFICANDO DÍA DE VISITA DE VENTA Y DÍA DE REPARTO)
        if ($action === 'UPDATE_CLIENT') {
            $businessName = trim((string)($input['business_name'] ?? ''));
            $contact = trim((string)($input['contact'] ?? ''));
            $address = trim((string)($input['address'] ?? ''));
            $visitDays = trim((string)($input['visit_days'] ?? ''));
            $deliveryDays = isset($input['delivery_days'])
                ? trim((string)$input['delivery_days'])
                : calculateNextDayDelivery($visitDays);
            if ($deliveryDays === '' && $visitDays !== '') {
                $deliveryDays = calculateNextDayDelivery($visitDays);
            }

            $pdo->prepare("
                UPDATE clients
                SET business_name = COALESCE(NULLIF(?, ''), business_name),
                    contact = ?,
                    address = ?,
                    visit_days = ?,
                    delivery_days = ?
                WHERE client_code = ?
            ")->execute([$businessName, $contact, $address, $visitDays, $deliveryDays, $clientCode]);

            sendJSON([
                'success' => true,
                'visit_days' => $visitDays,
                'delivery_days' => $deliveryDays,
                'message' => "Datos del cliente {$clientCode} actualizados (Visita Venta: {$visitDays} · Reparto: {$deliveryDays})."
            ]);
        }

        // 6. CERRAR / FINALIZAR SOLICITUD DE HABLAR CON ASESOR
        if ($action === 'CLOSE_ADVISOR_REQUEST') {
            try {
                $pdo->prepare("
                    UPDATE shop_support_messages
                    SET is_read = 1
                    WHERE client_code = ? AND sender_type = 'client' AND is_read = 0
                ")->execute([$clientCode]);
            } catch (Exception $e) {}

            try {
                if (strpos($clientCode, 'WA-') === 0) {
                    $cleanPhone = preg_replace('/[^0-9]/', '', substr($clientCode, 3));
                    if (strlen($cleanPhone) >= 10) {
                        $phone10 = substr($cleanPhone, -10);
                        $pdo->prepare("
                            UPDATE shop_whatsapp_sessions
                            SET stage = 'IDLE'
                            WHERE RIGHT(phone_number, 10) = ? AND stage = 'HUMAN'
                        ")->execute([$phone10]);
                    }
                } else {
                    $pdo->prepare("
                        UPDATE shop_whatsapp_sessions
                        SET stage = 'IDLE'
                        WHERE client_code = ? AND stage = 'HUMAN'
                    ")->execute([$clientCode]);
                }
            } catch (Exception $e) {}

            sendJSON([
                'success' => true,
                'client_code' => $clientCode,
                'message' => "Solicitud de asesor cerrada correctamente para {$clientCode}."
            ]);
        }

        sendJSON(['success' => false, 'error' => 'Acción no reconocida: ' . $action], 400);

    } catch (Exception $e) {
        sendJSON(['success' => false, 'error' => $e->getMessage()], 500);
    }
}
?>