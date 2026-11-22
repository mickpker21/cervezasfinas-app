import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from '../supabaseClient';
import { generateClientPdf } from '@/lib/pdfGenerator';
import { getUniqueCadenas } from '@/repositories/clientsRepository';
import { getCurrentPositionSafe } from '@/lib/geolocation';
import { Loader2, Save, MapPin, Camera } from "lucide-react";

export default function ClientForm({ onSubmit, initialData = {} }) {
  // Initialize from snake_case DB columns
  const [clientCode, setClientCode] = useState(initialData.client_code || "");
  const [name, setName] = useState(initialData.name || "");
  const [businessName, setBusinessName] = useState(initialData.business_name || initialData.businessName || "");
  const [phone, setPhone] = useState(initialData.phone || "");
  // Removed generic 'route' as requested
  const [internalRoute, setInternalRoute] = useState(initialData.internal_route || initialData.internalRoute || "");
  const [gec, setGec] = useState(initialData.gec || "Bronce");

  // "Tipo de Cliente" -> client_type
  const [clientType, setClientType] = useState(initialData.client_type || initialData.clientType || "Punto de venta");

  const [coords, setCoords] = useState(initialData.coords || "");
  const [comments, setComments] = useState(initialData.notes || initialData.comments || "");
  const [salesRoute, setSalesRoute] = useState(initialData.sales_route || initialData.salesRoute || "");
  const [mixType, setMixType] = useState(initialData.exclusivity || initialData.mixType || "Mixto");
  const [photo, setPhoto] = useState(null);

  // "Nivel de Precio" -> cadena (Dynamic now)
  const [nivel, setNivel] = useState(initialData.cadena || initialData.nivel || "");
  const [chains, setChains] = useState([]); // Dynamic chains list

  // Additional fields (check if they exist in DB, if not keeping them in state but they might not save if column missing)
  const [condicion, setCondicion] = useState(initialData.condicion || "");

  // Zona -> zona_comercial
  const [zona, setZona] = useState(initialData.zona_comercial || initialData.zona || "");

  // Legacy/Extra fields - consolidating
  const [tipoCliente, setTipoCliente] = useState(initialData.tipo_cliente || initialData.tipoCliente || "");

  // New Fields
  const [address, setAddress] = useState(initialData.address || "");
  const [crossStreet, setCrossStreet] = useState(initialData.cross_street || "");
  const [exteriorNumber, setExteriorNumber] = useState(initialData.exterior_number || "");
  const [interiorNumber, setInteriorNumber] = useState(initialData.interior_number || "");
  const [colony, setColony] = useState(initialData.colony || "");
  const [postalCode, setPostalCode] = useState(initialData.postal_code || "");
  const [city, setCity] = useState(initialData.city || "Puebla");
  const [state, setState] = useState(initialData.state || "Puebla");
  const [reference, setReference] = useState(initialData.reference || "");

  const [salesModality, setSalesModality] = useState(initialData.sales_modality || "");
  const [ritmo, setRitmo] = useState(initialData.ritmo || "");

  // Fiscal
  const [rfc, setRfc] = useState(initialData.rfc || "");
  const [fiscalName, setFiscalName] = useState(initialData.fiscal_name || "");
  const [fiscalAddress, setFiscalAddress] = useState(initialData.fiscal_address || "");
  const [fiscalColony, setFiscalColony] = useState(initialData.fiscal_colony || "");
  const [fiscalPostalCode, setFiscalPostalCode] = useState(initialData.fiscal_postal_code || "");
  const [cedulaIeps, setCedulaIeps] = useState(initialData.cedula_ieps || "");

  const [visitDays, setVisitDays] = useState(initialData.visit_days ? String(initialData.visit_days).split(',') : []);
  const [visitDaysTeleventa, setVisitDaysTeleventa] = useState(initialData.visit_day_televenta ? String(initialData.visit_day_televenta).split(',') : []);

  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    // Fetch dynamic chains on mount
    getUniqueCadenas().then(setChains).catch(err => console.error("Failed to load chains", err));
  }, []);

  useEffect(() => {
    // Sync state with props when initialData updates (e.g. after a refresh/save)
    setClientCode(initialData.client_code || "");
    setName(initialData.name || "");
    setBusinessName(initialData.business_name || initialData.businessName || "");
    setPhone(initialData.phone || "");
    setInternalRoute(initialData.internal_route || initialData.internalRoute || "");
    setGec(initialData.gec || "Bronce");
    setClientType(initialData.client_type || initialData.clientType || "Punto de venta");
    setCoords(initialData.coords || "");
    setComments(initialData.notes || initialData.comments || "");
    setSalesRoute(initialData.sales_route || initialData.salesRoute || "");
    setMixType(initialData.exclusivity || initialData.mixType || "Mixto");
    setNivel(initialData.cadena || initialData.nivel || "");
    setCondicion(initialData.condicion || "");
    setZona(initialData.zona_comercial || initialData.zona || "");
    setTipoCliente(initialData.tipo_cliente || initialData.tipoCliente || "");

    // Sync new fields
    setAddress(initialData.address || "");
    setCrossStreet(initialData.cross_street || "");
    setExteriorNumber(initialData.exterior_number || "");
    setInteriorNumber(initialData.interior_number || "");
    setColony(initialData.colony || "");
    setPostalCode(initialData.postal_code || "");
    setCity(initialData.city || "Puebla");
    setState(initialData.state || "Puebla");
    setReference(initialData.reference || "");
    setSalesModality(initialData.sales_modality || "");
    setRitmo(initialData.ritmo || "");
    setRfc(initialData.rfc || "");
    setFiscalName(initialData.fiscal_name || "");
    setFiscalAddress(initialData.fiscal_address || "");
    setFiscalColony(initialData.fiscal_colony || "");
    setFiscalPostalCode(initialData.fiscal_postal_code || "");
    setCedulaIeps(initialData.cedula_ieps || "");

    setVisitDays(initialData.visit_days ? String(initialData.visit_days).split(',') : []);
    setVisitDaysTeleventa(initialData.visit_day_televenta ? String(initialData.visit_day_televenta).split(',') : []);
  }, [initialData]);

  const handleGeolocate = async () => {
    try {
      const position = await getCurrentPositionSafe({ enableHighAccuracy: true });
      const { latitude, longitude } = position.coords;
      setCoords({ lat: latitude, lng: longitude });
    } catch (error) {
      alert("No se pudo obtener la geolocalización: " + (error.message || 'Sin permisos o señal.'));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGeneratingPdf(true);

    let photoUrl = null;
    if (photo) {
      const fileExt = photo.name.split('.').pop();
      const fileName = `client_${name}_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('client-photos').upload(fileName, photo, { contentType: photo.type });
      if (!uploadError) {
        photoUrl = supabase.storage.from('client-photos').getPublicUrl(fileName).data.publicUrl;
      }
    }
    // Si coords es string, lo convertimos a objeto
    let coordsValue = coords;
    if (typeof coords === 'string' && coords.includes(',')) {
      const [lat, lng] = coords.split(',').map(Number);
      coordsValue = { lat, lng };
    }

    // Map to DB Columns (Snake Case)
    // WORKAROUND: Send multiple aliases for client_code to catch whatever the PHP script expects
    const formData = {
      client_code: clientCode, // Standard
      cve_cliente: clientCode, // Common alias
      code: clientCode,        // Common alias
      clave: clientCode,       // Common alias
      name,
      business_name: businessName,
      phone,
      // route: route, // Removed
      internal_route: internalRoute,
      gec,
      client_type: clientType, // Mapped
      coords: coordsValue,
      notes: comments,
      sales_route: salesRoute,
      exclusivity: mixType,
      photo_url: photoUrl,

      // Nivel de Precio -> cadena
      cadena: nivel,

      // Persist other fields if columns exist or simple pass-through
      tipo_cliente: tipoCliente,
      condicion,

      // Map dropdown value to both fields
      zona_comercial: zona,
      region: zona,

      // New Fields
      address,
      cross_street: crossStreet,
      exterior_number: exteriorNumber,
      interior_number: interiorNumber,
      colony,
      postal_code: postalCode,
      city,
      state,
      reference,
      sales_modality: salesModality,
      ritmo,
      rfc,
      fiscal_name: fiscalName,
      fiscal_address: fiscalAddress,
      fiscal_colony: fiscalColony,
      fiscal_postal_code: fiscalPostalCode,
      cedula_ieps: cedulaIeps,

      visit_days: visitDays.join(','),
      visit_day_televenta: visitDaysTeleventa.join(',')
    };

    // GENERATE PDF AUTOMATICALLY (Use mapped data)
    try {
      console.log("Generando PDF de alta...");
      // Adapt flat keys for PDF generator if needed, or update generator to read snake_case
      // Generator likely reads: businessName, name, phone, gec, livello?, clientData.nivel...
      // We'll pass a merged object to be safe for PDF
      const pdfData = {
        ...formData,
        businessName: businessName,
        nivel: nivel,
        mixType: mixType,
        salesRoute: salesRoute,
        comments: comments
      };

      const pdfResult = await generateClientPdf(pdfData);

      if (pdfResult?.success) {
        console.log('[ClientForm] PDF generated successfully:', pdfResult);
        // Success messages handled by Share API dialog in APK or download in web
      } else {
        console.warn('[ClientForm] PDF generation completed with warnings:', pdfResult);
      }
    } catch (errPdf) {
      console.error("Error generando PDF (no bloqueante):", errPdf);
    }

    setGeneratingPdf(false);
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-white">

      {/* Client Code - The ONLY editable field */}
      <div className="space-y-2">
        <Label htmlFor="clientCode" className="text-blue-200">Código de Cliente (Editable)</Label>
        <Input
          id="clientCode"
          placeholder="Ej. 12345"
          value={clientCode}
          onChange={(e) => setClientCode(e.target.value)}
          required
          className="bg-slate-900/50 border-blue-500 text-white placeholder:text-slate-500 focus:border-blue-400 ring-2 ring-blue-500/20"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-75">
        {/* Basic Info - DISABLED */}
        <div className="space-y-2">
          <Label htmlFor="name" className="text-gray-400">Nombre del Cliente</Label>
          <Input
            id="name"
            value={name}
            disabled
            className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="businessName" className="text-gray-400">Nombre del Negocio</Label>
          <Input
            id="businessName"
            value={businessName}
            disabled
            className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" className="text-gray-400">Teléfono</Label>
          <Input
            id="phone"
            value={phone}
            disabled
            className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed"
          />
        </div>

        <div className="space-y-2">
          <label className="text-blue-200 block text-sm font-medium">Dirección (Calle)</label>
          <Input
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-blue-200">Entre Calles</Label>
          <Input value={crossStreet} onChange={(e) => setCrossStreet(e.target.value)} className="bg-slate-900/50 border-slate-700 text-white" />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label className="text-blue-200">No. Exterior</Label>
          <Input value={exteriorNumber} onChange={(e) => setExteriorNumber(e.target.value)} className="bg-slate-900/50 border-slate-700 text-white" />
        </div>
        <div className="space-y-2">
          <Label className="text-blue-200">No. Interior</Label>
          <Input value={interiorNumber} onChange={(e) => setInteriorNumber(e.target.value)} className="bg-slate-900/50 border-slate-700 text-white" />
        </div>
        <div className="space-y-2">
          <Label className="text-blue-200">Colonia</Label>
          <Input value={colony} onChange={(e) => setColony(e.target.value)} className="bg-slate-900/50 border-slate-700 text-white" />
        </div>
        <div className="space-y-2">
          <Label className="text-blue-200">C.P.</Label>
          <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="bg-slate-900/50 border-slate-700 text-white" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-blue-200">Población</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} className="bg-slate-900/50 border-slate-700 text-white" />
        </div>
        <div className="space-y-2">
          <Label className="text-blue-200">Estado</Label>
          <Input value={state} onChange={(e) => setState(e.target.value)} className="bg-slate-900/50 border-slate-700 text-white" />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-blue-200">Referencias</Label>
        <Textarea value={reference} onChange={(e) => setReference(e.target.value)} className="bg-slate-900/50 border-slate-700 text-white" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-75">

        <div className="space-y-2">
          <Label className="text-gray-400">Zona Comercial</Label>
          <Select value={zona} disabled>
            <SelectTrigger className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed">
              <SelectValue placeholder={zona || "Zona"} />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700 text-white z-[10000]">
              <SelectItem value={zona || "default"}>{zona || "Zona"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-75">
        <div className="space-y-2">
          <Label htmlFor="internalRoute" className="text-gray-400">Ruta Conquista</Label>
          <Input
            id="internalRoute"
            value={internalRoute}
            disabled
            className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="salesRoute" className="text-gray-400">Ruta de Venta</Label>
          <Input
            id="salesRoute"
            value={salesRoute}
            disabled
            className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed"
          />
        </div>
      </div>

      {/* New Visit Days Section (Editable) */}
      <div className="space-y-4 border-t border-slate-800 pt-4 pb-4 opacity-75">
        <label className="text-sm font-medium text-gray-400 block mb-2">Programación de Visitas</label>

        <div className="space-y-2">
          <Label className="text-gray-400 text-xs uppercase">Días de Visita (Presencial)</Label>
          <div className="flex flex-wrap gap-2">
            {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(day => (
              <Button
                key={day}
                type="button"
                disabled
                variant={visitDays.includes(day) ? "default" : "outline"}
                className={`h-7 px-3 text-xs ${visitDays.includes(day) ? 'bg-slate-700 text-white border-slate-600' : 'bg-slate-900 border-slate-800 text-gray-500'} cursor-not-allowed max-w-none opacity-100 disabled:opacity-100`}
              >
                {day}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-gray-400 text-xs uppercase">Días de Televenta (Llamada)</Label>
          <div className="flex flex-wrap gap-2">
            {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(day => (
              <Button
                key={day}
                type="button"
                disabled
                variant={visitDaysTeleventa.includes(day) ? "default" : "outline"}
                className={`h-7 px-3 text-xs ${visitDaysTeleventa.includes(day) ? 'bg-slate-700 text-white border-slate-600' : 'bg-slate-900 border-slate-800 text-gray-500'} cursor-not-allowed max-w-none opacity-100 disabled:opacity-100`}
              >
                {day}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 opacity-75">
        <div className="space-y-2">
          <Label className="text-gray-400">Nivel de Precio</Label>
          <Input value={nivel} disabled className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed" />
        </div>

        <div className="space-y-2">
          <Label className="text-gray-400">Tipo de Cliente</Label>
          <Input value={clientType} disabled className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed" />
        </div>

        <div className="space-y-2">
          <Label className="text-gray-400">Clasificación</Label>
          <Input value={tipoCliente} disabled className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 opacity-75">
        <div className="space-y-2">
          <Label className="text-gray-400">Condición</Label>
          <Input value={condicion} disabled className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed" />
        </div>

        <div className="space-y-2">
          <Label className="text-gray-400">GEC</Label>
          <Input value={gec} disabled className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed" />
        </div>

        <div className="space-y-2">
          <Label className="text-gray-400">Exclusividad</Label>
          <Input value={mixType} disabled className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed" />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-blue-200">Geolocalización (Coordenadas)</Label>
        <div className="flex gap-2">
          <Input
            value={typeof coords === 'object' ? `${coords.lat},${coords.lng}` : coords}
            onChange={(e) => setCoords(e.target.value)}
            className="bg-slate-900/50 border-slate-700 text-white"
            placeholder="Ej. 18.918233, -98.926943"
          />
          <Button type="button" variant="outline" onClick={handleGeolocate} className="bg-slate-800/30 border-blue-500 text-blue-300 hover:bg-blue-900/30">
            <MapPin className="h-4 w-4 mr-2" />
            Ubicar
          </Button>
        </div>
      </div>

      <div className="space-y-2 opacity-75">
        <Label htmlFor="comments" className="text-gray-400">Comentarios</Label>
        <Textarea
          id="comments"
          value={comments}
          disabled
          className="bg-slate-900/30 border-slate-800 text-gray-400 min-h-[100px] cursor-not-allowed"
        />
      </div>

      {/* Fiscal Section */}
      {/* Fiscal Section */}
      <div className="space-y-4 border-t border-slate-800 pt-4 opacity-75">
        <label className="text-sm font-medium text-gray-400 block">Datos de Facturación</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-gray-400">RFC</Label>
            <Input value={rfc} onChange={(e) => setRfc(e.target.value)} disabled className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed" />
          </div>
          <div className="space-y-2">
            <Label className="text-gray-400">Razón Social</Label>
            <Input value={fiscalName} onChange={(e) => setFiscalName(e.target.value)} disabled className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed" />
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-gray-400">Domicilio Fiscal</Label>
          <Input value={fiscalAddress} onChange={(e) => setFiscalAddress(e.target.value)} disabled className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-gray-400">Colonia Fiscal</Label>
            <Input value={fiscalColony} onChange={(e) => setFiscalColony(e.target.value)} disabled className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed" />
          </div>
          <div className="space-y-2">
            <Label className="text-gray-400">C.P. Fiscal</Label>
            <Input value={fiscalPostalCode} onChange={(e) => setFiscalPostalCode(e.target.value)} disabled className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed" />
          </div>
          <div className="space-y-2">
            <Label className="text-gray-400">Cédula IEPS</Label>
            <Input value={cedulaIeps} onChange={(e) => setCedulaIeps(e.target.value)} disabled className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed" />
          </div>
        </div>
      </div>

      {/* Sales Config */}
      <div className="space-y-4 border-t border-slate-800 pt-4 opacity-75">
        <label className="text-sm font-medium text-gray-400 block">Configuración de Venta</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-gray-400">Modalidad</Label>
            <Select value={salesModality} disabled>
              <SelectTrigger className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed"><SelectValue placeholder={salesModality || "Seleccionar"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Autoventa">Autoventa</SelectItem>
                <SelectItem value="Preventa">Preventa</SelectItem>
                <SelectItem value="Televenta">Televenta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-gray-400">Ritmo</Label>
            <Select value={ritmo} disabled>
              <SelectTrigger className="bg-slate-900/30 border-slate-800 text-gray-400 cursor-not-allowed"><SelectValue placeholder={ritmo || "Seleccionar"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Semanal">Semanal</SelectItem>
                <SelectItem value="Quincenal">Quincenal</SelectItem>
                <SelectItem value="Mensual">Mensual</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-2 opacity-75">
        <Label className="text-gray-400">Foto del Cliente</Label>
        <div className="flex items-center gap-2 p-2 border border-slate-800 rounded-md bg-slate-900/30">
          <Input
            id="photo"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={e => setPhoto(e.target.files[0])}
            disabled
            className="cursor-not-allowed bg-transparent border-none text-gray-400 file:text-gray-400 file:bg-slate-800/30 file:px-4 file:py-2 file:border-0 file:rounded-md file:mr-4"
          />
          <Camera className="h-5 w-5 text-gray-500" />
        </div>
      </div>

      <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2" disabled={generatingPdf}>
        {generatingPdf ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Guardando...
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            Guardar y Actualizar Código
          </>
        )}
      </Button>
    </form>
  );
}