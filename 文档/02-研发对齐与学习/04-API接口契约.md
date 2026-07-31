# API 接口契约

版本：V1.0  
状态：阶段 2 研发契约  
最后更新：2026-07-30

## 1. 文档目的

定义前端、后台、开放平台、支付渠道与后端之间的接口边界，使产品规则可以被实现、测试和追踪。

每个写接口必须明确：

- 谁可以调用。
- 使用什么认证与权限。
- 是否需要幂等键。
- 输入由谁生成，哪些字段不可信。
- 成功后改变哪个对象状态。
- 是否产生异步事件或补偿任务。
- 失败时返回什么错误码，用户如何处理。

## 2. 通用约定

### 2.1 基础信息

| 项目 | 约定 |
|---|---|
| Base URL | `/api/v1` |
| 数据格式 | `application/json; charset=utf-8` |
| 时间 | ISO 8601 UTC，例如 `2026-07-30T10:00:00Z` |
| 金额 | `{ "amount_minor": 1990, "currency": "CNY" }` |
| 请求关联 | 客户端可传 `X-Request-Id`，服务端始终返回 `X-Correlation-Id` |
| 用户认证 | `Authorization: Bearer <access_token>` |
| 幂等 | 写入类关键接口使用 `Idempotency-Key` |
| 版本 | URL 主版本 `/v1`；兼容字段只增加不修改含义 |

### 2.2 成功响应

单对象：

```json
{
  "data": {
    "id": "ord_123"
  }
}
```

列表：

```json
{
  "data": [],
  "meta": {
    "next_cursor": null
  }
}
```

### 2.3 错误响应

使用 `application/problem+json` 风格：

```json
{
  "type": "https://monetizelab.local/problems/order-expired",
  "title": "订单已过期",
  "status": 409,
  "code": "ORDER_EXPIRED",
  "detail": "该订单已超过支付有效期，请重新下单",
  "correlation_id": "cor_123",
  "retryable": false,
  "field_errors": []
}
```

前端根据稳定的 `code` 决定交互，不解析 `detail` 文案。

### 2.4 HTTP 状态使用

| 状态 | 用途 |
|---|---|
| `200` | 查询、幂等重复请求返回已有结果 |
| `201` | 新对象创建成功 |
| `202` | 异步处理已受理，例如退款或补偿 |
| `204` | 无响应体的成功操作 |
| `400` | 参数格式错误 |
| `401` | 未登录、Token 过期或无效 |
| `403` | 已认证但无权限或 Scope 不足 |
| `404` | 对当前调用者不可见或不存在 |
| `409` | 状态冲突、幂等键参数冲突、身份绑定冲突 |
| `422` | 参数格式正确但不满足业务规则 |
| `429` | 频率限制 |
| `500/503` | 内部错误或临时不可用；返回可追踪关联 ID |

## 3. 认证与权限模型

### 3.1 访问主体

| 主体 | 认证方式 | 权限示例 |
|---|---|---|
| C 端用户 | 用户 Bearer Token | 查看本人订单、创建支付、申请退款 |
| 运营/客服/财务 | 后台 Bearer Token + Role | 商品配置、补偿、退款、对账 |
| 开放平台应用 | OAuth Access Token + Scope | `profile.read`、`orders.read` |
| 支付渠道 | 原始请求签名 | 只能调用对应 Webhook |
| 本地模拟器 | 开发环境受限凭证 | 只能改变模拟渠道状态 |

### 3.2 资源级校验

用户即使持有有效 Token，也只能访问 `resource.user_id == current_user.id` 的订单、权益和退款。后台角色访问必须记录操作者和用途。

## 4. 接口总览

### 4.1 用户认证与开放平台

| 编号 | 方法与路径 | 调用者 | 幂等 | 说明 |
|---|---|---|---|---|
| `API-01` | `POST /auth/demo-login` | 匿名用户 | 否 | 登录预置演示用户 |
| `API-02` | `GET /me` | 登录用户 | 否 | 当前用户与权限 |
| `API-03` | `POST /auth/logout` | 登录用户 | 是 | 撤销当前会话 |
| `API-04` | `POST /developer/apps` | 开发者 | 是 | 创建开放平台应用 |
| `API-05` | `GET /developer/apps` | 开发者 | 否 | 查询本人应用 |
| `API-06` | `PATCH /developer/apps/{app_id}` | 应用所有者 | 是 | 修改名称、回调和 Scope |
| `API-07` | `POST /developer/apps/{app_id}/rotate-secret` | 应用所有者 | 是 | 轮换密钥，明文只返回一次 |
| `API-08` | `GET/POST /oauth/authorize` | 登录用户 | 否 | 展示并确认授权 |
| `API-09` | `POST /oauth/token` | 开放平台应用 | 是 | 授权码/刷新令牌换 Token |
| `API-10` | `POST /oauth/revoke` | 用户或应用 | 是 | 撤销 Token/授权 |

