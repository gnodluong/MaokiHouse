import { useMemo, useState } from 'react';
import type { ReactNode, FormEvent } from 'react';
import toast from 'react-hot-toast';
import { FiTrash2, FiCheck, FiInfo } from 'react-icons/fi';
import { canEdit } from './permissions';
import { definitions } from './definitions';
import { EditorContext, useWorkspace } from './context';
import type { Values } from './context';
import type { ResourceName, ResourceRecord } from '../../shared/workspace';
import { Button, Dialog } from './ui';
import { errorMessage, stayPrice, todayIn, valueOf, money } from './utils';

interface EditState { resource: ResourceName; record?: ResourceRecord; defaults?: Values }
export default function EditorProvider({ children }: { children: ReactNode }) {
  const [editing, setEditing] = useState<EditState | null>(null);
  const [deleting, setDeleting] = useState<{ resource: ResourceName; record: ResourceRecord } | null>(null);
  const { remove, data } = useWorkspace(); const [busy, setBusy] = useState(false); const [failure, setFailure] = useState('');
  const context = useMemo(() => ({ open: (resource: ResourceName, record?: ResourceRecord, defaults?: Values) => { if (canEdit(data, resource)) setEditing({ resource, record, defaults }); else toast.error('Vai trò của bạn chỉ được xem dữ liệu này'); }, confirmDelete: (resource: ResourceName, record: ResourceRecord) => { if (!canEdit(data, resource)) { toast.error('Bạn không có quyền xóa dữ liệu này'); return; } setDeleting({ resource, record }); setFailure(''); } }), [data]);
  return <EditorContext.Provider value={context}>{children}{editing && <RecordForm key={`${editing.resource}:${editing.record?.id || 'new'}`} {...editing} close={() => setEditing(null)} />}{deleting && <Dialog title={`Xóa ${definitions[deleting.resource].singular}?`} onClose={() => setDeleting(null)} busy={busy}><div className="mk-dialog-body"><p>Bản ghi <strong>{String(valueOf(deleting.record, definitions[deleting.resource].labelKey))}</strong> sẽ bị xóa. Thao tác này không thể hoàn tác.</p>{failure && <div className="mk-alert error" role="alert">{failure}</div>}</div><footer><Button onClick={() => setDeleting(null)} disabled={busy}>Giữ lại</Button><Button kind="danger" busy={busy} onClick={() => { setBusy(true); void remove(deleting.resource, deleting.record.id).then(() => { setDeleting(null); toast.success('Đã xóa bản ghi'); }).catch(cause => setFailure(errorMessage(cause))).finally(() => setBusy(false)); }}><FiTrash2 />Xóa bản ghi</Button></footer></Dialog>}</EditorContext.Provider>;
}

