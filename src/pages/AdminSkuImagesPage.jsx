import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { supabase } from '../supabaseClient';
import { getProductImageUrl, PRODUCT_IMAGES } from '@/lib/imageCatalog';
import * as XLSX from 'xlsx';
import ZonasRutasCatalogDialog from '@/components/admin/users/ZonasRutasCatalogDialog';
import { 
  RefreshCw, 
  Search, 
  Filter, 
  MapPin, 
  Map as MapIcon,
  Download,
  Check, 
  X, 
  Upload, 
  Plus, 
  CheckSquare, 
  Square, 
  Store, 
  Globe, 
  Layers, 
  SlidersHorizontal,
  Package,
  AlertCircle
} from 'lucide-react';

export default function AdminSkuImagesPage() {
  const [skuData, setSkuData] = useState([]);
  const [shopProducts, setShopProducts] = useState([]);
  const [availableZones, setAvailableZones] = useState([]);
  const [zonesRoutesMap, setZonesRoutesMap] = useState({});
  const [serverPortafolioSkus, setServerPortafolioSkus] = useState({});
  const [missingPhotoSkus, setMissingPhotoSkus] = useState({});
  const [isZonasCatalogOpen, setIsZonasCatalogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'in_shop', 'not_in_shop', 'restricted', 'unrestricted'
  const [filterZone, setFilterZone] = useState('all'); // 'all' or specific zone name
  
  // Selección por lote
  const [selectedSkus, setSelectedSkus] = useState([]);

  // Modal de restricción de zonas
  const [zoneModalItem, setZoneModalItem] = useState(null); // SKU individual o array para lote
  const [modalSelectedZones, setModalSelectedZones] = useState([]);
  const [modalAllZones, setModalAllZones] = useState(true);
  const [savingZones, setSavingZones] = useState(false);

  // Formulario nuevo SKU
  const [editSku, setEditSku] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editImageFile, setEditImageFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [cacheBuster, setCacheBuster] = useState(Date.now());
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg, isError = false) => {
    setToastMessage({ text: msg, isError });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // 1. Cargar datos maestros: Supabase sku_descripcion + MySQL shop_products + Zonas
  const loadAllData = async () => {
    setLoading(true);
    try {
      // A. Cargar SKUs oficiales de Supabase
      const { data: skuMaster, error: skuErr } = await supabase
        .from('sku_descripcion')
        .select('cve_marca, descripcion')
        .order('cve_marca');

      if (skuErr) {
        console.error("Error al cargar sku_descripcion:", skuErr);
      }
      setSkuData(skuMaster || []);

      // B. Cargar catálogo de shop_products y zonas desde backend + zonas_rutas oficial de Supabase
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      // Obtener lista de productos de la tienda
      try {
        const resProd = await fetch('https://cervezasfinas.com/api/shop/admin/products-manage.php', { headers });
        if (resProd.ok) {
          const jsonProd = await resProd.json();
          if (jsonProd.success && Array.isArray(jsonProd.data)) {
            setShopProducts(jsonProd.data);
          }
          if (jsonProd.portafolio_skus && typeof jsonProd.portafolio_skus === 'object') {
            setServerPortafolioSkus(jsonProd.portafolio_skus);
          }
        }
      } catch (e) {
        console.warn("No se pudo cargar shop_products del backend:", e);
      }

      // Obtener zonas comerciales oficiales desde `zonas_rutas` de Supabase (misma fuente que app principal)
      try {
        let zrRows = [];
        const { data: zrData, error: zrErr } = await supabase
          .from('zonas_rutas')
          .select('id, zona, ruta, tipo_ruta')
          .order('zona', { ascending: true });

        if (!zrErr && Array.isArray(zrData)) {
          zrRows = zrData;
        } else {
          const { data: fbData } = await supabase
            .from('zonas_rutas')
            .select('id, zona, ruta')
            .order('zona', { ascending: true });
          if (Array.isArray(fbData)) zrRows = fbData;
        }

        const zSet = new Set();
        const rMap = {};
        zrRows.forEach(r => {
          const zName = String(r.zona || '').trim().toUpperCase();
          const rName = String(r.ruta || '').trim().toUpperCase();
          if (zName) {
            zSet.add(zName);
            if (!rMap[zName]) rMap[zName] = [];
            if (rName && !rMap[zName].includes(rName)) rMap[zName].push(rName);
          }
        });

        try {
          const resZones = await fetch('https://cervezasfinas.com/api/shop/admin/products-manage.php?action=zones', { headers });
          if (resZones.ok) {
            const jsonZones = await resZones.json();
            if (jsonZones.success && Array.isArray(jsonZones.data)) {
              jsonZones.data.forEach(z => {
                const clean = String(z || '').trim().toUpperCase();
                if (clean) zSet.add(clean);
              });
            }
          }
        } catch (_) {}

        if (zSet.size > 0) {
          setAvailableZones(Array.from(zSet).sort((a, b) => a.localeCompare(b, 'es')));
          setZonesRoutesMap(rMap);
        }
      } catch (e) {
        console.warn("No se pudo cargar lista de zonas:", e);
      }

    } catch (err) {
      console.error("Error global al cargar datos:", err);
      showToast("Error al cargar datos del catálogo: " + err.message, true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Mapa rápido de shop_products indexado por SKU en mayúsculas
  const shopProductsMap = useMemo(() => {
    const map = new Map();
    shopProducts.forEach(p => {
      if (p.sku) {
        map.set(String(p.sku).trim().toUpperCase(), p);
      }
    });
    return map;
  }, [shopProducts]);

  // Lista combinada de productos para la tabla
  const combinedList = useMemo(() => {
    // Tomar todos los de sku_descripcion y cruzarlos con shop_products
    const list = skuData.map(item => {
      const skuClean = String(item.cve_marca).trim().toUpperCase();
      const shopItem = shopProductsMap.get(skuClean);
      
      const allowedZonesStr = shopItem?.allowed_zones || '';
      const isUnrestricted = !allowedZonesStr || allowedZonesStr === '' || allowedZonesStr.toUpperCase() === 'TODAS' || allowedZonesStr.toUpperCase() === 'ALL';
      const zonesList = isUnrestricted 
        ? [] 
        : allowedZonesStr.split(',').map(z => z.trim().toUpperCase()).filter(Boolean);

      return {
        sku: item.cve_marca,
        description: item.descripcion || shopItem?.name || 'Sin descripción',
        inShop: !!shopItem,
        isActiveInShop: shopItem ? shopItem.is_active == 1 : false,
        shopId: shopItem?.id || null,
        basePrice: shopItem?.base_price ?? null,
        category: shopItem?.category || 'Cerveza',
        allowedZonesStr,
        isUnrestricted,
        zonesList,
        rawShopItem: shopItem
      };
    });

    // Agregar también productos que estén en shop_products pero no en sku_descripcion
    const skuMasterSet = new Set(skuData.map(s => String(s.cve_marca).trim().toUpperCase()));
    shopProducts.forEach(sp => {
      const spSkuUpper = String(sp.sku).trim().toUpperCase();
      if (!skuMasterSet.has(spSkuUpper)) {
        const allowedZonesStr = sp.allowed_zones || '';
        const isUnrestricted = !allowedZonesStr || allowedZonesStr === '' || allowedZonesStr.toUpperCase() === 'TODAS' || allowedZonesStr.toUpperCase() === 'ALL';
        const zonesList = isUnrestricted 
          ? [] 
          : allowedZonesStr.split(',').map(z => z.trim().toUpperCase()).filter(Boolean);

        list.push({
          sku: sp.sku,
          description: sp.name || 'Sin descripción',
          inShop: true,
          isActiveInShop: sp.is_active == 1,
          shopId: sp.id,
          basePrice: sp.base_price,
          category: sp.category || 'Cerveza',
          allowedZonesStr,
          isUnrestricted,
          zonesList,
          rawShopItem: sp
        });
      }
    });

    return list;
  }, [skuData, shopProductsMap, shopProducts]);

  // Filtrado de la lista combinada
  const filteredList = useMemo(() => {
    return combinedList.filter(item => {
      // 1. Buscador
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const matchesSku = String(item.sku).toLowerCase().includes(s);
        const matchesDesc = String(item.description).toLowerCase().includes(s);
        if (!matchesSku && !matchesDesc) return false;
      }

      // 2. Filtro de estado
      if (filterStatus === 'in_shop' && !item.inShop) return false;
      if (filterStatus === 'not_in_shop' && item.inShop) return false;
      if (filterStatus === 'restricted' && item.isUnrestricted) return false;
      if (filterStatus === 'unrestricted' && !item.isUnrestricted) return false;

      // 3. Filtro de zona específica
      if (filterZone !== 'all') {
        const fz = filterZone.toUpperCase();
        // Si el producto está restringido, debe incluir esta zona
        // Si no está restringido (isUnrestricted), está disponible en todas las zonas
        if (!item.isUnrestricted && !item.zonesList.includes(fz)) {
          return false;
        }
      }

      return true;
    });
  }, [combinedList, searchTerm, filterStatus, filterZone]);

  // Contadores y estadísticas para el dashboard
  const stats = useMemo(() => {
    const total = combinedList.length;
    const inShopCount = combinedList.filter(x => x.inShop).length;
    const restrictedCount = combinedList.filter(x => x.inShop && !x.isUnrestricted).length;
    const unrestrictedCount = combinedList.filter(x => x.inShop && x.isUnrestricted).length;
    return { total, inShopCount, restrictedCount, unrestrictedCount };
  }, [combinedList]);

  // 2. Acción: Sincronizar todos los SKUs de sku_descripcion con shop_products (con fallback automático FormData)
  const handleSyncAllToShop = async () => {
    if (skuData.length === 0) {
      showToast("No hay SKUs disponibles para sincronizar", true);
      return;
    }

    if (!window.confirm(`¿Deseas vincular y sincronizar los ${skuData.length} SKUs maestros con el catálogo de productos de la tienda? Se crearán en la tienda los que falten con su imagen oficial.`)) {
      return;
    }

    setSyncing(true);
    setSyncProgress('Iniciando...');
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};

      let bulkDone = false;
      try {
        const res = await fetch('https://cervezasfinas.com/api/shop/admin/products-manage.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders
          },
          body: JSON.stringify({
            action: 'sync_skus',
            items: skuData
          })
        });
        const result = await res.json();
        if (res.ok && result && result.success) {
          bulkDone = true;
          showToast(result.message || 'Catálogo vinculado exitosamente');
        }
      } catch (_) {}

      // Fallback automático si el servidor aún tiene el PHP anterior
      if (!bulkDone) {
        const toCreate = [];
        const toUpdate = [];
        skuData.forEach(item => {
          const skuCode = String(item.cve_marca || '').trim();
          const desc = String(item.descripcion || '').trim();
          if (!skuCode) return;
          const existing = shopProductsMap.get(skuCode.toUpperCase());
          if (!existing) {
            toCreate.push({ sku: skuCode, name: desc || `SKU ${skuCode}` });
          } else if ((!existing.name || existing.name === existing.sku) && desc) {
            toUpdate.push({ ...existing, name: desc, description: desc });
          }
        });

        let createdCount = 0;
        let updatedCount = 0;
        const batchSize = 8;

        for (let i = 0; i < toCreate.length; i += batchSize) {
          const batch = toCreate.slice(i, i + batchSize);
          setSyncProgress(`${Math.min(i + batchSize, toCreate.length)}/${toCreate.length}`);
          await Promise.all(batch.map(async (prod) => {
            const fd = new FormData();
            fd.append('action', 'create');
            fd.append('sku', prod.sku);
            fd.append('name', prod.name);
            fd.append('description', prod.name);
            fd.append('base_price', '0');
            fd.append('category', 'Cerveza');
            fd.append('current_image_url', `portafolio/${prod.sku}.png`);
            fd.append('is_active', '1');
            const r = await fetch('https://cervezasfinas.com/api/shop/admin/products-manage.php', {
              method: 'POST',
              headers: authHeaders,
              body: fd
            }).then(resp => resp.json()).catch(() => null);
            if (r && r.success) createdCount++;
          }));
        }

        for (let i = 0; i < toUpdate.length; i += batchSize) {
          const batch = toUpdate.slice(i, i + batchSize);
          await Promise.all(batch.map(async (prod) => {
            const fd = new FormData();
            fd.append('action', 'update');
            fd.append('id', prod.id);
            fd.append('sku', prod.sku);
            fd.append('name', prod.name);
            fd.append('description', prod.description || prod.name);
            fd.append('base_price', prod.base_price || '0');
            fd.append('category', prod.category || 'Cerveza');
            fd.append('current_image_url', prod.image_url || `portafolio/${prod.sku}.png`);
            fd.append('is_active', String(prod.is_active ?? 1));
            const r = await fetch('https://cervezasfinas.com/api/shop/admin/products-manage.php', {
              method: 'POST',
              headers: authHeaders,
              body: fd
            }).then(resp => resp.json()).catch(() => null);
            if (r && r.success) updatedCount++;
          }));
        }

        showToast(`¡Catálogo sincronizado! ${createdCount} nuevos SKUs pasados al Catálogo Shop y ${updatedCount} actualizados.`);
      }

      await loadAllData();
    } catch (err) {
      showToast('Error en la sincronización: ' + err.message, true);
    } finally {
      setSyncing(false);
      setSyncProgress('');
    }
  };

  // 2b. Descargar Excel Comparativo (Cuáles ya están en Catálogo Shop, cuáles no, y a cuáles les falta foto)
  const handleDownloadComparisonExcel = async () => {
    setDownloadingExcel(true);
    try {
      const masterMap = new window.Map();
      skuData.forEach(m => {
        const k = String(m.cve_marca || '').trim().toUpperCase();
        if (k) masterMap.set(k, m);
      });

      const allSkuKeys = Array.from(new Set([...masterMap.keys(), ...shopProductsMap.keys()])).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      );

      const checkImageExistsLive = (skuKey) => new Promise((resolve) => {
        if (missingPhotoSkus[skuKey]) return resolve(false);
        if (PRODUCT_IMAGES && (PRODUCT_IMAGES[skuKey] || PRODUCT_IMAGES[skuKey.toLowerCase()])) {
          return resolve(true);
        }
        if (serverPortafolioSkus && serverPortafolioSkus[skuKey]) {
          return resolve(true);
        }
        const sp = shopProductsMap.get(skuKey);
        if (sp && sp.image_url && !sp.image_url.includes('portafolio/')) {
          return resolve(true);
        }
        try {
          const img = typeof document !== 'undefined' ? document.createElement('img') : new window.Image();
          const timer = setTimeout(() => resolve(false), 2500);
          img.onload = () => { clearTimeout(timer); resolve(true); };
          img.onerror = () => { clearTimeout(timer); resolve(false); };
          img.src = `https://cervezasfinas.com/portafolio/${encodeURIComponent(skuKey)}.png`;
        } catch (_) {
          resolve(false);
        }
      });

      const photoStatusMap = new window.Map();
      const batchSize = 15;
      for (let i = 0; i < allSkuKeys.length; i += batchSize) {
        const slice = allSkuKeys.slice(i, i + batchSize);
        const results = await Promise.all(slice.map(k => checkImageExistsLive(k)));
        slice.forEach((k, idx) => photoStatusMap.set(k, results[idx]));
      }

      const fullRows = allSkuKeys.map(skuKey => {
        const mItem = masterMap.get(skuKey);
        const sItem = shopProductsMap.get(skuKey);
        const inMaster = !!mItem;
        const inShop = !!sItem;
        const hasPhoto = !!photoStatusMap.get(skuKey);

        const allowedZones = sItem?.allowed_zones && sItem.allowed_zones.trim() !== '' && sItem.allowed_zones.toUpperCase() !== 'TODAS'
          ? sItem.allowed_zones
          : 'TODAS LAS ZONAS (GLOBAL)';

        let diagnostico = 'COMPLETO (En Catálogo Shop y Con Foto)';
        if (!inShop && !hasPhoto) {
          diagnostico = 'FALTA PASAR AL CATÁLOGO Y FALTA FOTO';
        } else if (!inShop && hasPhoto) {
          diagnostico = 'FALTA PASAR AL CATÁLOGO SHOP';
        } else if (inShop && !hasPhoto) {
          diagnostico = 'YA EN CATÁLOGO PERO LE FALTA FOTO';
        }

        return {
          'Código SKU': mItem?.cve_marca || sItem?.sku || skuKey,
          'Descripción en Fotos SKU': mItem?.descripcion || 'No registrado en Fotos SKU',
          'Nombre en Catálogo Shop': sItem?.name || 'NO ESTÁ EN CATÁLOGO SHOP',
          '¿Ya en Catálogo Shop?': inShop ? 'SÍ' : 'NO',
          '¿Está en Fotos SKUs?': inMaster ? 'SÍ' : 'NO',
          '¿Tiene Foto?': hasPhoto ? 'SÍ TIENE FOTO' : 'FALTA FOTO',
          'Diagnóstico': diagnostico,
          'Estatus en Tienda': inShop ? (sItem.is_active == 1 ? 'ACTIVO' : 'INACTIVO') : 'NO EN TIENDA',
          'Precio Base ($)': inShop ? Number(sItem.base_price || 0) : 0,
          'Categoría': sItem?.category || 'Cerveza',
          'Zonas Permitidas': inShop ? allowedZones : 'Pendiente vincular',
          'Ruta / URL Foto': hasPhoto ? (PRODUCT_IMAGES?.[skuKey] || serverPortafolioSkus?.[skuKey] || `/portafolio/${skuKey}.png`) : 'SIN FOTO'
        };
      });

      const missingInShopRows = fullRows.filter(r => r['¿Ya en Catálogo Shop?'] === 'NO');
      const missingPhotoRows = fullRows.filter(r => r['¿Tiene Foto?'] === 'FALTA FOTO');
      const alreadyInShopRows = fullRows.filter(r => r['¿Ya en Catálogo Shop?'] === 'SÍ');

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fullRows), 'Comparativo Completo');
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(missingInShopRows.length > 0 ? missingInShopRows : [{ 'Mensaje': '¡Todos los SKUs ya están en el Catálogo de la Shop!' }]),
        'Faltan en Catalogo Shop'
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(missingPhotoRows.length > 0 ? missingPhotoRows : [{ 'Mensaje': '¡Todos los SKUs tienen fotografía asignada!' }]),
        'Les Falta Foto'
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(alreadyInShopRows.length > 0 ? alreadyInShopRows : [{ 'Mensaje': 'No hay productos en el Catálogo Shop' }]),
        'Ya en Catalogo Shop'
      );

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Comparativo_SKUs_Catalogo_y_Fotos_${dateStr}.xlsx`);
      showToast('Excel comparativo descargado correctamente');
    } catch (err) {
      console.error('Error generando Excel:', err);
      showToast('Error al generar Excel: ' + err.message, true);
    } finally {
      setDownloadingExcel(false);
    }
  };

  // 3. Acción: Activar / Desactivar producto en la tienda
  const handleToggleShopStatus = async (item) => {
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const newStatus = item.isActiveInShop ? 0 : 1;

      if (!item.inShop) {
        // Crearlo en la tienda
        const res = await fetch('https://cervezasfinas.com/api/shop/admin/products-manage.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            action: 'create',
            sku: item.sku,
            name: item.description,
            description: item.description,
            base_price: 0,
            category: item.category || 'Cerveza',
            is_active: 1,
            allowed_zones: null
          })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Error al agregar a tienda');
        showToast(`SKU ${item.sku} agregado y activado en la tienda`);
      } else {
        // Actualizar estatus activo
        const res = await fetch('https://cervezasfinas.com/api/shop/admin/products-manage.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            action: 'update',
            id: item.shopId,
            sku: item.sku,
            name: item.description,
            description: item.description,
            base_price: item.basePrice || 0,
            category: item.category || 'Cerveza',
            is_active: newStatus,
            allowed_zones: item.allowedZonesStr || null
          })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Error al actualizar estatus');
        showToast(`SKU ${item.sku} ${newStatus ? 'activado' : 'desactivado'} en la tienda`);
      }

      await loadAllData();
    } catch (err) {
      showToast('Error al actualizar: ' + err.message, true);
    }
  };

  // 4. Modal de Restricción de Zonas
  const openZoneModal = (itemOrSkus) => {
    if (Array.isArray(itemOrSkus)) {
      // Edición en lote
      setZoneModalItem(itemOrSkus);
      setModalAllZones(true);
      setModalSelectedZones([]);
    } else {
      // Edición individual
      setZoneModalItem(itemOrSkus);
      if (itemOrSkus.isUnrestricted) {
        setModalAllZones(true);
        setModalSelectedZones([]);
      } else {
        setModalAllZones(false);
        setModalSelectedZones([...itemOrSkus.zonesList]);
      }
    }
  };

  const handleToggleZoneInModal = (zoneName) => {
    const z = zoneName.toUpperCase();
    if (modalSelectedZones.includes(z)) {
      setModalSelectedZones(modalSelectedZones.filter(x => x !== z));
    } else {
      setModalSelectedZones([...modalSelectedZones, z]);
    }
  };

  const handleSaveZones = async () => {
    if (!modalAllZones && modalSelectedZones.length === 0) {
      alert("Por favor selecciona al menos una zona o marca 'Disponible en Todas las Zonas'");
      return;
    }

    setSavingZones(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      
      const targetSkus = Array.isArray(zoneModalItem) 
        ? zoneModalItem 
        : [zoneModalItem.sku];

      const allowedZonesValue = modalAllZones 
        ? null 
        : modalSelectedZones.join(',');

      const res = await fetch('https://cervezasfinas.com/api/shop/admin/products-manage.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'update_zones',
          skus: targetSkus,
          allowed_zones: allowedZonesValue
        })
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Error al guardar zonas');
      }

      showToast(`Restricción de zonas guardada para ${targetSkus.length} producto(s)`);
      setZoneModalItem(null);
      setSelectedSkus([]);
      await loadAllData();
    } catch (err) {
      showToast('Error al guardar zonas: ' + err.message, true);
    } finally {
      setSavingZones(false);
    }
  };

  // 5. Selección masiva de filas
  const handleSelectAllFiltered = (e) => {
    if (e.target.checked) {
      setSelectedSkus(filteredList.map(x => x.sku));
    } else {
      setSelectedSkus([]);
    }
  };

  const handleToggleSelectRow = (sku) => {
    if (selectedSkus.includes(sku)) {
      setSelectedSkus(selectedSkus.filter(s => s !== sku));
    } else {
      setSelectedSkus([...selectedSkus, sku]);
    }
  };

  // 6. Subir Imagen
  async function handleUpload(e, sku) {
    const file = e.target.files[0];
    if (!file || !sku) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sku', sku);

      const res = await fetch('https://cervezasfinas.com/api/upload_portafolio.php', {
        method: 'POST',
        body: formData
      });
      
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Error desconocido al subir');
      }

      showToast('Imagen subida correctamente a portafolio/' + result.filename);
      setCacheBuster(Date.now());
    } catch (err) {
      showToast('Error al subir la imagen: ' + err.message, true);
    } finally {
      setUploading(false);
      e.target.value = null;
    }
  }

  // 7. Agregar nuevo SKU maestro
  async function handleAddSku(e) {
    e.preventDefault();
    if (!editSku || !editImageFile) return;
    setUploading(true);
    try {
      // 1. Upload Image to portafolio
      const formData = new FormData();
      formData.append('file', editImageFile);
      formData.append('sku', editSku);

      const res = await fetch('https://cervezasfinas.com/api/upload_portafolio.php', {
        method: 'POST',
        body: formData
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Error al subir imagen');
      }

      // 2. Add to sku_descripcion if it doesn't exist
      await supabase.from('sku_descripcion').upsert({ cve_marca: editSku, descripcion: editDesc || 'Nueva Imagen' }, { onConflict: 'cve_marca' });
      
      // 3. Vincular automáticamente con shop_products
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      await fetch('https://cervezasfinas.com/api/shop/admin/products-manage.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'create',
          sku: editSku,
          name: editDesc || editSku,
          description: editDesc || editSku,
          base_price: 0,
          category: 'Cerveza',
          image_url: 'portafolio/' + editSku + '.png',
          is_active: 1,
          allowed_zones: null
        })
      });

      setEditSku('');
      setEditDesc('');
      setEditImageFile(null);
      setCacheBuster(Date.now());
      showToast('SKU maestro, imagen y producto en tienda creados exitosamente');
      await loadAllData();
    } catch (err) {
      showToast('Error al agregar SKU: ' + err.message, true);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <Helmet>
        <title>Catálogo Maestro y Restricción por Zona - Admin</title>
      </Helmet>

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-sm font-semibold text-white animate-fade-in ${toastMessage.isError ? 'bg-red-600' : 'bg-emerald-600'}`}>
          {toastMessage.isError ? <AlertCircle className="w-5 h-5" /> : <Check className="w-5 h-5" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header y Título */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Package className="w-7 h-7 text-emerald-400" />
            Catálogo Maestro de SKUs y Restricción por Zona
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Vinculación integral con el catálogo de ventas, gestión de fotos en <code className="text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded text-xs">/portafolio/</code> y segmentación por zona comercial.
          </p>
        </div>

        {/* Botones de Sincronización Global y Descarga Excel Comparativo */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={loadAllData}
            disabled={loading || syncing}
            className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors border border-gray-700"
            title="Recargar datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>

          <button
            onClick={() => setIsZonasCatalogOpen(true)}
            className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors border border-emerald-700/50"
            title="Abrir Catálogo Oficial de Zonas y Rutas de la aplicación principal"
          >
            <MapIcon className="w-4 h-4 text-emerald-400" />
            🗺️ Catálogo Zonas y Rutas ({availableZones.length})
          </button>

          <button
            onClick={handleDownloadComparisonExcel}
            disabled={downloadingExcel || loading}
            className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-900/40 transition-all hover:scale-[1.02] border border-amber-500/40"
            title="Descargar Excel comparativo de cuáles SKUs ya están en el catálogo de la Shop, cuáles faltan y a cuáles les falta foto"
          >
            <Download className={`w-4 h-4 ${downloadingExcel ? 'animate-bounce' : ''}`} />
            {downloadingExcel ? 'Generando Excel...' : '📊 Descargar Excel Comparativo (SKUs y Fotos)'}
          </button>

          <button
            onClick={handleSyncAllToShop}
            disabled={syncing || loading}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/40 transition-all hover:scale-[1.02] border border-teal-500/40"
            title="Pasa todos los códigos, fotos y descripciones de esta pantalla hacia el catálogo de la Shop"
          >
            <Store className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? `Pasando Productos (${syncProgress})...` : '📥 Pasar todos los SKUs al Catálogo Shop'}
          </button>
        </div>
      </div>

      {/* Tarjetas de Estadísticas (KPIs) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Total SKUs</span>
            <Layers className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">{stats.total}</div>
          <p className="text-[11px] text-gray-500 mt-1">Registrados en el sistema</p>
        </div>

        <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">En Tienda</span>
            <Store className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-black text-teal-400">{stats.inShopCount}</div>
          <p className="text-[11px] text-gray-500 mt-1">Disponibles en el catálogo</p>
        </div>

        <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Todas las Zonas</span>
            <Globe className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400">{stats.unrestrictedCount}</div>
          <p className="text-[11px] text-gray-500 mt-1">Venta libre global</p>
        </div>

        <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Con Restricción</span>
            <MapPin className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400">{stats.restrictedCount}</div>
          <p className="text-[11px] text-gray-500 mt-1">Exclusivos por zona</p>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <Card className="bg-gray-900/90 border-gray-800">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Buscador */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por SKU o descripción..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filtro por Estado */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-semibold whitespace-nowrap">Estado:</span>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="bg-gray-950 border border-gray-800 text-white rounded-xl px-3 py-2 text-xs focus:border-emerald-500 outline-none"
              >
                <option value="all">Todos los SKUs</option>
                <option value="in_shop">En Tienda (Catálogo)</option>
                <option value="not_in_shop">No en Tienda</option>
                <option value="restricted">Con Restricción de Zona</option>
                <option value="unrestricted">Todas las Zonas (Global)</option>
              </select>
            </div>

            {/* Filtro por Zona Específica */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-semibold whitespace-nowrap">Ver Zona:</span>
              <select
                value={filterZone}
                onChange={e => setFilterZone(e.target.value)}
                className="bg-gray-950 border border-gray-800 text-white rounded-xl px-3 py-2 text-xs focus:border-emerald-500 outline-none"
              >
                <option value="all">🌐 Todas las Zonas</option>
                {availableZones.map(z => (
                  <option key={z} value={z}>📍 Solo zona {z}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Barra de Acciones de Lote si hay seleccionados */}
          {selectedSkus.length > 0 && (
            <div className="flex items-center justify-between bg-emerald-950/40 border border-emerald-800/60 p-3 rounded-xl animate-fade-in">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                <CheckSquare className="w-4 h-4" />
                <span>{selectedSkus.length} producto(s) seleccionado(s)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openZoneModal(selectedSkus)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  Asignar Zonas a Seleccionados
                </button>
                <button
                  onClick={() => setSelectedSkus([])}
                  className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabla Principal de SKUs */}
      <Card className="bg-gray-900/90 border-gray-800 shadow-xl overflow-hidden">
        <CardHeader className="p-4 border-b border-gray-800 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-white text-base font-bold flex items-center gap-2">
              <span>Listado de SKUs y Restricciones</span>
              <span className="text-xs font-normal text-gray-400">({filteredList.length} mostrados)</span>
            </CardTitle>
            <CardDescription className="text-gray-400 text-xs">
              Configura la disponibilidad por zona comercial para preventa, autoventa, televenta y WhatsApp.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-gray-400 space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-500" />
              <p className="text-sm">Cargando catálogo maestro y vinculaciones...</p>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Package className="w-12 h-12 mx-auto text-gray-600 mb-2" />
              <p className="font-semibold text-white">No se encontraron productos</p>
              <p className="text-xs text-gray-500 mt-1">Prueba ajustando los filtros de búsqueda o zona.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-950/70 border-b border-gray-800 text-gray-400 font-bold uppercase tracking-wider">
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedSkus.length > 0 && selectedSkus.length === filteredList.length}
                        onChange={handleSelectAllFiltered}
                        className="rounded border-gray-700 text-emerald-500 focus:ring-emerald-500 bg-gray-900"
                      />
                    </th>
                    <th className="p-3 w-16 text-center">Foto</th>
                    <th className="p-3 w-28">SKU</th>
                    <th className="p-3">Descripción Oficial</th>
                    <th className="p-3 w-32 text-center">En Tienda</th>
                    <th className="p-3">Restricción de Zonas</th>
                    <th className="p-3 w-36 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredList.map(row => (
                    <tr 
                      key={row.sku} 
                      className={`hover:bg-gray-800/50 transition-colors ${selectedSkus.includes(row.sku) ? 'bg-emerald-950/20' : ''}`}
                    >
                      {/* Checkbox de selección */}
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedSkus.includes(row.sku)}
                          onChange={() => handleToggleSelectRow(row.sku)}
                          className="rounded border-gray-700 text-emerald-500 focus:ring-emerald-500 bg-gray-900 cursor-pointer"
                        />
                      </td>

                      {/* Miniatura de la imagen */}
                      <td className="p-3 text-center">
                        <div className="relative w-12 h-12 mx-auto rounded-lg bg-gray-950 border border-gray-800 p-1 flex items-center justify-center overflow-hidden">
                          <img
                            src={`${getProductImageUrl(row.sku)}?cb=${cacheBuster}`}
                            alt={row.sku}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              if (!e.target.dataset.failed) {
                                e.target.dataset.failed = true;
                                e.target.style.display = 'none';
                                e.target.insertAdjacentHTML('afterend', '<span class="text-[9px] text-red-400 font-mono">Sin foto</span>');
                                const k = String(row.sku || '').trim().toUpperCase();
                                if (k) {
                                  setMissingPhotoSkus(prev => (prev[k] ? prev : { ...prev, [k]: true }));
                                }
                              }
                            }}
                          />
                        </div>
                      </td>

                      {/* Código SKU */}
                      <td className="p-3">
                        <div className="font-mono font-black text-sm text-emerald-400">{row.sku}</div>
                        <div className="text-[10px] text-gray-500">{row.category}</div>
                      </td>

                      {/* Descripción */}
                      <td className="p-3">
                        <div className="font-semibold text-white text-xs">{row.description}</div>
                        {row.basePrice !== null && (
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            Precio Base: <span className="text-emerald-400 font-bold">${Number(row.basePrice).toFixed(2)}</span>
                          </div>
                        )}
                      </td>

                      {/* Estatus en Tienda */}
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleToggleShopStatus(row)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                            row.inShop && row.isActiveInShop
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                              : row.inShop && !row.isActiveInShop
                              ? 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'
                          }`}
                          title="Clic para cambiar estatus en la tienda"
                        >
                          {row.inShop && row.isActiveInShop ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>Activo</span>
                            </>
                          ) : row.inShop && !row.isActiveInShop ? (
                            <>
                              <X className="w-3 h-3 text-gray-400" />
                              <span>Pausado</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3 text-amber-400" />
                              <span>Vincular</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Restricción de Zonas */}
                      <td className="p-3">
                        <div className="flex items-center flex-wrap gap-1">
                          {row.isUnrestricted ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                              <Globe className="w-3 h-3" />
                              Todas las Zonas (Global)
                            </span>
                          ) : (
                            row.zonesList.map(z => (
                              <span 
                                key={z} 
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800/70"
                              >
                                <MapPin className="w-2.5 h-2.5 text-blue-400" />
                                {z}
                              </span>
                            ))
                          )}

                          <button
                            onClick={() => openZoneModal(row)}
                            className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-emerald-400 transition-colors ml-1"
                            title="Modificar restricción de zonas"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Acciones (Subir Foto / Configurar) */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <label className="bg-gray-800 hover:bg-gray-700 text-gray-200 px-2.5 py-1 rounded-lg cursor-pointer transition-colors text-[11px] font-medium flex items-center gap-1 border border-gray-700">
                            <Upload className="w-3 h-3 text-emerald-400" />
                            <span>{uploading ? '...' : 'Foto'}</span>
                            <input 
                              type="file" 
                              accept="image/*" 
                              style={{ display: 'none' }} 
                              onChange={e => handleUpload(e, row.sku)} 
                              disabled={uploading} 
                            />
                          </label>

                          <button
                            onClick={() => openZoneModal(row)}
                            className="bg-gray-800 hover:bg-emerald-900/30 text-emerald-400 px-2.5 py-1 rounded-lg transition-colors text-[11px] font-medium flex items-center gap-1 border border-gray-700"
                            title="Configurar zonas comerciales"
                          >
                            <MapPin className="w-3 h-3" />
                            <span>Zonas</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Restricción de Zonas Comercial */}
      {zoneModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-scale-up">
            <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gray-950">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  {Array.isArray(zoneModalItem)
                    ? `Restricción de Zonas (${zoneModalItem.length} productos)`
                    : `Restricción de Zonas: ${zoneModalItem.sku}`}
                </h3>
              </div>
              <button
                onClick={() => setZoneModalItem(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {!Array.isArray(zoneModalItem) && (
                <div className="bg-gray-950/80 p-3 rounded-xl border border-gray-800 flex items-center gap-3">
                  <img
                    src={`${getProductImageUrl(zoneModalItem.sku)}?cb=${cacheBuster}`}
                    alt={zoneModalItem.sku}
                    className="w-10 h-10 object-contain rounded bg-white/5 p-1"
                  />
                  <div>
                    <div className="font-bold text-sm text-white">{zoneModalItem.description}</div>
                    <div className="text-xs text-gray-400 font-mono">SKU: {zoneModalItem.sku}</div>
                  </div>
                </div>
              )}

              {/* Opción 1: Todas las Zonas */}
              <label 
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  modalAllZones 
                    ? 'bg-emerald-950/40 border-emerald-500 text-white' 
                    : 'bg-gray-950 border-gray-800 text-gray-300 hover:border-gray-700'
                }`}
              >
                <input
                  type="radio"
                  name="zone_mode"
                  checked={modalAllZones}
                  onChange={() => {
                    setModalAllZones(true);
                    setModalSelectedZones([]);
                  }}
                  className="mt-1 text-emerald-500 focus:ring-emerald-500 bg-gray-900 border-gray-700"
                />
                <div>
                  <div className="font-bold text-sm flex items-center gap-1.5 text-emerald-400">
                    <Globe className="w-4 h-4" />
                    Disponible en Todas las Zonas (Global)
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    El producto se podrá vender libremente en preventa, autoventa, televenta y WhatsApp para cualquier cliente sin restricción territorial.
                  </p>
                </div>
              </label>

              {/* Opción 2: Zonas Específicas */}
              <label 
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  !modalAllZones 
                    ? 'bg-blue-950/40 border-blue-500 text-white' 
                    : 'bg-gray-950 border-gray-800 text-gray-300 hover:border-gray-700'
                }`}
              >
                <input
                  type="radio"
                  name="zone_mode"
                  checked={!modalAllZones}
                  onChange={() => {
                    setModalAllZones(false);
                    if (modalSelectedZones.length === 0 && availableZones.length > 0) {
                      setModalSelectedZones([availableZones[0]]);
                    }
                  }}
                  className="mt-1 text-blue-500 focus:ring-blue-500 bg-gray-900 border-gray-700"
                />
                <div>
                  <div className="font-bold text-sm flex items-center gap-1.5 text-blue-400">
                    <MapPin className="w-4 h-4" />
                    Restringir a Zonas Comerciales Específicas
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    El producto SOLAMENTE se mostrará y venderá a clientes cuya zona coincida con las seleccionadas abajo.
                  </p>
                </div>
              </label>

              {/* Selector de Zonas Checkboxes */}
              {!modalAllZones && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between text-xs text-gray-400 font-semibold px-1">
                    <span>Zonas autorizadas para este producto:</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setModalSelectedZones([...availableZones])}
                        className="text-emerald-400 hover:underline"
                      >
                        Marcar todas
                      </button>
                      <span>|</span>
                      <button
                        type="button"
                        onClick={() => setModalSelectedZones([])}
                        className="text-gray-400 hover:underline"
                      >
                        Limpiar
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                    {availableZones.map(zoneName => {
                      const isChecked = modalSelectedZones.includes(zoneName);
                      return (
                        <label
                          key={zoneName}
                          onClick={() => handleToggleZoneInModal(zoneName)}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer select-none text-xs font-semibold transition-all ${
                            isChecked
                              ? 'bg-blue-600/20 border-blue-500 text-blue-200'
                              : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded flex items-center justify-center border ${isChecked ? 'bg-blue-500 border-blue-500' : 'border-gray-700'}`}>
                            {isChecked && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span>{zoneName}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-gray-800 bg-gray-950 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setZoneModalItem(null)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveZones}
                disabled={savingZones}
                className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-900/30 flex items-center gap-1.5"
              >
                {savingZones ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>{savingZones ? 'Guardando...' : 'Guardar Restricción'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sección Agregar Nuevo SKU e Imagen */}
      <Card className="bg-gray-900/90 border-gray-800">
        <CardHeader className="p-4 border-b border-gray-800">
          <CardTitle className="text-white text-base font-bold flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>Registrar Nuevo SKU Maestro con Imagen</span>
          </CardTitle>
          <CardDescription className="text-gray-400 text-xs">
            Agrega un nuevo SKU a la tabla maestra de Heineken México y guárdalo simultáneamente en el catálogo de productos.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <form onSubmit={handleAddSku} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <input
              type="text"
              placeholder="Código SKU (ej. 7214)"
              value={editSku}
              onChange={e => setEditSku(e.target.value)}
              className="px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-white text-xs w-full sm:w-40 focus:border-emerald-500 outline-none"
              required
            />
            <input
              type="text"
              placeholder="Descripción oficial (ej. TECATE ORIGINAL 12/710 ML RET)"
              value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              className="px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-white text-xs w-full sm:w-96 focus:border-emerald-500 outline-none"
            />
            <label className="px-3 py-2 rounded-xl bg-gray-950 border border-dashed border-gray-700 text-gray-300 text-xs cursor-pointer hover:border-emerald-500 flex items-center justify-center gap-2">
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span className="truncate max-w-[150px]">{editImageFile ? editImageFile.name : 'Seleccionar foto PNG/JPG'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={e => setEditImageFile(e.target.files[0])}
                style={{ display: 'none' }}
                required
              />
            </label>
            <button
              type="submit"
              disabled={uploading}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-900/30 flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {uploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{uploading ? 'Guardando...' : 'Crear y Vincular'}</span>
            </button>
          </form>
        </CardContent>
      </Card>

      {/* Modal Oficial de Catálogo de Zonas y Rutas */}
      <ZonasRutasCatalogDialog
        open={isZonasCatalogOpen}
        onOpenChange={(openState) => {
          setIsZonasCatalogOpen(openState);
          if (!openState) {
            loadAllData();
          }
        }}
      />
    </div>
  );
}