### 4.2 商品

| 编号 | 方法与路径 | 调用者 | 幂等 | 说明 |
|---|---|---|---|---|
| `API-11` | `GET /products` | 用户/匿名 | 否 | 查询可售商品与 SKU |
| `API-12` | `GET /products/{product_id}` | 用户/匿名 | 否 | 商品详情与权益摘要 |
| `API-13` | `POST /admin/products` | 运营 | 是 | 创建产品 |
| `API-14` | `PATCH /admin/skus/{sku_id}` | 运营 | 是 | 修改售价、可售期和状态 |

### 4.3 订单

| 编号 | 方法与路径 | 调用者 | 幂等 | 说明 |
|---|---|---|---|---|
| `API-15` | `POST /orders` | 登录用户 | 必须 | 创建业务订单 |
| `API-16` | `GET /orders` | 登录用户 | 否 | 查询本人订单 |
| `API-17` | `GET /orders/{order_id}` | 订单用户/后台 | 否 | 聚合订单详情 |
| `API-18` | `POST /orders/{order_id}/close` | 订单用户/订单任务 | 必须 | 请求关闭未支付订单 |

### 4.4 支付与模拟渠道

| 编号 | 方法与路径 | 调用者 | 幂等 | 说明 |
|---|---|---|---|---|
| `API-19` | `POST /orders/{order_id}/payment-attempts` | 订单用户 | 必须 | 创建支付尝试 |
| `API-20` | `GET /payment-attempts/{payment_attempt_id}` | 订单用户/后台 | 否 | 查询支付尝试 |
| `API-21` | `POST /payment-attempts/{payment_attempt_id}/query` | 后台/系统任务 | 必须 | 主动查单 |
| `API-22` | `POST /simulator/payment-attempts/{id}/result` | 本地模拟器 | 必须 | 设置模拟渠道结果 |
| `API-23` | `POST /webhooks/payments/mock` | 模拟支付渠道 | 渠道事件号 | 支付异步通知 |

### 4.5 权益

| 编号 | 方法与路径 | 调用者 | 幂等 | 说明 |
|---|---|---|---|---|
| `API-24` | `GET /me/entitlements` | 登录用户 | 否 | 查询当前可用权益 |
| `API-25` | `GET /entitlements/{id}/ledger` | 权益用户/后台 | 否 | 查询权益流水 |
| `API-26` | `POST /admin/entitlements/{id}/retry-grant` | 客服 | 必须 | 重试原发放任务 |
| `API-27` | `POST /admin/orders/{order_id}/manual-grant` | 客服主管 | 必须 | 受控人工补发 |
| `API-28` | `POST /admin/entitlements/{id}/retry-revoke` | 客服 | 必须 | 重试权益回收 |

### 4.6 退款

| 编号 | 方法与路径 | 调用者 | 幂等 | 说明 |
|---|---|---|---|---|
| `API-29` | `POST /orders/{order_id}/refunds` | 订单用户/客服 | 必须 | 创建整单退款 |
| `API-30` | `GET /refunds/{refund_id}` | 订单用户/后台 | 否 | 查询退款进度 |
| `API-31` | `POST /admin/refunds/{refund_id}/query` | 客服/系统任务 | 必须 | 主动查询渠道退款 |

### 4.7 后台、异常与观察台

| 编号 | 方法与路径 | 调用者 | 幂等 | 说明 |
|---|---|---|---|---|
| `API-32` | `GET /admin/orders` | 运营/客服/财务 | 否 | 多编号组合搜索订单 |
| `API-33` | `GET /admin/exception-cases` | 后台角色 | 否 | 查询异常列表 |
| `API-34` | `GET /admin/exception-cases/{id}` | 后台角色 | 否 | 异常详情与关联交易 |
| `API-35` | `POST /admin/exception-cases/{id}/retry` | 客服/系统任务 | 必须 | 执行允许的自动补偿 |
| `API-36` | `POST /admin/exception-cases/{id}/resolve` | 有权后台角色 | 必须 | 解决或忽略异常 |
| `API-37` | `GET /admin/orders/{order_id}/timeline` | 后台角色 | 否 | 交易时间线和脱敏载荷 |
| `API-38` | `GET /admin/metrics/commerce` | 运营/产品 | 否 | 漏斗与质量指标 |
| `API-39` | `POST /admin/reconciliation/imports` | 财务 | 必须 | 导入模拟渠道账单 |
| `API-40` | `GET /admin/reconciliation/records` | 财务 | 否 | 查询对账差异 |
| `API-41` | `POST /admin/demo/reset` | 本地管理员 | 必须 | 清空并重建确定性演示数据，仅开发环境存在 |