function RecordForm({ resource, record, defaults, close }: EditState & { close: () => void }) {
  const { data, save } = useWorkspace(); const definition = definitions[resource];
  const [values, setValues] = useState<Values>(() => Object.fromEntries(definition.fields.map(field => {
    const raw = record ? valueOf(record, field.key) : undefined;
    let initial: string | number | boolean | string[] = '';
    if (field.type === 'checkbox') initial = Boolean(raw ?? (field.key === 'enabled'));
    else if (field.type === 'properties') initial = Array.isArray(raw) ? raw.map(String) : [];
    else if (field.type === 'tags' || field.type === 'images') initial = Array.isArray(raw) ? raw.join(field.type === 'tags' ? ', ' : '\n') : '';
    else if (typeof raw === 'number' || typeof raw === 'string') initial = raw;
    else if (field.options) initial = field.options[0]?.[0] || '';
    else if (field.type === 'number') initial = field.min && field.min > 0 ? field.min : 0;
    else if (field.type === 'date') initial = todayIn(data?.settings.timezone);
    return [field.key, defaults?.[field.key] ?? initial];
  })));
  const [busy, setBusy] = useState(false); const [failure, setFailure] = useState('');
  if (!data) return null;
  const set = (key: string, value: Values[string]) => setValues(current => ({ ...current, [key]: value, ...(resource === 'automations' && key === 'trigger' ? { action: value === 'new_conversation' ? 'add_tag' : 'create_task' } : {}) }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setFailure('');
    const payload: Values = { ...values };
    for (const field of definition.fields) {
      if (field.type === 'number') payload[field.key] = Number(values[field.key]);
      if (field.type === 'tags') payload[field.key] = String(values[field.key]).split(',').map(tag => tag.trim()).filter(Boolean);
      if (field.type === 'images') payload[field.key] = String(values[field.key]).split('\n').map(url => url.trim()).filter(Boolean);
      if (field.key === 'initialMessage' && record) delete payload.initialMessage;
    }
    try { await save(resource, payload, record?.id); toast.success(record ? 'Đã lưu thay đổi' : `Đã thêm ${definition.singular}`); close(); }
    catch (cause) { setFailure(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const property = data.properties.find(item => item.id === values.propertyId);
  const suggested = resource === 'bookings' && property && String(values.checkIn) < String(values.checkOut) ? stayPrice(data, property, String(values.checkIn), String(values.checkOut)) : null;
  return <Dialog title={`${record ? 'Chỉnh sửa' : 'Thêm'} ${definition.singular}`} onClose={close} busy={busy}><form onSubmit={event => void submit(event)}><div className="mk-dialog-body mk-form-grid">
    {failure && <div className="mk-alert error full" role="alert">{failure}</div>}
    {resource === 'campaigns' && <div className="mk-alert full"><FiInfo /><span>Lịch gửi được lưu để chuẩn bị. Chiến dịch chưa gửi ra bên ngoài khi chưa có kết nối API.</span></div>}
    {resource === 'employees' && <div className="mk-alert full"><FiInfo /><span>Đây là danh bạ phân công công việc. Việc thêm thành viên không cấp quyền đăng nhập.</span></div>}
    {resource === 'rates' && <div className="mk-alert full">Khi các quy tắc trùng ngày, quy tắc được cập nhật gần nhất sẽ được áp dụng.</div>}
    {definition.fields.filter(field => !(record && field.key === 'initialMessage')).map(field => {
      const key = `field-${field.key}`;
      let options = field.options;
      if (resource === 'automations' && field.key === 'action') options = options?.filter(([value]) => values.trigger === 'new_conversation' ? value !== 'create_task' : value === 'create_task');
      if (field.relation) options = data[field.relation].map(item => [field.relation === 'employees' ? String(valueOf(item, 'name')) : item.id, String(valueOf(item, field.relation === 'properties' ? 'title' : 'name'))]);
      return <div key={key} className={`mk-field ${['textarea', 'images', 'tags', 'checkbox', 'properties'].includes(field.type || '') ? 'full' : ''}`}>
        {field.type === 'checkbox' ? <label className="mk-checkbox" htmlFor={key}><input id={key} type="checkbox" checked={Boolean(values[field.key])} onChange={event => set(field.key, event.target.checked)} /><span>{field.label}</span></label> : <><label htmlFor={key}>{field.label}{field.required && <span aria-label="bắt buộc"> *</span>}</label>
          {field.type === 'textarea' || field.type === 'images' ? <textarea id={key} rows={field.type === 'images' ? 3 : 4} value={String(values[field.key] ?? '')} onChange={event => set(field.key, event.target.value)} required={field.required} maxLength={field.type === 'images' ? 10000 : 10000} />
            : field.type === 'properties' ? <select id={key} multiple value={values[field.key] as string[]} onChange={event => set(field.key, Array.from(event.target.selectedOptions).map(option => option.value))}>{data.properties.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
              : field.type === 'select' ? <select id={key} value={String(values[field.key] || '')} onChange={event => set(field.key, event.target.value)} required={field.required}>{field.relation && <option value="">Chưa chọn</option>}{options?.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
                : <input id={key} type={field.type === 'tags' ? 'text' : field.type || 'text'} value={String(values[field.key] ?? '')} min={field.min} max={field.max} step={field.type === 'number' ? 'any' : undefined} maxLength={field.type === 'number' ? undefined : 1000} required={field.required} onChange={event => set(field.key, event.target.value)} />}
        </>}{field.hint && <small>{field.hint}</small>}
        {field.key === 'payoutAmount' && suggested !== null && <button type="button" className="mk-text-button" onClick={() => set('payoutAmount', suggested)}>Áp dụng giá gợi ý: {money(suggested, data.settings.currency)}</button>}
      </div>;
    })}
  </div><footer><Button onClick={close} disabled={busy}>Hủy</Button><Button kind="primary" type="submit" busy={busy}><FiCheck />{record ? 'Lưu thay đổi' : 'Tạo ' + definition.singular}</Button></footer></form></Dialog>;
}
