import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, ArrowLeft, BarChart3, Boxes, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, FileSearch, LayoutDashboard, RefreshCw, RotateCcw, Search, Settings2, ShieldCheck, Webhook } from "lucide-react";
import { api } from "./api";
import type { Dashboard, ExceptionCase, Order, TraceEvent } from "./types";
import "./styles.css";

type View = "overview" | "orders" | "exceptions" | "open-platform";
const money = (value: number) => `¥${(value / 100).toFixed(2)}`;
const dateTime = (value: string) => new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
const labels: Record<string, string> = { FULFILLED: "已履约", PAID: "已支付待履约", PAYING: "支付中", PENDING_PAYMENT: "待支付", REFUNDED: "已退款", ACTIVE: "生效", GRANT_FAILED: "发放失败", RESOLVED: "已解决", DETECTED: "待处理" };

function App() {
  const [view, setView] = useState<View>("overview");
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionCase[]>([]);
  const [selected, setSelected] = useState<Order>();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const [metrics, orderList, exceptionList] = await Promise.all([api.dashboard(), api.orders(), api.exceptions()]);
    setDashboard(metrics); setOrders(orderList); setExceptions(exceptionList);
    if (selected) setSelected(await api.order(selected.id));
  };
  useEffect(() => { void load().catch((reason: Error) => setError(reason.message)); }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((item) => [item.orderNo, item.userId, item.paymentAttempts[0]?.merchantTradeNo, item.paymentAttempts[0]?.providerTradeNo].some((value) => value?.toLowerCase().includes(term)));
  }, [orders, query]);

  const openOrder = async (id: string) => { setBusy(true); try { setSelected(await api.order(id)); } finally { setBusy(false); } };
  const retry = async (exceptionId: string) => {
    setBusy(true);
    try { setSelected(await api.retry(exceptionId)); await load(); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  return <div className="admin-shell">
    <aside className="sidebar">
      <div className="admin-brand"><span>M</span><div><b>MonetizeLab</b><small>交易运营台</small></div></div>
      <nav>
        <NavButton active={view === "overview"} onClick={() => { setView("overview"); setSelected(undefined); }} icon={<LayoutDashboard />} label="业务概览" />
        <NavButton active={view === "orders"} onClick={() => { setView("orders"); setSelected(undefined); }} icon={<FileSearch />} label="订单中心" />
        <NavButton active={view === "exceptions"} onClick={() => { setView("exceptions"); setSelected(undefined); }} icon={<AlertTriangle />} label="异常中心" badge={exceptions.filter((item) => item.status !== "RESOLVED").length} />
        <div className="nav-section">配置与研发对齐</div>
        <NavButton icon={<Boxes />} label="商品与权益" disabled />
        <NavButton active={view === "open-platform"} onClick={() => { setView("open-platform"); setSelected(undefined); }} icon={<Webhook />} label="开放平台" />
        <NavButton icon={<Settings2 />} label="渠道配置" disabled />
      </nav>
      <div className="environment"><span /><div><b>DEMO · LOCAL</b><small>API 连接正常</small></div></div>
    </aside>
    <div className="workspace">
      <header><div><b>{selected ? "统一交易详情" : view === "overview" ? "业务概览" : view === "orders" ? "订单中心" : view === "exceptions" ? "异常中心" : "开放平台"}</b><small>资金、订单与权益状态独立核对</small></div><div className="header-actions"><button onClick={() => void load()} title="刷新数据"><RefreshCw className={busy ? "spin" : ""} /></button><span>运营演示账号</span><i>OP</i></div></header>
      <main>
        {error && <div className="error"><AlertTriangle />{error}</div>}
        {selected ? <OrderDetail order={selected} busy={busy} onBack={() => setSelected(undefined)} onRetry={(id) => void retry(id)} /> : <>
          {view === "overview" && <Overview dashboard={dashboard} orders={orders} exceptions={exceptions} onOpen={(id) => void openOrder(id)} onSwitch={setView} />}
          {view === "orders" && <OrderCenter orders={filtered} query={query} onQuery={setQuery} onOpen={(id) => void openOrder(id)} />}
          {view === "exceptions" && <ExceptionCenter exceptions={exceptions} busy={busy} onOpen={(id) => void openOrder(id)} onRetry={(id) => void retry(id)} />}
          {view === "open-platform" && <OpenPlatformLab />}
        </>}
      </main>
    </div>
  </div>;
}

function NavButton({ icon, label, active, badge, disabled, onClick }: { icon: React.ReactNode; label: string; active?: boolean; badge?: number; disabled?: boolean; onClick?: () => void }) {
  return <button aria-label={label} className={active ? "active" : ""} onClick={onClick} disabled={disabled}>{icon}<span>{label}</span>{badge !== undefined && badge > 0 && <em>{badge}</em>}</button>;
}

function Overview({ dashboard, orders, exceptions, onOpen, onSwitch }: { dashboard: Dashboard | undefined; orders: Order[]; exceptions: ExceptionCase[]; onOpen: (id: string) => void; onSwitch: (view: View) => void }) {
  const metrics = [
    { label: "业务订单", value: dashboard?.orders ?? 0, hint: "累计创建", icon: <BarChart3 />, tone: "green" },
    { label: "支付成功率", value: `${dashboard?.paymentSuccessRate ?? 0}%`, hint: `${dashboard?.successfulPayments ?? 0} 笔已确认资金`, icon: <CircleDollarSign />, tone: "blue" },
    { label: "平均履约耗时", value: `${dashboard?.averageFulfillmentMs ?? 0} ms`, hint: "支付确认至权益生效", icon: <Clock3 />, tone: "gold" },
    { label: "待处理异常", value: dashboard?.openExceptions ?? 0, hint: "需补偿或人工介入", icon: <AlertTriangle />, tone: "red" },
  ];
  return <>
    <section className="section-heading"><div><p>OPERATIONS OVERVIEW</p><h1>商业化交易健康度</h1><span>演示数据实时聚合，口径见 PRD 的指标定义。</span></div><div className="live"><i />实时数据</div></section>
    <section className="metric-grid">{metrics.map((item) => <article key={item.label}><div className={`metric-icon ${item.tone}`}>{item.icon}</div><span>{item.label}</span><b>{item.value}</b><small>{item.hint}</small></article>)}</section>
    <section className="overview-grid">
      <div className="panel"><div className="panel-title"><div><h2>最近交易</h2><span>从业务订单查看组合状态</span></div><button onClick={() => onSwitch("orders")}>查看全部 <ChevronRight /></button></div><OrderTable orders={orders.slice(0, 6)} onOpen={onOpen} /></div>
      <div className="panel"><div className="panel-title"><div><h2>异常处理队列</h2><span>支付事实与权益补偿分离</span></div><button onClick={() => onSwitch("exceptions")}>进入中心 <ChevronRight /></button></div><div className="exception-mini">{exceptions.filter((item) => item.status !== "RESOLVED").slice(0, 5).map((item) => <button key={item.id} onClick={() => item.orderId && onOpen(item.orderId)}><span className={`severity ${item.severity.toLowerCase()}`}>{item.severity}</span><span><b>{formatException(item.exceptionCode)}</b><small>{item.order?.orderNo ?? item.orderId} · {dateTime(item.createdAt)}</small></span><ChevronRight /></button>)}{exceptions.every((item) => item.status === "RESOLVED") && <div className="all-clear"><CheckCircle2 /><p>当前没有待处理异常</p></div>}</div></div>
    </section>
  </>;
}

function OrderCenter({ orders, query, onQuery, onOpen }: { orders: Order[]; query: string; onQuery: (value: string) => void; onOpen: (id: string) => void }) {
  return <><section className="section-heading"><div><p>ORDER CENTER</p><h1>订单中心</h1><span>支持订单号、支付单号、渠道流水和用户标识查询。</span></div></section><div className="filterbar"><label><Search /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="搜索订单号 / 支付单号 / 渠道流水" /></label><button><Settings2 />全部状态</button><span>共 {orders.length} 条</span></div><div className="panel full"><OrderTable orders={orders} onOpen={onOpen} /></div></>;
}

function OrderTable({ orders, onOpen }: { orders: Order[]; onOpen: (id: string) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>订单 / 商品</th><th>用户</th><th>金额</th><th>支付状态</th><th>权益状态</th><th>创建时间</th><th /></tr></thead><tbody>{orders.map((order) => { const entitlement = order.items[0]?.entitlements?.[0]; return <tr key={order.id} onClick={() => onOpen(order.id)}><td><b>{order.orderNo}</b><small>{order.items[0]?.skuNameSnapshot}</small></td><td><span>{order.userId === "demo-user" ? "林墨（演示用户）" : order.userId}</span></td><td><b>{money(order.payableAmountMinor)}</b></td><td><Status value={order.paymentAttempts[0]?.status ?? "NOT_CREATED"} /></td><td><Status value={entitlement?.status ?? "NOT_CREATED"} /></td><td><span>{dateTime(order.createdAt)}</span></td><td><ChevronRight /></td></tr>; })}{orders.length === 0 && <tr><td colSpan={7} className="no-data">暂无订单</td></tr>}</tbody></table></div>;
}

function ExceptionCenter({ exceptions, busy, onOpen, onRetry }: { exceptions: ExceptionCase[]; busy: boolean; onOpen: (id: string) => void; onRetry: (id: string) => void }) {
  return <><section className="section-heading"><div><p>EXCEPTION CENTER</p><h1>异常中心</h1><span>自动重试优先，超过阈值后才转人工操作。</span></div></section><div className="panel full"><div className="table-wrap"><table><thead><tr><th>等级</th><th>异常类型 / 来源订单</th><th>状态</th><th>重试次数</th><th>发现时间</th><th>操作</th></tr></thead><tbody>{exceptions.map((item) => <tr key={item.id}><td><span className={`severity ${item.severity.toLowerCase()}`}>{item.severity}</span></td><td><b>{formatException(item.exceptionCode)}</b><small>{item.order?.orderNo ?? item.orderId}</small></td><td><Status value={item.status} /></td><td>{item.retryCount} / 4</td><td>{dateTime(item.createdAt)}</td><td className="actions">{item.orderId && <button onClick={() => onOpen(item.orderId!)}>查看链路</button>}{item.exceptionCode === "ENTITLEMENT_GRANT_FAILED" && item.status !== "RESOLVED" && <button className="action-primary" disabled={busy} onClick={() => onRetry(item.id)}><RotateCcw />人工补发</button>}</td></tr>)}</tbody></table></div></div></>;
}

function OrderDetail({ order, busy, onBack, onRetry }: { order: Order; busy: boolean; onBack: () => void; onRetry: (id: string) => void }) {
  const entitlement = order.items[0]?.entitlements?.[0];
  const openException = order.exceptionCases?.find((item) => item.status !== "RESOLVED" && item.exceptionCode === "ENTITLEMENT_GRANT_FAILED");
  return <>
    <button className="back" onClick={onBack}><ArrowLeft />返回列表</button>
    <section className="detail-heading"><div><p>UNIFIED TRANSACTION TRACE</p><h1>{order.orderNo}</h1><span>{order.items[0]?.skuNameSnapshot} · {money(order.payableAmountMinor)}</span></div><Status value={order.status} /></section>
    <section className="object-state"><article><span>业务订单</span><b>{labels[order.status] ?? order.status}</b><code>{order.orderNo}</code></article><article><span>支付尝试</span><b>{order.paymentAttempts[0]?.status ?? "未创建"}</b><code>{order.paymentAttempts[0]?.merchantTradeNo ?? "-"}</code></article><article><span>渠道流水</span><b>{order.paymentAttempts[0]?.providerTradeNo ? "已获取" : "未获取"}</b><code>{order.paymentAttempts[0]?.providerTradeNo ?? "-"}</code></article><article><span>权益履约</span><b>{entitlement ? labels[entitlement.status] ?? entitlement.status : "未创建"}</b><code>{entitlement?.id ?? "-"}</code></article></section>
    {openException && <div className="compensation"><AlertTriangle /><div><b>资金已确认，但权益发放失败</b><span>订单保持 PAID，不允许用户重复付款。补发会复用原发放幂等键并记录操作原因。</span></div><button disabled={busy} onClick={() => onRetry(openException.id)}><RotateCcw />确认并补发权益</button></div>}
    <section className="detail-grid"><div className="panel trace-panel"><div className="panel-title"><div><h2>全链路事件</h2><span>按实际发生时间排序</span></div></div><Trace events={order.traceEvents ?? []} /></div><aside className="panel identifiers"><div className="panel-title"><div><h2>关联对象</h2><span>用于跨系统定位问题</span></div></div><KeyValue label="业务订单 ID" value={order.id} /><KeyValue label="用户 ID" value={order.userId} /><KeyValue label="支付尝试 ID" value={order.paymentAttempts[0]?.id ?? "-"} /><KeyValue label="权益 ID" value={entitlement?.id ?? "-"} /><KeyValue label="退款单号" value={order.refunds?.[0]?.refundNo ?? "-"} /></aside></section>
  </>;
}

function OpenPlatformLab() {
  const [context, setContext] = useState<Awaited<ReturnType<typeof api.oauthContext>>>();
  const [stage, setStage] = useState<"READY" | "AUTHORIZED" | "TOKEN" | "USERINFO" | "REVOKED">("READY");
  const [code, setCode] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [userInfo, setUserInfo] = useState<{ sub: string; name: string; email?: string; clientId: string; scope: string }>();
  const [checks, setChecks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const verifier = "monetizelab-demo-pkce-verifier-2026-secure-value";
  const state = "csrf-state-demo-2026";

  useEffect(() => { void api.oauthContext().then(setContext).catch((reason: Error) => setError(reason.message)); }, []);
  const app = context?.apps[0];

  const challenge = async () => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  };
  const authorize = async () => {
    if (!context || !app) return;
    setBusy(true); setError("");
    try {
      const result = await api.oauthAuthorize({ clientId: app.clientId, userId: context.user.id, redirectUri: app.redirectUris, scopes: "openid profile entitlements.read", state, codeChallenge: await challenge(), nonce: "nonce-demo-2026" });
      setCode(result.code); setChecks(result.securityChecks); setStage("AUTHORIZED");
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  };
  const exchange = async () => {
    if (!app) return;
    setBusy(true); setError("");
    try {
      const result = await api.oauthToken({ grantType: "authorization_code", clientId: app.clientId, code, redirectUri: app.redirectUris, codeVerifier: verifier });
      setAccessToken(result.accessToken); setStage("TOKEN");
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  };
  const fetchUserInfo = async () => {
    setBusy(true);
    try { setUserInfo(await api.oauthUserInfo(accessToken)); setStage("USERINFO"); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  };
  const revoke = async () => {
    setBusy(true);
    try { await api.oauthRevoke(accessToken); setStage("REVOKED"); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  };
  const reset = () => { setStage("READY"); setCode(""); setAccessToken(""); setUserInfo(undefined); setChecks([]); setError(""); };

  const stages = ["READY", "AUTHORIZED", "TOKEN", "USERINFO"];
  const stageIndex = stage === "REVOKED" ? 4 : stages.indexOf(stage);
  return <>
    <section className="section-heading"><div><p>OAUTH 2.0 · AUTHORIZATION CODE + PKCE</p><h1>开放平台认证实验台</h1><span>模拟第三方应用申请授权、换取 Token、访问用户信息和撤销凭证。</span></div><div className="live"><i />本地协议演示</div></section>
    {error && <div className="error"><AlertTriangle />{error}</div>}
    <section className="oauth-steps">
      {["发起授权", "返回授权码", "换取 Token", "访问资源"].map((label, index) => <div className={stageIndex >= index ? "done" : ""} key={label}><span>{stageIndex > index ? "✓" : index + 1}</span><b>{label}</b></div>)}
    </section>
    <section className="oauth-layout">
      <div className="panel oauth-config"><div className="panel-title"><div><h2>授权请求</h2><span>第三方应用传入的公开参数</span></div></div>
        <KeyValue label="client_id" value={app?.clientId ?? "加载中…"} /><KeyValue label="redirect_uri（精确白名单）" value={app?.redirectUris ?? "加载中…"} /><KeyValue label="scope" value="openid profile entitlements.read" /><KeyValue label="state（防 CSRF）" value={state} /><KeyValue label="code_challenge_method" value="S256" />
        <div className="oauth-action">{stage === "READY" && <button onClick={() => void authorize()} disabled={busy}><ShieldCheck />模拟用户同意授权</button>}{stage === "AUTHORIZED" && <button onClick={() => void exchange()} disabled={busy}><Webhook />后端用 code + verifier 换 Token</button>}{stage === "TOKEN" && <button onClick={() => void fetchUserInfo()} disabled={busy}><FileSearch />携带 Bearer Token 访问 UserInfo</button>}{stage === "USERINFO" && <button onClick={() => void revoke()} disabled={busy}><AlertTriangle />撤销 Access Token</button>}{stage === "REVOKED" && <button onClick={reset}><RotateCcw />重新演示</button>}</div>
      </div>
      <div className="panel oauth-result"><div className="panel-title"><div><h2>协议产物与校验</h2><span>敏感凭证在正式系统中只展示一次</span></div><Status value={stage} /></div>
        {stage === "READY" && <div className="oauth-empty"><Webhook /><b>等待发起授权</b><span>授权码由授权服务器生成，不经过用户端持久化。</span></div>}
        {code && <KeyValue label="authorization_code（一次性，5 分钟）" value={`${code.slice(0, 25)}…`} />}
        {checks.map((item) => <div className="security-check" key={item}><CheckCircle2 />{item}</div>)}
        {accessToken && <KeyValue label="access_token（数据库只存 SHA-256 哈希）" value={`${accessToken.slice(0, 25)}…`} />}
        {userInfo && <div className="userinfo"><b>受保护资源返回</b><pre>{JSON.stringify(userInfo, null, 2)}</pre></div>}
        {stage === "REVOKED" && <div className="revoked"><CheckCircle2 /><span><b>Token 已撤销</b><small>再次访问 UserInfo 将返回 401。</small></span></div>}
      </div>
    </section>
    <section className="auth-boundary"><div><ShieldCheck /><span><b>第三方登录</b><small>外部身份 → 内部用户映射，解决“你是谁”</small></span></div><ChevronRight /><div><Webhook /><span><b>开放平台授权</b><small>用户允许应用访问 scope，解决“应用能做什么”</small></span></div></section>
  </>;
}

function Trace({ events }: { events: TraceEvent[] }) { return <div className="trace">{events.map((event) => <div key={event.id}><span className="trace-icon">{event.eventType.includes("FAILED") || event.eventType.includes("REJECTED") ? <AlertTriangle /> : event.eventType.includes("PAYMENT") ? <CircleDollarSign /> : event.eventType.includes("ENTITLEMENT") ? <ShieldCheck /> : <CheckCircle2 />}</span><div><b>{event.summary}</b><span><code>{event.eventType}</code> · {event.actorType}</span><small>correlation_id: {event.correlationId}</small></div><time>{dateTime(event.occurredAt)}</time></div>)}</div>; }
function KeyValue({ label, value }: { label: string; value: string }) { return <div className="key-value"><span>{label}</span><code>{value}</code></div>; }
function Status({ value }: { value: string }) { return <span className={`status status-${value.toLowerCase()}`}>{labels[value] ?? value}</span>; }
function formatException(value: string) { return value === "ENTITLEMENT_GRANT_FAILED" ? "权益发放失败" : value === "PAYMENT_AMOUNT_MISMATCH" ? "支付金额不一致" : value; }

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
