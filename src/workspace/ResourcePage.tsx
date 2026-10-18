import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FiPlus, FiSearch, FiDownload, FiEdit2, FiTrash2, FiArrowUpRight, FiCheckCircle, FiPlay, FiCopy } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useEditor, useWorkspace } from './context';
import { definitions, labels, enumLabels } from './definitions';
import { canEdit } from './permissions';
import { publicPath } from './publicApi';
import { Badge, Button, Dialog, Empty, PageHeader } from './ui';
import { dateLabel, errorMessage, exportCSV, money, propertyName, valueOf } from './utils';
import type { Automation, ResourceName, ResourceRecord, WorkspaceSnapshot } from '../../shared/workspace';

function display(record: ResourceRecord, key: string, data: WorkspaceSnapshot) {
  const value = valueOf(record, key);
  if (key === 'propertyId') return propertyName(data, value);
  if (key === 'propertyIds') return (Array.isArray(value) ? value : []).map(id => propertyName(data, id)).join(', ') || 'Chưa gắn phòng';
  if (['basePrice', 'payoutAmount', 'nightlyRate', 'amount'].includes(key)) return money(Number(value), data.settings.currency);
  if (['checkIn', 'checkOut', 'startDate', 'endDate', 'dueDate', 'date'].includes(key)) return dateLabel(String(value || ''));
  if (key === 'commissionRate') return `${Number(value || 0)}%`;
  if (key === 'scheduledAt') return value ? new Date(String(value)).toLocaleString('vi-VN') : 'Chưa lên lịch';
  if (typeof value === 'boolean') return value ? 'Có' : 'Chưa';
  if (Array.isArray(value)) return value.join(', ') || '—';
  return enumLabels[String(value)] || String(value ?? '—');
}

