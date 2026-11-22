import React, { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { getClientsPaged } from '@/repositories/clientsRepository'
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext'
import { Button } from '../../components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog'

export default function InstallerClients() {
	const [clients, setClients] = useState([])
	const [loading, setLoading] = useState(false)
	const [open, setOpen] = useState(false)
	const [selectedClient, setSelectedClient] = useState(null)
	const [fachada, setFachada] = useState(false)
	const [enfriador, setEnfriador] = useState(false)
	const [elementos, setElementos] = useState([])
	const [saving, setSaving] = useState(false)
	const [query, setQuery] = useState('')
	const [message, setMessage] = useState(null)
	const { user } = useSupabaseAuth()

	useEffect(() => { if (user) fetchClients() }, [user])

	async function fetchClients() {
		setLoading(true)
		try {
			// Filtrar por zona del instalador para no exponer clientes de otras zonas
			const userZona = user?.user_metadata?.zona || user?.profile?.zona || null;
			const filters = userZona ? { zona: userZona } : {};
			const data = await getClientsPaged({ page: 1, pageSize: 2000, filters });
			setClients(data.data || [])
		} catch (error) {
			setMessage({ type: 'error', text: 'Error cargando clientes' })
		}
		setLoading(false)
	}

	function openDialog(client) {
		setSelectedClient(client)
		setFachada(false)
		setEnfriador(false)
		setElementos([])
		setMessage(null)
		setOpen(true)
	}

	async function saveInstallation() {
		if (!selectedClient) return
		if (!fachada && !enfriador && elementos.length === 0) {
			setMessage({ type: 'error', text: 'Seleccione al menos un elemento, fachada o enfriador' })
			return
		}

		setSaving(true)
		const payload = {
			client_code: selectedClient.client_code || selectedClient.code || selectedClient.id,
			fachada,
			enfriador,
			elementos,
			created_at: new Date().toISOString(),
		}

		const { data, error } = await supabase
			.from('installations')
			.insert([payload])

		setSaving(false)
		if (error) {
			setMessage({ type: 'error', text: 'Error guardando instalación' })
		} else {
			setMessage({ type: 'success', text: 'Instalación registrada' })
			setOpen(false)
		}
	}

	function toggleElemento(name) {
		setElementos(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name])
	}

	const filtered = query ? clients.filter(c => {
		const q = query.toLowerCase()
		const name = (c.business_name || c.name || '').toString().toLowerCase()
		const code = (c.client_code || c.code || '').toString().toLowerCase()
		return name.includes(q) || code.includes(q) || (c.city || '').toLowerCase().includes(q)
	}) : clients

	return (
		<div className="container mx-auto py-8">
			<h2 className="text-2xl font-bold mb-4">Instalador — Clientes</h2>

			{message && (
				<div className={`p-2 mb-4 rounded ${message.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
					{message.text}
				</div>
			)}

			<div className="mb-4">
				<input
					value={query}
					onChange={e => setQuery(e.target.value)}
					className="border p-2 rounded w-full"
					placeholder="Buscar cliente por nombre o código..."
				/>
			</div>

			{loading ? (
				<div>Cargando clientes...</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{filtered.map(c => (
						<div key={c.id} className="bg-white rounded-lg shadow p-5 flex flex-col gap-2 border">
							<div className="text-xs text-black">Código: {c.client_code || '—'}</div>
							<div className="font-semibold text-lg text-black">{c.business_name || c.name}</div>
							<div className="text-black text-sm">{c.address}</div>
							<div className="text-black text-sm">Teléfono: {c.phone}</div>
							<div className="text-black text-sm">Seriales Enfriador: {Array.isArray(c.cooler_serials) ? c.cooler_serials.join(", ") : "—"}</div>
							<div className="flex gap-2 mt-2 justify-end">
								<Button size="sm" variant="outline" onClick={() => openDialog(c)}>Registrar instalación</Button>
							</div>
						</div>
					))}
				</div>
			)}

			<Dialog open={open} onOpenChange={(o) => { if (!o) setSelectedClient(null); setOpen(o); }}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{selectedClient ? `Registrar instalación — ${selectedClient.business_name || selectedClient.name}` : 'Registrar instalación'}</DialogTitle>
					</DialogHeader>
					<div className="space-y-3 mt-2">
						<label className="flex items-center space-x-2">
							<input type="checkbox" checked={fachada} onChange={(e) => setFachada(e.target.checked)} />
							<span>Fachada</span>
						</label>

						<label className="flex items-center space-x-2">
							<input type="checkbox" checked={enfriador} onChange={(e) => setEnfriador(e.target.checked)} />
							<span>Enfriador</span>
						</label>

						<div className="space-y-1">
							<div className="text-sm font-semibold">Elementos</div>
							<label className="flex items-center space-x-2">
								<input type="checkbox" checked={elementos.includes('vineta')} onChange={() => toggleElemento('vineta')} />
								<span>Viñeta</span>
							</label>
							<label className="flex items-center space-x-2">
								<input type="checkbox" checked={elementos.includes('cartel')} onChange={() => toggleElemento('cartel')} />
								<span>Cartel</span>
							</label>
							<label className="flex items-center space-x-2">
								<input type="checkbox" checked={elementos.includes('sticker')} onChange={() => toggleElemento('sticker')} />
								<span>Sticker</span>
							</label>
						</div>

						<div className="flex items-center justify-end space-x-2">
							<Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
							<Button size="sm" onClick={saveInstallation} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
