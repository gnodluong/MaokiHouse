import { useState } from 'react';
import toast from 'react-hot-toast';
import { useWorkspace } from './context';
import { Button, Dialog } from './ui';
import { errorMessage } from './utils';
import type { Contact } from '../../shared/workspace';

/** Merge a duplicate guest into another: bookings, conversations and extra fields move across, tags and notes are combined. */
export default function MergeContacts({ source, onClose }: { source: Contact; onClose: () => void }) {
  const { data, save, remove } = useWorkspace(); const [target, setTarget] = useState(''); const [busy, setBusy] = useState(false);
  if (!data) return null;
  const others = data.contacts.filter(contact => contact.id !== source.id);
  const run = async () => {
    const keep = others.find(contact => contact.id === target); if (!keep) return;
    setBusy(true);
    try {
      for (const booking of data.bookings.filter(item => item.contactId === source.id)) await save('bookings', { contactId: keep.id }, booking.id);
      for (const conversation of data.conversations.filter(item => item.contactId === source.id)) await save('conversations', { contactId: keep.id }, conversation.id);
      for (const value of data.fieldValues.filter(item => item.contactId === source.id)) await save('fieldValues', { contactId: keep.id }, value.id);
      await save('contacts', { tags: [...new Set([...keep.tags, ...source.tags])], notes: [keep.notes, source.notes].filter(Boolean).join('\n'), email: keep.email || source.email, phone: keep.phone || source.phone }, keep.id);
      await remove('contacts', source.id);
      toast.success('Đã gộp khách hàng'); onClose();
    } catch (cause) { toast.error(errorMessage(cause)); } finally { setBusy(false); }
  };
  return <Dialog title="Gộp khách hàng" onClose={onClose} busy={busy}><div className="mk-dialog-body">
    <p>Toàn bộ đặt phòng, hội thoại và thông tin của <strong>{source.name}</strong> sẽ chuyển sang hồ sơ bạn chọn, sau đó hồ sơ này bị xóa. Thao tác không thể hoàn tác.</p>
    <label className="mk-field"><span>Giữ lại hồ sơ</span><select value={target} onChange={event => setTarget(event.target.value)}><option value="">Chọn khách hàng…</option>{others.map(contact => <option key={contact.id} value={contact.id}>{contact.name}{contact.email ? ` · ${contact.email}` : ''}</option>)}</select></label>
    <footer><Button onClick={onClose} disabled={busy}>Hủy</Button><Button kind="primary" busy={busy} disabled={!target} onClick={() => void run()}>Gộp khách hàng</Button></footer>
  </div></Dialog>;
}
