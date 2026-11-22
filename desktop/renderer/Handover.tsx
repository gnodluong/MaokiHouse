import { useState } from 'react';
import toast from 'react-hot-toast';
import { FiArrowRight } from 'react-icons/fi';
import { useWorkspace } from '../../src/workspace/context';
import { Button, Empty, PageHeader } from '../../src/workspace/ui';
import { canEdit } from '../../src/workspace/permissions';
import { errorMessage } from '../../src/workspace/utils';

const NONE = '__none__';

/** Move conversations from one assignee to another (staff leaving, shift change, workload balancing). */
export default function Handover() {
  const { data, save } = useWorkspace();
  const [from, setFrom] = useState(NONE); const [to, setTo] = useState(''); const [picked, setPicked] = useState<Set<string>>(new Set()); const [busy, setBusy] = useState(false);
  if (!data) return null;
  const names = [...new Set([...data.employees.map(item => item.name), ...data.conversations.map(item => item.assignee).filter(Boolean)])];
  const list = data.conversations.filter(item => item.status !== 'closed' && (from === NONE ? !item.assignee : item.assignee === from));
  const toggle = (id: string) => setPicked(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const run = async () => {
    setBusy(true);
    try { for (const id of picked) await save('conversations', { assignee: to }, id); toast.success(`${picked.size} hội thoại đã được bàn giao`); setPicked(new Set()); }
    catch (cause) { toast.error(errorMessage(cause)); } finally { setBusy(false); }
  };
  return <>
    <PageHeader title="Bàn giao hội thoại" description="Chuyển hàng loạt hội thoại đang mở từ người phụ trách này sang người khác, ví dụ khi đổi ca hoặc nhân sự nghỉ việc." />
    <section className="mk-panel dk-pref"><div className="dk-handover">
      <label className="mk-field"><span>Từ người phụ trách</span><select value={from} onChange={event => { setFrom(event.target.value); setPicked(new Set()); }}><option value={NONE}>Chưa phân công</option>{names.map(name => <option key={name}>{name}</option>)}</select></label>
      <FiArrowRight aria-hidden="true" />
      <label className="mk-field"><span>Sang người phụ trách</span><select value={to} onChange={event => setTo(event.target.value)}><option value="">Chọn người nhận…</option>{names.filter(name => name !== from).map(name => <option key={name}>{name}</option>)}</select></label>
      <Button kind="primary" busy={busy} disabled={!canEdit(data, 'conversations') || !picked.size || !to} onClick={() => void run()}>Bàn giao {picked.size || ''}</Button>
    </div>
      {list.length ? <div className="mk-table-scroll"><table className="mk-table"><thead><tr><th scope="col"><input type="checkbox" aria-label="Chọn tất cả" checked={picked.size === list.length} onChange={event => setPicked(event.target.checked ? new Set(list.map(item => item.id)) : new Set())} /></th><th scope="col">Khách lưu trú</th><th scope="col">Nền tảng</th><th scope="col">Trạng thái</th></tr></thead><tbody>{list.map(item => <tr key={item.id}><td><input type="checkbox" aria-label={item.guestName} checked={picked.has(item.id)} onChange={() => toggle(item.id)} /></td><td>{item.guestName}</td><td>{item.platform}</td><td>{item.status}</td></tr>)}</tbody></table></div> : <Empty title="Không có hội thoại" text="Người này không có hội thoại đang mở." />}
    </section>
  </>;
}
