import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Suggestion } from '@/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Input'

export function BulkSuggestionCleanup({ streamerId, suggestions, onDeleted }: { streamerId: string; suggestions: Suggestion[]; onDeleted: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const visible = suggestions.filter(item => status === 'all' || item.status === status)
  const selectedRows = suggestions.filter(item => selected.includes(item.id))
  const close = () => { if (!saving) { setOpen(false); setConfirming(false); setSelected([]) } }
  const remove = async () => {
    if (!selectedRows.length || saving) return
    setSaving(true)
    try {
      // The server verifies channel membership and deletes this exact snapshot atomically.
      const { data, error } = await supabase.rpc('delete_channel_suggestions', { p_streamer_id: streamerId, p_ids: selectedRows.map(item => item.id) })
      if (error) throw error
      toast.success(`${data ?? 0} envios excluídos.`)
      setOpen(false); setSelected([]); setConfirming(false)
      await onDeleted()
    } catch { toast.error('Não foi possível limpar os envios. Tente novamente.') }
    finally { setSaving(false) }
  }
  return <>
    <div className="flex justify-end"><Button variant="secondary" leftIcon={<Trash2 size={14} />} disabled={!suggestions.length} onClick={() => { setSelected([]); setStatus('all'); setConfirming(false); setOpen(true) }}>Limpar envios em massa</Button></div>
    <Modal isOpen={open} onClose={close} title={confirming ? 'Confirmar exclusão' : 'Limpar envios em massa'} size="lg">
      {confirming ? <div className="space-y-4"><p className="text-sm text-content-secondary">Excluir permanentemente {selectedRows.length} envios selecionados e seus votos? Essa ação não pode ser desfeita. As votações de filmes já criadas continuam no histórico.</p><ul className="max-h-52 overflow-y-auto text-sm text-content-secondary">{selectedRows.map(item => <li key={item.id} className="py-1">{item.title}</li>)}</ul><div className="flex justify-end gap-2"><Button variant="ghost" disabled={saving} onClick={() => setConfirming(false)}>Voltar</Button><Button variant="danger" loading={saving} disabled={!selectedRows.length} onClick={remove}>Excluir {selectedRows.length} envios</Button></div></div> : <div className="space-y-4">
        <Select label="Filtrar por status" value={status} onChange={event => { setStatus(event.target.value); setSelected([]) }} options={[{ value: 'all', label: 'Todos' }, { value: 'pending', label: 'Pendentes' }, { value: 'approved', label: 'Aprovados' }, { value: 'queued', label: 'Na fila' }, { value: 'watching', label: 'Assistindo' }, { value: 'completed', label: 'Concluídos' }, { value: 'rejected', label: 'Rejeitados' }]} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visible.length > 0 && visible.every(item => selected.includes(item.id))} onChange={event => setSelected(event.target.checked ? visible.map(item => item.id) : [])} />Selecionar os {visible.length} envios exibidos</label>
        <div className="max-h-72 space-y-2 overflow-y-auto">{visible.map(item => <label key={item.id} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm"><input type="checkbox" checked={selected.includes(item.id)} onChange={event => setSelected(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} /><span className="break-words">{item.title}</span></label>)}</div>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={close}>Cancelar</Button><Button variant="danger" disabled={!selectedRows.length} onClick={() => setConfirming(true)}>Revisar exclusão ({selectedRows.length})</Button></div>
      </div>}
    </Modal>
  </>
}