export default function ResourcePage({ resource }: { resource: ResourceName }) {
  const { data, save, request, reload } = useWorkspace(); const editor = useEditor();
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState(''); const [run, setRun] = useState<Automation | null>(null); const [context, setContext] = useState(''); const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams(); const editId = params.get('edit');
  useEffect(() => { if (data && editId) { const record = data[resource].find(item => item.id === editId); if (record) { editor.open(resource, record); setParams({}, { replace: true }); } } }, [data, editId, editor, resource, setParams]);
  useEffect(() => { setQuery(''); setFilter(''); }, [resource]);
  if (!data) return null;
  const editable = canEdit(data, resource);
  const definition = definitions[resource]; const all = data[resource] as ResourceRecord[];
  const filtered = all.filter(record => (!filter || String(valueOf(record, definition.filter || 'status')) === filter) && definition.columns.some(key => display(record, key, data).toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))));
  const filterOptions = definition.filter ? [...new Set(all.map(record => String(valueOf(record, definition.filter!))))] : [];
  const exportRows = () => exportCSV(`maoki-${resource}.csv`, [definition.columns.map(key => labels[key] || key), ...filtered.map(record => definition.columns.map(key => display(record, key, data)))]);
  const linkFor = (record: ResourceRecord) => resource === 'properties' && valueOf(record, 'published') ? publicPath(`/book/${record.id}`, data.capabilities.localDemo) : resource === 'guidebooks' && valueOf(record, 'published') ? publicPath(`/guide/${String(valueOf(record, 'publicToken'))}`, data.capabilities.localDemo) : '';
  const copy = async (path: string) => { try { await navigator.clipboard.writeText(location.origin + path); toast.success('Đã sao chép liên kết'); } catch { toast.error('Không sao chép được. Bạn có thể mở và sao chép địa chỉ trang.'); } };
  return <>
    <PageHeader eyebrow={['contacts', 'conversations', 'campaigns', 'replies'].includes(resource) ? 'KHÁCH HÀNG & SOCIAL' : 'KHÔNG GIAN VẬN HÀNH'} title={definition.title} description={definition.description}><Button onClick={exportRows} disabled={!filtered.length}><FiDownload />Xuất CSV</Button><Button disabled={!editable} kind="primary" onClick={() => editor.open(resource)}><FiPlus />Thêm {definition.singular}</Button></PageHeader>
    {resource === 'campaigns' && <div className="mk-alert"><span className="mk-dot amber" />Bản nháp và lịch gửi được lưu trong hệ thống. Chưa có chiến dịch nào gửi ra ngoài khi chưa kết nối API.</div>}
    {resource === 'integrations' && <div className="mk-alert"><span className="mk-dot amber" />Các kênh OTA và mạng xã hội đang ở chế độ chuẩn bị. Kết nối mô phỏng không gửi tin nhắn hoặc đồng bộ lịch bên ngoài. <Link to="../settings">Mở kênh chat Website <FiArrowUpRight /></Link></div>}
    <div className="mk-panel"><div className="mk-toolbar"><label className="mk-search"><FiSearch /><input aria-label={`Tìm ${definition.singular}`} placeholder={`Tìm ${definition.singular}…`} value={query} onChange={event => setQuery(event.target.value)} /></label><div className="mk-toolbar-end">{filterOptions.length > 0 && <select aria-label="Lọc trạng thái" value={filter} onChange={event => setFilter(event.target.value)}><option value="">Tất cả trạng thái</option>{filterOptions.map(value => <option key={value} value={value}>{value === 'true' ? 'Đã bật / xuất bản' : value === 'false' ? 'Chưa bật / xuất bản' : enumLabels[value] || value}</option>)}</select>}<span className="mk-count">{filtered.length} {definition.singular}</span></div></div>
    {!filtered.length ? <Empty title={query || filter ? 'Chưa tìm thấy kết quả' : `Chưa có ${definition.singular}`} text={query || filter ? 'Thử từ khóa hoặc bộ lọc khác.' : 'Thêm bản ghi đầu tiên để bắt đầu quản lý tại đây.'} action={!all.length ? `Thêm ${definition.singular}` : undefined} onAction={() => editor.open(resource)} /> : resource === 'properties' ? <div className="mk-property-grid">{filtered.map(record => {
      const images = valueOf(record, 'imageURLs') as string[] | undefined;
      return <article className="mk-property" key={record.id}><div className="mk-property-image">{images?.[0] ? <img src={images[0]} alt={String(valueOf(record, 'title'))} loading="lazy" /> : <span>MAOKI / STAY</span>}<Badge value={String(valueOf(record, 'status'))} /></div><div className="mk-property-body"><h2>{String(valueOf(record, 'title'))}</h2><p>{String(valueOf(record, 'address') || 'Chưa có địa chỉ')}</p><div className="mk-property-meta"><span>{Number(valueOf(record, 'bedrooms') || 1)} phòng ngủ · {Number(valueOf(record, 'capacity') || 2)} khách</span><strong>{money(Number(valueOf(record, 'basePrice')), data.settings.currency)}<small> / đêm</small></strong></div><footer><Button disabled={!editable} onClick={() => editor.open(resource, record)}><FiEdit2 />Chi tiết phòng</Button>{linkFor(record) && <Link className="mk-icon-button" to={linkFor(record)} target="_blank" rel="noreferrer" aria-label={`Mở trang đặt ${String(valueOf(record, 'title'))}`}><FiArrowUpRight /></Link>}<button disabled={!editable} className="mk-icon-button danger" aria-label={`Xóa ${String(valueOf(record, 'title'))}`} onClick={() => editor.confirmDelete(resource, record)}><FiTrash2 /></button></footer></div></article>;
    })}</div> : <div className="mk-table-scroll"><table className="mk-table"><thead><tr>{definition.columns.map(key => <th key={key} scope="col">{labels[key] || key}</th>)}<th scope="col"><span className="mk-sr">Thao tác</span></th></tr></thead><tbody>{filtered.map(record => <tr key={record.id}>{definition.columns.map((key, index) => <td key={key} className={index === 0 ? 'mk-primary-cell' : ''}>{['status', 'stage', 'priority', 'platform', 'source', 'channel'].includes(key) ? <Badge value={String(valueOf(record, key))} /> : ['enabled', 'published', 'closed'].includes(key) ? <Badge value={valueOf(record, key) ? 'active' : 'inactive'}>{valueOf(record, key) ? 'Đã bật' : 'Chưa bật'}</Badge> : display(record, key, data)}</td>)}<td><div className="mk-row-actions">
      {resource === 'contacts' && <Link className="mk-icon-button" aria-label="Xem hội thoại của khách" to={`../messages?contact=${record.id}`}><FiArrowUpRight /></Link>}
      {editable && resource === 'tasks' && valueOf(record, 'status') !== 'done' && <button className="mk-icon-button" aria-label="Hoàn tất công việc" onClick={() => void save('tasks', { status: 'done' }, record.id).then(() => toast.success('Công việc đã hoàn tất')).catch(cause => toast.error(errorMessage(cause)))}><FiCheckCircle /></button>}
      {editable && resource === 'automations' && <button className="mk-icon-button" aria-label="Chạy quy tắc" onClick={() => { setRun(record as Automation); setContext(''); }}><FiPlay /></button>}
      {linkFor(record) && <><Link className="mk-icon-button" to={linkFor(record)} target="_blank" rel="noreferrer" aria-label="Xem trang đã xuất bản"><FiArrowUpRight /></Link><button className="mk-icon-button" aria-label="Sao chép liên kết" onClick={() => void copy(linkFor(record))}><FiCopy /></button></>}
      <button disabled={!editable} className="mk-icon-button" aria-label={`Chỉnh sửa ${String(valueOf(record, definition.labelKey))}`} onClick={() => editor.open(resource, record)}><FiEdit2 /></button><button disabled={!editable} className="mk-icon-button danger" aria-label={`Xóa ${String(valueOf(record, definition.labelKey))}`} onClick={() => editor.confirmDelete(resource, record)}><FiTrash2 /></button>
    </div></td></tr>)}</tbody></table></div>}</div>
    {run && <Dialog title="Chạy quy tắc" onClose={() => setRun(null)} busy={busy}><div className="mk-dialog-body"><h3>{run.name}</h3><p>Thao tác sẽ thực hiện trên bản ghi được chọn và lưu vào lịch sử.</p><label className="mk-field">{run.action === 'create_task' ? 'Đặt phòng' : 'Hội thoại'}<select value={context} onChange={event => setContext(event.target.value)}><option value="">Chọn bản ghi</option>{(run.action === 'create_task' ? data.bookings : data.conversations).map(item => <option key={item.id} value={item.id}>{item.guestName}</option>)}</select></label></div><footer><Button onClick={() => setRun(null)}>Hủy</Button><Button kind="primary" disabled={!context || !run.enabled} busy={busy} onClick={() => { setBusy(true); void request(`/automations/${run.id}/run`, { [run.action === 'create_task' ? 'bookingId' : 'conversationId']: context }).then(async () => { await reload(); setRun(null); toast.success('Quy tắc đã thực hiện'); }).catch(cause => toast.error(errorMessage(cause))).finally(() => setBusy(false)); }}><FiPlay />Chạy quy tắc</Button></footer></Dialog>}
  </>;
}