## 5. 核心接口详细契约

### 5.1 创建订单 `API-15`

请求：

```http
POST /api/v1/orders
Authorization: Bearer <user_token>
Idempotency-Key: checkout-user1-sku-year-001
Content-Type: application/json
```

```json
{
  "sku_id": "sku_yearly_pro",
  "quantity": 1,
  "source": "product_page"
}
```

前端不得提交最终应付金额。服务端读取当前 SKU、价格和权益规则，生成不可变快照。

响应 `201`：

```json
{
  "data": {
    "order_id": "ord_123",
    "order_no": "ML202607300001",
    "status": "PENDING_PAYMENT",
    "item": {
      "sku_id": "sku_yearly_pro",
      "sku_name": "AI Pro 年卡",
      "entitlements": [
        { "code": "AI_PRO_MEMBERSHIP", "value": 365, "unit": "DAY" }
      ]
    },
    "money": { "amount_minor": 19900, "currency": "CNY" },
    "expires_at": "2026-07-30T10:30:00Z"
  }
}
```

主要错误：`SKU_NOT_SALEABLE`、`SKU_PRICE_CHANGED`、`USER_FROZEN`、`IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST`。

状态与副作用：创建 `Order.PENDING_PAYMENT`、订单明细快照、幂等记录和 `order.created` 时间线。

### 5.2 创建支付尝试 `API-19`

请求：

```http
POST /api/v1/orders/ord_123/payment-attempts
Authorization: Bearer <user_token>
Idempotency-Key: pay-ord123-attempt1
```

```json
{
  "provider": "MOCKPAY",
  "method": "QR_PAY",
  "return_context": "order_detail"
}
```

响应 `201`：

```json
{
  "data": {
    "payment_attempt_id": "pay_123",
    "merchant_trade_no": "MP202607300001",
    "status": "PROCESSING",
    "provider_payload": {
      "simulator_url": "/simulator/pay_123"
    },
    "expires_at": "2026-07-30T10:30:00Z"
  }
}
```

主要错误：`ORDER_NOT_PAYABLE`、`ORDER_EXPIRED`、`PAYMENT_ATTEMPT_ALREADY_PROCESSING`、`PROVIDER_UNAVAILABLE`。

状态与副作用：创建 `PaymentAttempt`，订单从 `PENDING_PAYMENT` 进入 `PAYING`。

### 5.3 支付 Webhook `API-23`

请求头：

```http
POST /api/v1/webhooks/payments/mock
X-MockPay-Event-Id: evt_123
X-MockPay-Timestamp: 1785400000
X-MockPay-Signature: v1=<hmac>
Content-Type: application/json
```

请求体：

```json
{
  "event_type": "payment.succeeded",
  "merchant_trade_no": "MP202607300001",
  "provider_trade_no": "mock_trade_001",
  "amount_minor": 19900,
  "currency": "CNY",
  "paid_at": "2026-07-30T10:05:00Z"
}
```

处理顺序：原始体验签 -> 事件号去重 -> 匹配支付尝试 -> 核对商户、金额和币种 -> 持久化事件 -> 更新支付与订单 -> 写 Outbox。

渠道确认响应：

```json
{ "accepted": true }
```

重复事件同样返回 `200` 和 `accepted: true`，但不重复产生副作用。

验签失败返回 `401`；金额不一致返回 `422` 并创建 S1 工单。实际渠道的响应状态需按渠道协议适配，不由统一业务接口强行一致。

### 5.4 聚合订单详情 `API-17`

响应 `200`：

```json
{
  "data": {
    "order": {
      "id": "ord_123",
      "order_no": "ML202607300001",
      "status": "PAID",
      "money": { "amount_minor": 19900, "currency": "CNY" },
      "created_at": "2026-07-30T10:00:00Z",
      "paid_at": "2026-07-30T10:05:01Z"
    },
    "latest_payment": {
      "id": "pay_123",
      "status": "SUCCEEDED",
      "provider": "MOCKPAY"
    },
    "entitlements": [
      {
        "id": "ent_123",
        "code": "AI_PRO_MEMBERSHIP",
        "status": "GRANTING"
      }
    ],
    "refunds": [],
    "display_state": {
      "code": "PAYMENT_SUCCEEDED_FULFILLING",
      "title": "支付成功，权益处理中",
      "recommended_action": "REFRESH"
    }
  }
}
```

