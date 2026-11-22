import { useState } from 'react';
import toast from 'react-hot-toast';
import { FiExternalLink, FiMessageCircle, FiRefreshCw, FiThumbsUp } from 'react-icons/fi';
import { useWorkspace } from '../../src/workspace/context';
import { Badge, Button, Empty, PageHeader, Stat } from '../../src/workspace/ui';
import { errorMessage } from '../../src/workspace/utils';
import { replyToYouTube, syncYouTube } from '../../src/workspace/youtubeClient';
import type { YouTubeComment } from '../../shared/workspace';

const filters: [string, string][] = [['all', 'Tất cả'], ['new', 'Mới'], ['replied', 'Đã phản hồi'], ['ignored', 'Bỏ qua']];

function CommentCard({ comment }: { comment: YouTubeComment }) {
  const { data, save, reload } = useWorkspace(); const [text, setText] = useState(comment.reply || ''); const [busy, setBusy] = useState(false);
  const reply = async () => {
    setBusy(true);
    try {
      const outcome = await replyToYouTube(comment.id, text.trim());
      if (!outcome.ok) throw new Error(outcome.error || 'Không gửi được phản hồi');
      await save('ytComments', { reply: text.trim(), repliedAt: outcome.repliedAt || new Date().toISOString(), status: 'replied' }, comment.id); toast.success('Đã đăng phản hồi lên YouTube');
    } catch (cause) { toast.error(errorMessage(cause)); } finally { setBusy(false); }
  };
  const ignore = () => void save('ytComments', { status: comment.status === 'ignored' ? 'new' : 'ignored' }, comment.id).then(reload).catch(cause => toast.error(errorMessage(cause)));
  return <article className="dk-review">
    <header><strong>{comment.author}</strong><small>{comment.publishedAt ? new Date(comment.publishedAt).toLocaleDateString('vi-VN') : ''}</small>{comment.likes > 0 && <span className="dk-muted"><FiThumbsUp aria-hidden="true" /> {comment.likes}</span>}{comment.videoId && <a className="mk-subtle-link" href={`https://www.youtube.com/watch?v=${encodeURIComponent(comment.videoId)}&lc=${encodeURIComponent(comment.commentId)}`} target="_blank" rel="noreferrer">Xem trên YouTube <FiExternalLink aria-hidden="true" /></a>}<Badge value={comment.status} /></header>
    <p>{comment.text}</p>
    <div className="dk-review-reply">
      <label className="mk-sr" htmlFor={`yt-${comment.id}`}>Phản hồi</label>
      <textarea id={`yt-${comment.id}`} rows={2} value={text} placeholder="Viết phản hồi công khai…" onChange={event => setText(event.target.value)} />
      <div className="dk-inline">
        {data && data.replies.length > 0 && <select aria-label="Chèn mẫu trả lời" value="" onChange={event => { const item = data.replies.find(entry => entry.id === event.target.value); if (item) setText(item.content.replaceAll('{{guest}}', comment.author)); }}><option value="">Chèn mẫu trả lời</option>{data.replies.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select>}
        <Button kind="primary" busy={busy} disabled={!text.trim() || comment.status === 'replied' && text.trim() === comment.reply} onClick={() => void reply()}>{comment.reply ? 'Đăng thêm phản hồi' : 'Đăng phản hồi'}</Button>
        <Button kind="quiet" onClick={ignore}>{comment.status === 'ignored' ? 'Bỏ ẩn' : 'Bỏ qua'}</Button>
      </div></div>
  </article>;
}

export default function YouTube() {
  const { data, reload } = useWorkspace(); const [filter, setFilter] = useState('all'); const [busy, setBusy] = useState(false);
  if (!data) return null;
  const manage = ['owner', 'manager'].includes(data.capabilities.role || '');
  const all = [...data.ytComments].sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  const shown = all.filter(item => filter === 'all' || item.status === filter);
  const sync = async () => {
    setBusy(true);
    try { const outcome = await syncYouTube(); if (!outcome.ok) throw new Error(outcome.error || 'Không đồng bộ được'); await reload(); toast.success(`Đã đồng bộ ${outcome.fetched ?? 0} bình luận (${outcome.added ?? 0} mới)`); }
    catch (cause) { toast.error(errorMessage(cause)); } finally { setBusy(false); }
  };
  return <>
    <PageHeader title="Bình luận YouTube" description="Xem và trả lời bình luận trên các video của kênh YouTube ngay trong ứng dụng."><Button kind="primary" busy={busy} disabled={!manage} onClick={() => void sync()}><FiRefreshCw />Đồng bộ từ YouTube</Button></PageHeader>
    <div className="mk-stats-grid"><Stat label="Bình luận" value={all.length} note="Đã đồng bộ" icon={<FiMessageCircle />} /><Stat label="Chưa phản hồi" value={all.filter(item => item.status === 'new').length} note="Cần xử lý" icon={<FiMessageCircle />} /><Stat label="Đã phản hồi" value={all.filter(item => item.status === 'replied').length} note="Đã đăng lên YouTube" icon={<FiMessageCircle />} /><Stat label="Lượt thích" value={all.reduce((sum, item) => sum + item.likes, 0)} note="Trên các bình luận" icon={<FiThumbsUp />} /></div>
    <div className="mk-segment" role="group" aria-label="Lọc bình luận">{filters.map(([value, label]) => <button key={value} type="button" className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>
    {!manage && <div className="mk-alert">Chỉ chủ không gian và quản lý được đồng bộ và trả lời bình luận.</div>}
    {shown.length ? <div className="dk-reviews">{shown.map(comment => <CommentCard key={comment.id} comment={comment} />)}</div> : <Empty title="Chưa có bình luận" text="Bật YouTube trong Kênh nhắn tin rồi bấm Đồng bộ từ YouTube." />}
  </>;
}
