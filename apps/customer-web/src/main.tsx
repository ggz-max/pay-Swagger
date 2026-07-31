import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertCircle, ArrowLeft, Check, ChevronRight, Clock3, CreditCard, PackageCheck, ReceiptText, RefreshCw, RotateCcw, ShieldCheck, Sparkles, UserRound, WalletCards } from "lucide-react";
import { api } from "./api";
import type { Bootstrap, Order, Product, Sku } from "./types";
import "./styles.css";

type View = "catalog" | "orders" | "entitlements";
type Outcome = "SUCCESS" | "ENTITLEMENT_FAILURE" | "FAILURE" | "AMOUNT_MISMATCH";

const money = (value: number) => `¥${(value / 100).toFixed(2)}`;
const time = (value: string) => new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));

const statusLabel: Record<string, string> = {
  PENDING_PAYMENT: "待支付", PAYING: "支付确认中", PAID: "已支付·权益处理中", FULFILLED: "交易完成",
  REFUNDED: "已退款", CLOSED: "已关闭", ACTIVE: "已生效", GRANT_FAILED: "发放失败", REVOKED: "已回收",
};

function ProductIcon({ type }: { type: string }) {
  return type === "MEMBERSHIP" ? <Sparkles size={24} /> : <WalletCards size={24} />;
}