`display_state` 由后端查询层按状态映射计算，前端不自行猜测组合逻辑。

### 5.5 人工补发 `API-27`

请求：

```http
POST /api/v1/admin/orders/ord_123/manual-grant
Authorization: Bearer <support_supervisor_token>
Idempotency-Key: manual-grant-ord123-entitlementA
```

```json
{
  "reason_code": "AUTO_RETRY_EXHAUSTED",
  "reason_note": "已核对支付成功和订单权益快照，执行人工补发"
}
```

响应 `202`：返回原权益、补偿任务和异常工单状态。接口必须复用原发放业务幂等键，不通过“新建一份权益”规避问题。

主要错误：`PAYMENT_NOT_SUCCEEDED`、`ENTITLEMENT_ALREADY_ACTIVE`、`MANUAL_REASON_REQUIRED`、`FORBIDDEN_OPERATION`。

### 5.6 创建退款 `API-29`

请求：

```http
POST /api/v1/orders/ord_123/refunds
Authorization: Bearer <user_token>
Idempotency-Key: refund-ord123-request1
```

```json
{
  "reason_code": "USER_CHANGED_MIND",
  "reason_note": "未使用服务"
}
```

响应 `202`：

```json
{
  "data": {
    "refund_id": "rfd_123",
    "refund_no": "RF202607300001",
    "status": "PROCESSING",
    "entitlement_action_status": "PENDING",
    "money": { "amount_minor": 19900, "currency": "CNY" }
  }
}
```

主要错误：`ORDER_NOT_REFUNDABLE`、`REFUND_AMOUNT_EXCEEDED`、`ENTITLEMENT_USAGE_REQUIRES_REVIEW`、`REFUND_ALREADY_PROCESSING`。

### 5.7 OAuth 换取 Token `API-09`

授权码模式请求：

```http
POST /api/v1/oauth/token
Content-Type: application/x-www-form-urlencoded
```

```text
grant_type=authorization_code
code=one_time_code
client_id=client_demo
redirect_uri=https%3A%2F%2Fpartner.local%2Fcallback
code_verifier=pkce_verifier
```

成功响应：

```json
{
  "access_token": "returned_once",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "returned_once",
  "scope": "profile.read orders.read"
}
```

主要错误：`OAUTH_INVALID_GRANT`、`OAUTH_REDIRECT_URI_MISMATCH`、`OAUTH_CODE_REUSED`、`OAUTH_PKCE_FAILED`、`OAUTH_SCOPE_EXCEEDED`。

## 6. 幂等约定

### 6.1 需要幂等键的接口

- 创建订单、支付尝试、退款。
- 主动查单和补偿命令。
- 人工补发、回收和异常解决。
- 创建/修改开放平台应用与轮换密钥。

### 6.2 处理规则

1. 服务端保存 `scope + Idempotency-Key + request_hash`。
2. 相同键、相同请求：返回第一次结果。
3. 相同键、不同请求：返回 `409 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST`。
4. 首次请求仍处理中：返回 `409/202 IDEMPOTENCY_REQUEST_IN_PROGRESS`，并提供资源查询地址。
5. Webhook 使用渠道事件号作为幂等键，不要求渠道发送通用请求头。

## 7. 状态变化与事件

| 接口/事件 | 对象变化 | Outbox/时间线事件 |
|---|---|---|
| `API-15` 创建订单 | 新建订单 `PENDING_PAYMENT` | `order.created` |
| `API-19` 创建支付 | 新建支付 `PROCESSING`；订单 `PAYING` | `payment.created` |
| `API-23` 支付成功 | 支付 `SUCCEEDED`；订单 `PAID` | `payment.succeeded`、`entitlement.grant.requested` |
| 权益任务成功 | 权益 `ACTIVE`；订单满足条件后 `FULFILLED` | `entitlement.granted`、`order.fulfilled` |
| `API-29` 创建退款 | 退款 `REQUESTED/PROCESSING` | `refund.requested` |
| 退款渠道成功 | 退款 `SUCCEEDED`；订单 `REFUNDED` | `refund.succeeded`、`entitlement.revoke.requested` |
| 权益回收成功 | 权益 `REVOKED` | `entitlement.revoked` |
| 异常超阈值 | 新建/升级异常工单 | `exception.created/escalated` |

## 8. 错误码目录

### 8.1 通用

