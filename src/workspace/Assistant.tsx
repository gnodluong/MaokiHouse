import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FiCopy, FiSend, FiSquare, FiTrash2, FiCpu, FiSettings, FiCheckCircle, FiKey } from 'react-icons/fi';
import { useSession } from './Session';
import { Button, PageHeader, SectionTitle } from './ui';
import { errorMessage } from './utils';
import { aiRequest, saveAISettings, DEFAULT_AI_MODEL } from './aiClient';
import type { AIStatus } from './aiClient';

interface Message { role: 'user' | 'model'; text: string }
const prompts = ['Soạn tin chào mừng khách sắp nhận phòng', 'Gợi ý xử lý khi khách trả phòng trễ', 'Viết bài Facebook giới thiệu một kỳ nghỉ tại MaokiHouse', 'Tóm tắt tình hình vận hành và việc cần ưu tiên'];
const keyPattern = /^sk-or-[A-Za-z0-9_-]{16,200}$/;
const modelPattern = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._:-]+$/;

function AISettings({ status, onChanged }: { status: AIStatus; onChanged: () => Promise<void> }) {
  const [apiKey, setApiKey] = useState(''); const [model, setModel] = useState(status.model || DEFAULT_AI_MODEL); const [allowAgents, setAllowAgents] = useState(status.allowAgents);
  const [busy, setBusy] = useState<'' | 'save' | 'test' | 'clear'>(''); const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  useEffect(() => { setModel(status.model || DEFAULT_AI_MODEL); setAllowAgents(status.allowAgents); }, [status.model, status.allowAgents]);
  const keyInvalid = apiKey.trim() !== '' && !keyPattern.test(apiKey.trim());
  const modelInvalid = !modelPattern.test(model.trim());
  const test = async () => {
    setBusy('test'); setMessage(null);
    try { const result = await aiRequest<{ model: string }>('POST', new AbortController().signal, { action: 'test' }); setMessage({ kind: 'success', text: `Kết nối được OpenRouter với model ${result.model}.` }); }
    catch (cause) { setMessage({ kind: 'error', text: errorMessage(cause) }); }
    finally { setBusy(''); }
  };
  const save = async () => {
    setBusy('save'); setMessage(null);
    try {
      await saveAISettings('save', { ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), model: model.trim(), allowAgents });
      setApiKey(''); await onChanged();
      if (apiKey.trim() || status.configured || status.source === 'server') await test(); else setMessage({ kind: 'success', text: 'Đã lưu cài đặt.' });
    } catch (cause) { setMessage({ kind: 'error', text: errorMessage(cause) }); }
    finally { setBusy(prev => (prev === 'save' ? '' : prev)); }
  };
  const clear = async () => {
    setBusy('clear'); setMessage(null);
    try { await saveAISettings('clear'); await onChanged(); setMessage({ kind: 'success', text: 'Đã xóa API key khỏi MaokiHouse.' }); }
    catch (cause) { setMessage({ kind: 'error', text: errorMessage(cause) }); }
    finally { setBusy(''); }
  };
  return <section className="mk-panel" aria-label="Cài đặt AI">
    <SectionTitle title="Cài đặt AI" />
    <div className="mk-ai-settings">
      <div className="mk-key-state"><FiKey aria-hidden="true" />
        {status.source === 'server' && status.provider === 'OpenRouter' ? <span>Đang dùng key OpenRouter đặt trên Vercel (<code>OPENROUTER_API_KEY</code>), được ưu tiên hơn key lưu trong web.</span>
          : status.configured && status.provider === 'OpenRouter' ? <span>Đã lưu key OpenRouter <code>sk-or-…{status.keyHint}</code>. Key không bao giờ hiển thị lại trong trình duyệt.</span>
          : status.provider === 'Gemini' && status.configured ? <span>Đang dùng Gemini đặt trên Vercel. Dán key OpenRouter bên dưới để chuyển sang OpenRouter.</span>
          : <span>Chưa có API key. Làm theo 3 bước dưới đây.</span>}
      </div>
      {!status.configured && <ol className="mk-howto"><li>Mở <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a>, đăng nhập và bấm <strong>Create Key</strong> (nên đặt giới hạn chi tiêu).</li><li>Sao chép key bắt đầu bằng <code>sk-or-</code> và dán vào ô bên dưới.</li><li>Bấm <strong>Lưu và kiểm tra</strong>. Khi thấy thông báo xanh là trợ lý đã sẵn sàng.</li></ol>}
      <div className="mk-form-grid">
        <label className="mk-field">API key OpenRouter<input type="password" autoComplete="off" spellCheck={false} value={apiKey} placeholder={status.configured ? 'Để trống nếu giữ key hiện tại' : 'sk-or-v1-…'} aria-invalid={keyInvalid || undefined} onChange={event => setApiKey(event.target.value)} />{keyInvalid ? <small style={{ color: 'var(--mk-danger)' }}>Key OpenRouter bắt đầu bằng sk-or-</small> : <small>Lưu trong Supabase, chỉ máy chủ đọc được khi gọi AI.</small>}</label>
        <label className="mk-field">Model<input value={model} spellCheck={false} aria-invalid={modelInvalid || undefined} onChange={event => setModel(event.target.value)} /><small>{model.trim() === DEFAULT_AI_MODEL ? 'Mặc định: miễn phí, có giới hạn lượt dùng mỗi phút/ngày.' : <>Tên model trên OpenRouter. <button type="button" className="mk-text-button" onClick={() => setModel(DEFAULT_AI_MODEL)}>Dùng mặc định</button></>}</small></label>
        <label className="mk-checkbox full"><input type="checkbox" checked={allowAgents} onChange={event => setAllowAgents(event.target.checked)} />Cho phép nhân viên (vai trò Nhân viên) dùng trợ lý AI</label>
      </div>
      <p className="mk-inline-help">Nhân viên được phép dùng AI về mặt kỹ thuật có thể truy xuất key qua API. Nếu cần giấu key hoàn toàn, đặt <code>OPENROUTER_API_KEY</code> trên Vercel. Model miễn phí của OpenRouter có thể lưu lời nhắc để cải thiện dịch vụ; không dán thông tin nhạy cảm của khách.</p>
      {message && <p className={`mk-alert ${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.kind === 'success' && <FiCheckCircle aria-hidden="true" />}{message.text}</p>}
      <div className="mk-inline-actions">
        <Button kind="primary" busy={busy === 'save'} disabled={!!busy || keyInvalid || modelInvalid} onClick={() => void save()}>Lưu và kiểm tra</Button>
        <Button busy={busy === 'test'} disabled={!!busy || !status.configured} onClick={() => void test()}>Kiểm tra kết nối</Button>
        {status.configured && status.source === 'workspace' && <Button kind="quiet" busy={busy === 'clear'} disabled={!!busy} onClick={() => void clear()}>Xóa key</Button>}
      </div>
    </div>
  </section>;
}

export default function Assistant() {
  const { mode, user } = useSession(); const location = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>(location.state?.draft || '');
  const [includeContext, setIncludeContext] = useState(false);
  const [status, setStatus] = useState<AIStatus | null>(null); const [showSettings, setShowSettings] = useState(false);
  const [checking, setChecking] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [copied, setCopied] = useState(false);
  const request = useRef<AbortController>(); const log = useRef<HTMLDivElement>(null);
  const refresh = useCallback(async () => {
    const result = await aiRequest<AIStatus>('GET', new AbortController().signal);
    setStatus(result); if (!result.configured && result.canManage) setShowSettings(true);
  }, []);
  useEffect(() => {
    if (mode === 'demo') { setChecking(false); return; }
    let alive = true;
    void refresh().catch(cause => { if (alive) setError(errorMessage(cause)); }).finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; request.current?.abort(); };
  }, [mode, user?.id, refresh]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, busy]);
  const ready = Boolean(status?.configured && status.canUse !== false);
  const send = async (text: string) => {
    if (!text.trim() || busy || !ready || mode === 'demo') return;
    const history: Message[] = [...messages, { role: 'user' as const, text: text.trim() }].slice(-19);
    const previous = messages; setMessages(history); setInput(''); setBusy(true); setError(''); setCopied(false);
    const controller = new AbortController(); request.current = controller;
    try { const result = await aiRequest<{ reply: string }>('POST', controller.signal, { history, includeContext }); setMessages([...history, { role: 'model', text: result.reply }]); }
    catch (cause) { setMessages(previous); setInput(text); if (!controller.signal.aborted) setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(messages.at(-1)?.text || ''); setCopied(true); } catch { setError('Hãy chọn nội dung trả lời và sao chép thủ công.'); } };
  const providerName = status?.provider === 'Gemini' ? 'Gemini' : 'OpenRouter';
  return <><PageHeader title="Trợ lý AI" description={status?.configured ? `Soạn tin cho khách, viết nội dung và tóm tắt vận hành · ${providerName} · ${status.model}` : 'Soạn tin cho khách, viết nội dung và tóm tắt vận hành bằng AI qua OpenRouter.'}>
    {status?.canManage && <Button onClick={() => setShowSettings(value => !value)} className={showSettings ? 'is-pressed' : ''}><FiSettings />{showSettings ? 'Ẩn cài đặt AI' : 'Cài đặt AI'}</Button>}
    <Button disabled={busy || !messages.length} onClick={() => { setMessages([]); setError(''); setCopied(false); }}><FiTrash2 />Cuộc trò chuyện mới</Button>
  </PageHeader>
    {mode === 'demo' ? <p className="mk-alert">Đăng nhập bằng tài khoản Supabase để dùng trợ lý AI với dữ liệu thật.</p>
      : checking ? <p role="status" className="mk-alert">Đang kiểm tra kết nối AI…</p>
      : status?.needsUpgrade ? <p className="mk-alert">Cần chạy SQL “Cập nhật” một lần để lưu API key trong web. <Link className="mk-subtle-link" to="/setup?mode=upgrade">Mở trang Thiết lập</Link></p>
      : status && !status.configured && !status.canManage ? <p className="mk-alert">Trợ lý AI chưa được bật. Nhờ chủ không gian hoặc quản lý mở Trợ lý AI → Cài đặt AI để dán API key.</p>
      : status?.configured && !status.canUse ? <p className="mk-alert">Chủ không gian chưa cho phép vai trò của bạn dùng trợ lý AI.</p> : null}
    {error && <p className="mk-alert error" role="alert">{error}</p>}
    {status && showSettings && status.canManage && !status.needsUpgrade && <AISettings status={status} onChanged={refresh} />}
    <section className="mk-panel mk-ai-panel" aria-label="Trò chuyện với trợ lý AI"><div className="mk-ai-messages" ref={log} role="log" tabIndex={0} aria-label="Cuộc trò chuyện với AI">
      {!messages.length ? <div className="mk-ai-welcome"><span className="mk-ai-symbol"><FiCpu /></span><h2>Bạn cần soạn gì hôm nay?</h2><p>Gõ câu hỏi bên dưới hoặc chọn một gợi ý.</p><div className="mk-ai-prompts">{prompts.map(prompt => <button key={prompt} disabled={!ready || busy} onClick={() => setInput(prompt)}>{prompt}</button>)}</div></div> : messages.map((message, index) => <article className={`mk-ai-message ${message.role}`} key={index}><strong>{message.role === 'user' ? 'Bạn' : 'Trợ lý Maoki'}</strong><p>{message.text}</p></article>)}
      {busy && <p role="status" className="mk-muted">Trợ lý đang soạn…</p>}
    </div><div className="mk-ai-controls"><label className="mk-checkbox"><input type="checkbox" checked={includeContext} disabled={busy || mode === 'demo'} onChange={event => setIncludeContext(event.target.checked)} />Dùng số liệu vận hành của không gian hiện tại</label><p className="mk-field-hint">Câu hỏi được gửi tới {providerName}. Khi bật số liệu, chỉ gửi thông tin phòng và thống kê vận hành; không gửi danh bạ, tin nhắn khách hoặc mật khẩu Wi-Fi.</p>
      <form onSubmit={event => { event.preventDefault(); void send(input); }}><label className="mk-sr" htmlFor="ai-question">Câu hỏi cho trợ lý</label><textarea id="ai-question" rows={3} maxLength={4000} value={input} disabled={busy || !ready} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void send(input); } }} placeholder={ready ? 'Ví dụ: Soạn tin nhắc khách giờ nhận phòng 14:00 (Ctrl + Enter để gửi)' : 'Cần cài đặt API key trước khi hỏi'} /><div className="mk-ai-actions"><small>AI có thể nhầm. Kiểm tra trước khi dùng; trợ lý không tự gửi tin hoặc sửa dữ liệu.</small>{busy ? <Button onClick={() => request.current?.abort()}><FiSquare />Dừng</Button> : <Button type="submit" kind="primary" disabled={!input.trim() || !ready}><FiSend />Gửi câu hỏi</Button>}</div></form>
      {messages.at(-1)?.role === 'model' && <Button onClick={() => void copy()}><FiCopy />{copied ? 'Đã sao chép' : 'Sao chép câu trả lời'}</Button>}
    </div></section>
  </>;
}
