import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FiCopy, FiSend, FiSquare, FiTrash2, FiZap } from 'react-icons/fi';
import { requireSupabase } from '../lib/supabase/client';
import { useSession } from './Session';
import { Button, PageHeader } from './ui';
import { errorMessage } from './utils';

interface Message { role: 'user' | 'model'; text: string }
const prompts = ['Soạn tin chào mừng khách sắp nhận phòng', 'Gợi ý xử lý khi khách trả phòng trễ', 'Viết bài Facebook giới thiệu một kỳ nghỉ tại MaokiHouse', 'Tóm tắt tình hình vận hành và việc cần ưu tiên'];

async function askAI(method: 'GET' | 'POST', signal: AbortSignal, body?: unknown) {
  const { data: { session } } = await requireSupabase().auth.getSession();
  if (!session) throw new Error('Vui lòng đăng nhập lại.');
  const response = await fetch('/api/assistant', { method, signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]), headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json().catch(() => null);
  if (!result) throw new Error(`API trợ lý chưa hoạt động (HTTP ${response.status}). Hãy triển khai bản mới nhất trên Vercel rồi tải lại trang.`);
  if (!response.ok || !result) throw new Error(result?.error || 'Chưa kết nối được trợ lý. Hãy kiểm tra cấu hình AI.');
  return result;
}

export default function Assistant() {
  const { mode, user } = useSession(); const location = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>(location.state?.draft || '');
  const [includeContext, setIncludeContext] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [copied, setCopied] = useState(false);
  const request = useRef<AbortController>(); const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    if (mode === 'demo') { setChecking(false); return; }
    void askAI('GET', controller.signal).then(result => setConfigured(result.configured)).catch(cause => { if (!controller.signal.aborted) setError(errorMessage(cause)); }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => { controller.abort(); request.current?.abort(); };
  }, [mode, user?.id]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, busy]);
  const send = async (text: string) => {
    if (!text.trim() || busy || !configured || mode === 'demo') return;
    const history: Message[] = [...messages, { role: 'user' as const, text: text.trim() }].slice(-19);
    const previous = messages; setMessages(history); setInput(''); setBusy(true); setError(''); setCopied(false);
    const controller = new AbortController(); request.current = controller;
    try { const result = await askAI('POST', controller.signal, { history, includeContext }); setMessages([...history, { role: 'model', text: result.reply }]); }
    catch (cause) { setMessages(previous); setInput(text); if (!controller.signal.aborted) setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(messages.at(-1)?.text || ''); setCopied(true); } catch { setError('Hãy chọn nội dung trả lời và sao chép thủ công.'); } };
  return <><PageHeader eyebrow="ĐỒNG HÀNH CÙNG MAOKI" title="Trợ lý AI" description="Soạn lời nhắn, viết nội dung và gợi ý công việc vận hành.">
    <Button disabled={busy || !messages.length} onClick={() => { setMessages([]); setError(''); setCopied(false); }}><FiTrash2 />Cuộc trò chuyện mới</Button>
  </PageHeader>
    {mode === 'demo' ? <p className="mk-alert">Đăng nhập bằng tài khoản Supabase để sử dụng Gemini với dữ liệu thật.</p> : checking ? <p role="status" className="mk-alert">Đang kiểm tra kết nối AI…</p> : configured === false ? <p className="mk-alert">Trợ lý đã có trong ứng dụng. Cần bật Gemini một lần trên Vercel. <Link className="mk-subtle-link" to="/setup#ai">Xem hướng dẫn bật AI</Link></p> : null}
    {error && <p className="mk-alert error" role="alert">{error} <Link to="/setup#ai" className="mk-subtle-link">Hướng dẫn thiết lập</Link></p>}
    <section className="mk-panel mk-ai-panel" aria-label="Trợ lý Gemini"><div className="mk-ai-messages" ref={log} role="log" tabIndex={0} aria-label="Cuộc trò chuyện với AI">
      {!messages.length ? <div className="mk-ai-welcome"><span className="mk-ai-symbol"><FiZap /></span><h2>Một người bạn trong ngày vận hành.</h2><p>Bắt đầu bằng câu hỏi của bạn, hoặc chọn một gợi ý bên dưới.</p><div className="mk-ai-prompts">{prompts.map(prompt => <button key={prompt} disabled={!configured || busy} onClick={() => setInput(prompt)}>{prompt}</button>)}</div></div> : messages.map((message, index) => <article className={`mk-ai-message ${message.role}`} key={index}><strong>{message.role === 'user' ? 'Bạn' : 'Trợ lý Maoki'}</strong><p>{message.text}</p></article>)}
      {busy && <p role="status" className="mk-muted">Gemini đang soạn gợi ý…</p>}
    </div><div className="mk-ai-controls"><label className="mk-checkbox"><input type="checkbox" checked={includeContext} disabled={busy || mode === 'demo'} onChange={event => setIncludeContext(event.target.checked)} />Dùng số liệu vận hành của không gian hiện tại</label><p className="mk-field-hint">Câu hỏi được gửi tới Google Gemini. Khi bật số liệu, chỉ gửi thông tin phòng và thống kê vận hành; không tự gửi danh bạ, tin nhắn khách hoặc mật khẩu Wi-Fi.</p>
      <form onSubmit={event => { event.preventDefault(); void send(input); }}><label className="mk-sr" htmlFor="ai-question">Câu hỏi cho trợ lý</label><textarea id="ai-question" rows={3} maxLength={4000} value={input} disabled={busy || !configured} onChange={event => setInput(event.target.value)} placeholder="Bạn cần Maoki hỗ trợ điều gì hôm nay?" /><div className="mk-ai-actions"><small>AI có thể nhầm. Kiểm tra trước khi sử dụng; trợ lý không tự gửi tin hoặc sửa dữ liệu.</small>{busy ? <Button onClick={() => request.current?.abort()}><FiSquare />Dừng</Button> : <Button type="submit" kind="primary" disabled={!input.trim() || !configured}><FiSend />Gửi câu hỏi</Button>}</div></form>
      {messages.at(-1)?.role === 'model' && <Button onClick={() => void copy()}><FiCopy />{copied ? 'Đã sao chép' : 'Sao chép câu trả lời'}</Button>}
    </div></section>
  </>;
}
