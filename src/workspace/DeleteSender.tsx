import { useState } from 'react';
import toast from 'react-hot-toast';
import { useWorkspace } from './context';
import { Button, Dialog } from './ui';
import { errorMessage } from './utils';
import { requireSupabase } from '../lib/supabase/client';
import type { Contact } from '../../shared/workspace';

interface Result { conversations: number; channelLinks: number; queued: number; bookingsAnonymised: number }

/** Erase one guest on request (Meta, Zalo and Google require this): conversations, channel links and queued messages are deleted, bookings keep dates and amounts but lose the guest's identity. */
export default function DeleteSender({ source, onClose }: { source: Contact; onClose: () => void }) {
  const { reload } = useWorkspace(); const [busy, setBusy] = useState(false); const [typed, setTyped] = useState('');
  const run = async () => {
    setBusy(true);
    try {
      const { data, error } = await requireSupabase().rpc('maoki_delete_sender_data', { contact_id: source.id });
      if (error) throw new Error(error.code === 'PGRST202' ? 'Cần chạy SQL 20261201090000_maoki_stay_messaging.sql một lần trong Supabase.' : error.message);
      const result = data as Result; await reload();
      toast.success(`Đã xóa ${result.conversations} hội thoại, ${result.channelLinks} liên kết kênh; ${result.bookingsAnonymised} đặt phòng được ẩn danh`); onClose();
    } catch (cause) { toast.error(errorMessage(cause)); } finally { setBusy(false); }
  };
  return <Dialog title="Xóa dữ liệu của khách" onClose={onClose} busy={busy}><div className="mk-dialog-body">
    <p>Toàn bộ hội thoại, liên kết kênh (Zalo, Messenger, WhatsApp, email…) và tin nhắn đang chờ gửi của <strong>{source.name}</strong> sẽ bị xóa, rồi hồ sơ khách bị xóa. Các đặt phòng được giữ lại cho sổ sách nhưng bỏ tên, email và số điện thoại. Không thể hoàn tác.</p>
    <label className="mk-field"><span>Gõ tên khách để xác nhận</span><input value={typed} onChange={event => setTyped(event.target.value)} placeholder={source.name} /></label>
    <footer><Button onClick={onClose} disabled={busy}>Hủy</Button><Button kind="primary" busy={busy} disabled={typed.trim() !== source.name.trim()} onClick={() => void run()}>Xóa dữ liệu khách</Button></footer>
  </div></Dialog>;
}