- `VALIDATION_ERROR`
- `UNAUTHENTICATED`
- `FORBIDDEN_OPERATION`
- `RESOURCE_NOT_FOUND`
- `RATE_LIMITED`
- `IDEMPOTENCY_KEY_REQUIRED`
- `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST`
- `IDEMPOTENCY_REQUEST_IN_PROGRESS`
- `INTERNAL_ERROR`
- `DEPENDENCY_UNAVAILABLE`

### 8.2 商品与订单

- `SKU_NOT_FOUND`
- `SKU_NOT_SALEABLE`
- `SKU_PRICE_CHANGED`
- `ORDER_NOT_PAYABLE`
- `ORDER_EXPIRED`
- `ORDER_PAYMENT_RESULT_UNKNOWN`
- `ORDER_NOT_REFUNDABLE`

### 8.3 支付

- `PAYMENT_ATTEMPT_ALREADY_PROCESSING`
- `PAYMENT_SIGNATURE_INVALID`
- `PAYMENT_MERCHANT_MISMATCH`
- `PAYMENT_AMOUNT_MISMATCH`
- `PAYMENT_CURRENCY_MISMATCH`
- `PAYMENT_EVENT_DUPLICATE`
- `PAYMENT_STATE_CONFLICT`
- `PROVIDER_UNAVAILABLE`

重复事件通常在 Webhook 内返回成功确认并记录为 `IGNORED`，不一定作为 HTTP 错误暴露给渠道。

### 8.4 权益与退款

- `ENTITLEMENT_ALREADY_ACTIVE`
- `ENTITLEMENT_GRANT_IN_PROGRESS`
- `ENTITLEMENT_GRANT_FAILED`
- `ENTITLEMENT_REVOKE_FAILED`
- `ENTITLEMENT_USAGE_REQUIRES_REVIEW`
- `REFUND_ALREADY_PROCESSING`
- `REFUND_AMOUNT_EXCEEDED`
- `REFUND_PROVIDER_UNKNOWN`
- `MANUAL_REASON_REQUIRED`

### 8.5 OAuth

- `OAUTH_INVALID_CLIENT`
- `OAUTH_INVALID_GRANT`
- `OAUTH_CODE_REUSED`
- `OAUTH_REDIRECT_URI_MISMATCH`
- `OAUTH_STATE_MISMATCH`
- `OAUTH_PKCE_FAILED`
- `OAUTH_SCOPE_EXCEEDED`
- `OAUTH_TOKEN_EXPIRED`
- `OAUTH_TOKEN_REVOKED`

## 9. 分页、筛选与排序

- 列表默认按 `created_at DESC`。
- 使用游标分页，参数 `cursor` 和 `limit`，默认 20，最大 100。
- 后台订单支持 `order_no`、`merchant_trade_no`、`provider_trade_no`、`refund_no` 精确检索。
- 时间范围最大跨度由角色控制，避免无界聚合查询。
- 枚举筛选使用重复 query 参数或逗号分隔，OpenAPI 中保持一种固定写法。

## 10. API 安全与日志

- 请求日志不记录 Authorization、Cookie、Client Secret、Token、签名原文和完整隐私字段。
- Webhook 必须保留原始请求体用于验签；业务解析发生在验签之后。
- 后台写接口记录操作者、角色、原因、请求关联 ID 和结果。
- 所有资源查询进行对象归属校验，不能只依赖前端隐藏按钮。
- OAuth 与支付接口设置独立限流策略。
- 本地模拟器接口在非开发环境必须禁用或不存在。

## 11. OpenAPI 与代码同步

- NestJS 控制器通过 DTO 和装饰器生成 `openapi.json`。
- CI/本地验证检查 OpenAPI 是否可生成且无重复 operationId。
- 前端从 OpenAPI 生成或校验 TypeScript Client，避免手写字段漂移。
- 本文保留产品语义和关键示例，生成的 OpenAPI 是代码级接口权威来源。
- 任何破坏兼容性的变更必须升级 API 主版本或提供迁移期。

## 12. 接口验收清单

- 41 个接口都有调用者、认证和用途。
- 关键写接口明确幂等策略和状态副作用。
- 创建订单不接受前端最终金额。
- Webhook 验签、去重、核对和事件落库顺序明确。
- 聚合订单详情提供后端计算的用户展示状态。
- 人工补偿不能绕开原业务幂等键。
- 错误响应含稳定 `code`、`correlation_id` 和 `retryable`。
- Token、密钥和支付敏感信息不进入普通日志和观察台。
- P0 接口后续全部进入自动化接口测试。

## 13. 下一步

继续编写《Webhook、幂等与补偿机制》，详细定义签名、原始请求处理、事件去重、Outbox、任务锁、重试和死信人工接管。