function App() {
  const [data, setData] = useState<Bootstrap>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [view, setView] = useState<View>("catalog");
  const [selection, setSelection] = useState<{ product: Product; sku: Sku }>();
  const [order, setOrder] = useState<Order>();
  const [outcome, setOutcome] = useState<Outcome>("SUCCESS");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const [bootstrap, orderList] = await Promise.all([api.bootstrap(), api.orders()]);
    setData(bootstrap);
    setOrders(orderList);
  };

  useEffect(() => { void load().catch((reason: Error) => setError(reason.message)); }, []);

  const activeEntitlements = useMemo(() => orders.flatMap((item) => item.items.flatMap((line) => line.entitlements ?? [])), [orders]);

  const purchase = async () => {
    if (!selection || !data) return;
    setBusy(true); setError("");
    try {
      const created = await api.createOrder(data.user.id, selection.sku.id);
      const payment = await api.createPayment(created.id);
      const result = await api.completePayment(payment.id, outcome);
      setOrder(result.order);
      await load();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  const refreshOrder = async () => {
    if (!order) return;
    const fresh = await api.order(order.id);
    setOrder(fresh);
    await load();
  };

  const refund = async () => {
    if (!order) return;
    setBusy(true);
    try { setOrder(await api.refund(order.id)); await load(); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  const reset = async () => {
    setBusy(true);
    try { await api.reset(); setOrder(undefined); setSelection(undefined); await load(); }
    finally { setBusy(false); }
  };

  if (!data) return <div className="loading"><RefreshCw className="spin" /> 正在装载交易沙盘…</div>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => { setView("catalog"); setOrder(undefined); setSelection(undefined); }}>
          <span className="brand-mark">M</span><span><strong>MonetizeLab</strong><small>商业化闭环沙盘</small></span>
        </button>
        <nav>
          <button className={view === "catalog" ? "active" : ""} onClick={() => setView("catalog")}>商品</button>
          <button className={view === "orders" ? "active" : ""} onClick={() => setView("orders")}>我的订单 <b>{orders.length}</b></button>
          <button className={view === "entitlements" ? "active" : ""} onClick={() => setView("entitlements")}>我的权益</button>
        </nav>
        <div className="user-chip"><UserRound size={18} /><span>{data.user.displayName}</span></div>
      </header>

      <div className="context-bar">
        <span><ShieldCheck size={16} /> 本地演示环境</span>
        <span>资金事实、权益履约与异常补偿均可追踪</span>
        <button onClick={() => void reset()} disabled={busy} title="清空交易演示数据"><RotateCcw size={15} /> 重置演示</button>
      </div>

      <main>
        {error && <div className="error-banner"><AlertCircle size={18} />{error}</div>}
        {view === "catalog" && !selection && !order && (
          <>
            <section className="page-heading">
              <div><p className="eyebrow">PRODUCT CATALOG</p><h1>选择适合你的创作方案</h1><p>价格由后端校验，支付成功后自动发放对应权益。</p></div>
              <div className="trust-note"><ShieldCheck size={22} /><span><strong>支付安全保障</strong><small>幂等下单 · 回调验签 · 状态可追踪</small></span></div>
            </section>
            <section className="product-grid">
              {data.products.map((product, index) => {
                const sku = product.skus[0];
                if (!sku) return null;
                const rule = sku.entitlementRules[0];
                return <article className={`product-card tone-${index}`} key={product.id}>
                  <div className="product-icon"><ProductIcon type={product.type} /></div>
                  <span className="product-type">{product.type === "MEMBERSHIP" ? "高级会员" : "用量加油包"}</span>
                  <h2>{product.name}</h2><p>{product.description}</p>
                  <div className="benefit"><Check size={16} />{rule?.entitlementDefinition.name} +{rule?.grantValue} {rule?.entitlementDefinition.unit === "DAY" ? "天" : "点"}</div>
                  <div className="price-row"><span><b>{money(sku.priceMinor)}</b><small>一次性支付</small></span><button onClick={() => setSelection({ product, sku })}>选择方案 <ChevronRight size={17} /></button></div>
                </article>;
              })}
            </section>
            <section className="flow-strip">
              <div><ReceiptText /><span><b>1. 创建业务订单</b><small>固化价格与权益快照</small></span></div><ChevronRight />
              <div><CreditCard /><span><b>2. 渠道确认资金</b><small>验签、核对、回调去重</small></span></div><ChevronRight />
              <div><PackageCheck /><span><b>3. 异步履约</b><small>幂等发放与失败补偿</small></span></div>
            </section>
          </>
        )}

        {view === "catalog" && selection && !order && (
          <section className="checkout-layout">
            <div>
              <button className="back" onClick={() => setSelection(undefined)}><ArrowLeft size={17} />返回商品中心</button>
              <p className="eyebrow">CHECKOUT</p><h1>确认订单与支付场景</h1>
              <article className="checkout-product"><div className="product-icon"><ProductIcon type={selection.product.type} /></div><div><h2>{selection.product.name}</h2><p>{selection.sku.name}</p></div><strong>{money(selection.sku.priceMinor)}</strong></article>
              <div className="snapshot-box"><h3>本次订单权益快照</h3>{selection.sku.entitlementRules.map((rule) => <div key={rule.entitlementDefinition.code}><Check size={16} /><span>{rule.entitlementDefinition.name}</span><b>+{rule.grantValue} {rule.entitlementDefinition.unit === "DAY" ? "天" : "点"}</b></div>)}</div>
            </div>
            <aside className="pay-panel">
              <h2>演示支付</h2><p>选择一个结果，观察订单、支付与权益如何分别变化。</p>
              <div className="scenario-list">
                {([
                  ["SUCCESS", "正常成功", "资金确认后权益自动到账"],
                  ["ENTITLEMENT_FAILURE", "权益发放失败", "支付成功，进入补偿队列"],
                  ["FAILURE", "支付失败", "保留订单，可重新支付"],
                  ["AMOUNT_MISMATCH", "金额不一致", "拒绝更新资金状态并告警"],
                ] as Array<[Outcome, string, string]>).map(([value, label, description]) => <button key={value} className={outcome === value ? "selected" : ""} onClick={() => setOutcome(value)}><span className="radio">{outcome === value && <i />}</span><span><b>{label}</b><small>{description}</small></span></button>)}
              </div>
              <div className="total"><span>应付金额</span><b>{money(selection.sku.priceMinor)}</b></div>
              <button className="primary wide" onClick={() => void purchase()} disabled={busy}>{busy ? <RefreshCw className="spin" /> : <CreditCard />}创建订单并模拟支付</button>
              <small className="fine-print"><ShieldCheck size={14} />演示不会产生真实扣款</small>
            </aside>
          </section>
        )}

        {view === "catalog" && order && <Result order={order} busy={busy} onRefresh={() => void refreshOrder()} onRefund={() => void refund()} onDone={() => { setOrder(undefined); setSelection(undefined); }} />}

        {view === "orders" && <section><div className="page-heading compact"><div><p className="eyebrow">ORDERS</p><h1>我的订单</h1><p>业务订单与每次支付尝试分开保存。</p></div></div><div className="order-list">{orders.length === 0 ? <Empty text="还没有交易订单" /> : orders.map((item) => <button key={item.id} onClick={async () => { setOrder(await api.order(item.id)); setView("catalog"); }}><span><ReceiptText /><span><b>{item.items[0]?.skuNameSnapshot}</b><small>{item.orderNo} · {time(item.createdAt)}</small></span></span><span><b>{money(item.payableAmountMinor)}</b><em className={`status ${item.status.toLowerCase()}`}>{statusLabel[item.status] ?? item.status}</em></span><ChevronRight /></button>)}</div></section>}

        {view === "entitlements" && <section><div className="page-heading compact"><div><p className="eyebrow">ENTITLEMENTS</p><h1>我的权益</h1><p>每一笔增减都有来源和幂等流水。</p></div></div><div className="entitlement-grid">{activeEntitlements.length === 0 ? <Empty text="暂无权益，完成一笔购买后会显示在这里" /> : activeEntitlements.map((item) => <article key={item.id}><div className="product-icon"><Sparkles /></div><span><b>{item.entitlementDefinition.name}</b><small>{item.validTo ? `有效至 ${new Date(item.validTo).toLocaleDateString("zh-CN")}` : `可用余额 ${item.remainingBalance ?? 0} 点`}</small></span><em className={`status ${item.status.toLowerCase()}`}>{statusLabel[item.status] ?? item.status}</em></article>)}</div></section>}
      </main>
    </div>
  );
}

function Result({ order, busy, onRefresh, onRefund, onDone }: { order: Order; busy: boolean; onRefresh: () => void; onRefund: () => void; onDone: () => void }) {
  const entitlement = order.items[0]?.entitlements?.[0];
  const success = order.status === "FULFILLED";
  const delayed = order.status === "PAID" && entitlement?.status === "GRANT_FAILED";
  const failedPayment = order.status === "PENDING_PAYMENT";
  const rejected = order.exceptionCases?.some((item) => item.exceptionCode === "PAYMENT_AMOUNT_MISMATCH");
  const title = success ? "购买成功，权益已到账" : delayed ? "支付成功，权益到账延迟" : failedPayment ? "支付未完成" : rejected ? "支付信息校验未通过" : statusLabel[order.status] ?? order.status;
  return <section className="result-layout">
    <div className="result-main">
      <button className="back" onClick={onDone}><ArrowLeft size={17} />返回商品中心</button>
      <div className={`result-hero ${success ? "success" : delayed ? "warning" : "neutral"}`}><span>{success ? <Check /> : delayed ? <Clock3 /> : <AlertCircle />}</span><div><p>{success ? "TRANSACTION COMPLETED" : "TRANSACTION STATUS"}</p><h1>{title}</h1><small>{delayed ? "资金已经确认，请勿重复支付。运营端可执行受控补发。" : success ? "订单、支付、权益三类状态均已确认。" : "业务订单仍然保留，可查看事件后决定下一步。"}</small></div></div>
      <div className="state-triad">
        <div><span>业务订单</span><b>{statusLabel[order.status] ?? order.status}</b><small>{order.orderNo}</small></div>
        <div><span>支付状态</span><b>{order.paymentAttempts[0]?.status ?? "未成功"}</b><small>{order.paymentAttempts[0]?.merchantTradeNo ?? "-"}</small></div>
        <div><span>权益状态</span><b>{entitlement ? statusLabel[entitlement.status] ?? entitlement.status : "未创建"}</b><small>{entitlement?.entitlementDefinition.name ?? "等待支付确认"}</small></div>
      </div>
      <div className="timeline"><h2>交易进度</h2>{order.traceEvents?.map((event, index) => <div key={event.id} className="timeline-item"><span className="dot">{index + 1}</span><div><b>{event.summary}</b><small>{time(event.occurredAt)} · {event.actorType}</small></div></div>)}</div>
    </div>
    <aside className="order-summary"><h2>订单摘要</h2><div><span>商品</span><b>{order.items[0]?.skuNameSnapshot}</b></div><div><span>应付金额</span><b>{money(order.payableAmountMinor)}</b></div><div><span>订单号</span><code>{order.orderNo}</code></div>{order.paymentAttempts[0]?.providerTradeNo && <div><span>渠道流水</span><code>{order.paymentAttempts[0].providerTradeNo}</code></div>}<button className="primary wide" onClick={onRefresh}><RefreshCw size={17} />刷新组合状态</button>{["PAID", "FULFILLED"].includes(order.status) && <button className="secondary wide" disabled={busy} onClick={onRefund}><RotateCcw size={17} />演示整单退款</button>}<button className="text-button" onClick={onDone}>继续购买</button></aside>
  </section>;
}

function Empty({ text }: { text: string }) { return <div className="empty"><PackageCheck size={30} /><p>{text}</p></div>; }

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);

