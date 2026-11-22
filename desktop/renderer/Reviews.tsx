import { useState } from 'react';
import toast from 'react-hot-toast';
import { FiRefreshCw, FiStar } from 'react-icons/fi';
import { useWorkspace } from '../../src/workspace/context';
import { Badge, Button, Empty, PageHeader, Stat } from '../../src/workspace/ui';
import { canEdit } from '../../src/workspace/permissions';
import { errorMessage } from '../../src/workspace/utils';
import { replyToReview, syncReviews } from '../../src/workspace/reviewsClient';
import type { GoogleReview } from '../../shared/workspace';

const filters: [string, string][] = [['all', 'Tất cả'], ['new', 'Mới'], ['replied', 'Đã phản hồi'], ['ignored', 'Bỏ qua']];
const stars = (rating: number) => '★'.repeat(rating) + '☆'.repeat(5 - rating);

function ReviewCard({ review, editable }: { review: GoogleReview; editable: boolean }) {
  const { data, save, reload } = useWorkspace(); const [text, setText] = useState(review.reply || ''); const [busy, setBusy] = useState(false);
  const reply = async () => {
    setBusy(true);
    try {
      const outcome = await replyToReview(review.id, text.trim());
      if (!outcome.ok) throw new Error(outcome.error || 'Không gửi được phản hồi');
      await save('reviews', { reply: text.trim(), repliedAt: outcome.repliedAt || new Date().toISOString(), status: 'replied' }, review.id); toast.success('Đã đăng phản hồi lên Google');
    } catch (cause) { toast.error(errorMessage(cause)); } finally { setBusy(false); }
  };
  const ignore = () => void save('reviews', { status: review.status === 'ignored' ? 'new' : 'ignored' }, review.id).then(reload).catch(cause => toast.error(errorMessage(cause)));
  return <article className="dk-review">
    <header><span className="dk-stars" aria-label={`${review.rating} sao`}>{stars(review.rating)}</span><strong>{review.reviewer}</strong><small>{review.reviewedAt ? new Date(review.reviewedAt).toLocaleDateString('vi-VN') : ''}</small><Badge value={review.status} /></header>
    {review.comment ? <p>{review.comment}</p> : <p className="dk-muted">Không có nội dung</p>}
    {editable && <div className="dk-review-reply">
      <label className="mk-sr" htmlFor={`reply-${review.id}`}>Phản hồi</label>
      <textarea id={`reply-${review.id}`} rows={2} value={text} placeholder="Viết phản hồi công khai…" onChange={event => setText(event.target.value)} />
      <div className="dk-inline">
        {data && data.replies.length > 0 && <select aria-label="Chèn mẫu trả lời" value="" onChange={event => { const item = data.replies.find(reply => reply.id === event.target.value); if (item) setText(item.content.replaceAll('{{guest}}', review.reviewer)); }}><option value="">Chèn mẫu trả lời</option>{data.replies.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select>}
        <Button kind="primary" busy={busy} disabled={!text.trim()} onClick={() => void reply()}>{review.reply ? 'Cập nhật phản hồi' : 'Đăng phản hồi'}</Button>
        <Button kind="quiet" onClick={ignore}>{review.status === 'ignored' ? 'Bỏ ẩn' : 'Bỏ qua'}</Button>
      </div></div>}
    {!editable && review.reply && <p className="dk-review-existing"><strong>Phản hồi:</strong> {review.reply}</p>}
  </article>;
}

export default function Reviews() {
  const { data, reload } = useWorkspace(); const [filter, setFilter] = useState('all'); const [busy, setBusy] = useState(false);
  if (!data) return null;
  const editable = canEdit(data, 'reviews') && ['owner', 'manager'].includes(data.capabilities.role || '');
  const all = [...data.reviews].sort((a, b) => (b.reviewedAt || '').localeCompare(a.reviewedAt || ''));
  const shown = all.filter(item => filter === 'all' || item.status === filter);
  const average = all.length ? (all.reduce((sum, item) => sum + item.rating, 0) / all.length).toFixed(1) : '—';
  const sync = async () => {
    setBusy(true);
    try { const outcome = await syncReviews(); if (!outcome.ok) throw new Error(outcome.error || 'Không đồng bộ được'); await reload(); toast.success(`Đã đồng bộ ${outcome.fetched ?? 0} đánh giá (${outcome.added ?? 0} mới)`); }
    catch (cause) { toast.error(errorMessage(cause)); } finally { setBusy(false); }
  };
  return <>
    <PageHeader title="Đánh giá Google" description="Xem và trả lời đánh giá của khách trên Google Business Profile ngay trong ứng dụng."><Button kind="primary" busy={busy} disabled={!editable} onClick={() => void sync()}><FiRefreshCw />Đồng bộ từ Google</Button></PageHeader>
    <div className="mk-stats-grid"><Stat label="Điểm trung bình" value={average} note={`${all.length} đánh giá`} icon={<FiStar />} /><Stat label="Chưa phản hồi" value={all.filter(item => item.status === 'new').length} note="Cần xử lý" icon={<FiStar />} /><Stat label="Đã phản hồi" value={all.filter(item => item.status === 'replied').length} note="Đã đăng lên Google" icon={<FiStar />} /><Stat label="1–2 sao" value={all.filter(item => item.rating <= 2).length} note="Cần chú ý" icon={<FiStar />} /></div>
    <div className="mk-segment" role="group" aria-label="Lọc đánh giá">{filters.map(([value, label]) => <button key={value} type="button" className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>
    {!editable && <div className="mk-alert">Chỉ chủ không gian và quản lý được đồng bộ và trả lời đánh giá.</div>}
    {shown.length ? <div className="dk-reviews">{shown.map(review => <ReviewCard key={review.id} review={review} editable={editable} />)}</div> : <Empty title="Chưa có đánh giá" text="Bật Google Business trong Kênh nhắn tin rồi bấm Đồng bộ từ Google." />}
  </>;
}
