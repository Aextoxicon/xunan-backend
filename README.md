# 巡安后端（xunan-server）

实训室隐患巡检的后端 API。契约见 `../docs/api-contract.md`（v1，定稿）。

## 技术栈

Hono + TypeScript + Zod，node-postgres 裸 SQL，Prisma 只作 DDL 工具（运行时不引入 PrismaClient），对象存储走标准 S3 接口、预签名用 aws4fetch，部署目标 Cloudflare Workers。

## 目录

```
src/index.ts                 组装 app：CORS、数据库中间件、错误处理、挂载路由，只导出 default app
src/serve.ts                 本地监听入口，端口与 env 映射在这里
src/routes/inspections.ts    巡检提交、列表、详情
src/routes/hazards.ts        隐患增改、列表、详情、状态流转、催办
src/routes/catalog.ts        实训室、检查项、用户
src/routes/stats.ts          看板统计
src/routes/reports.ts        周报数据
src/routes/uploads.ts        对象存储预签名
src/lib/env.ts               Bindings 类型、连接串与存储配置
src/lib/http.ts              统一响应、错误码、ApiError
src/lib/db.ts                事务封装、编号生成
src/lib/time.ts              +08:00 时间格式化、周起点
src/lib/catalog.ts           检查项目录与按房间过滤
src/lib/domain.ts            状态机、级别升级、距离计算、房间读取
src/lib/validation.ts        共用 Zod 字段
src/scripts/apply-constraints.ts   执行 prisma/constraints.sql
prisma/schema.prisma         数据库结构唯一真源
prisma/constraints.sql        值域与完整性 CHECK 约束
prisma/migrate-timestamptz.sql  一次性迁移：把旧的时间列从 timestamp 改成 timestamptz
prisma/migrate-features.sql   一次性迁移：房间定位/周期/检查项配置与催办计数
prisma/migrate-jwt-auth.sql   一次性迁移：users 增加 password_hash 列
wrangler.jsonc               Workers 部署配置（入口、nodejs_compat、Hyperdrive）
```

## 环境变量

复制 `.env.example` 为 `.env` 并填写：

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL 连接串，pooled 形式 |
| `AWS_ENDPOINT_URL_S3` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | AWS 标准 S3 环境变量，由 Neon 注入；缺任一变量时 `/uploads/presign` 返回 503 `storage_not_configured` |
| `STORAGE_BUCKET` | bucket 名，默认 `uploads` |
| `CORS_ORIGINS` | 允许的跨域来源，逗号分隔，如 `http://localhost:5173,https://app.example.com`；填 `*` 放行全部；留空则不下发 CORS 头 |
| `JWT_SECRET` | 登录 token 的 HMAC 签名密钥，缺失时鉴权接口返回 503 `auth_not_configured` |
| `JWT_TTL_DAYS` | token 有效期天数，默认 30；离线补传建议保持长有效期 |
| `PORT` | 本地 `serve()` 的监听端口，默认 3000；Workers 没有监听端口，不需要 |

## 运行

```bash
npm install
npm run dev         # tsx watch src/serve.ts，Node 本地监听
npm run dev:worker  # wrangler dev，按 Workers 运行时跑（更接近线上）
npm run build       # 编译到 dist
npm run start       # 运行 dist/serve.js
npm run typecheck   # tsc --noEmit
```

## 部署（Cloudflare Workers）

入口是 `src/index.ts`，导出 `default app`，配置见 `wrangler.jsonc`：

- `compatibility_flags: ["nodejs_compat"]`：pg 需要 Node 兼容层
- `hyperdrive` 绑定 `HYPERDRIVE`：运行时取 `env.HYPERDRIVE.connectionString`，没有时回退 `env.DATABASE_URL`
- `vars` / secret：`STORAGE_BUCKET`、`AWS_*`、`CORS_ORIGINS` 用 `wrangler secret put` 写入

首次部署：

```bash
npx wrangler login
npx wrangler hyperdrive create xunan-db --connection-string="<Neon 直连串>"
# 把返回的 id 填进 wrangler.jsonc 的 hyperdrive[0].id
npx wrangler secret put AWS_ACCESS_KEY_ID   # 其余 AWS_* 同理
npm run deploy
```

`nodejs_compat` 下每次请求新建 `pg.Client`，连接复用交给 Hyperdrive，不要自己池化。已用 `wrangler deploy --dry-run` 验证打包：约 1.07 MB / gzip 187 KB，在 Workers 免费版 3 MB 限制内。

本地快速验证仍可用 `npm run dev`（Node 运行时），接口行为一致。

## 建表与约束

Prisma 不支持 CHECK 约束，也不会检测它们，因此结构与约束分开管理：

```bash
npm run db:setup        # 建表 + 执行约束（走 prisma/ddl.sql 与 pg 驱动，不依赖 Prisma 引擎联网）
npm run db:seed         # 演示种子数据：12 个实训室、3 个用户、8 次巡检、10 条隐患（含 3 条逾期、2 条带催办），会先清空表
npm run db:push         # 用 Prisma 引擎推结构（能直连数据库时用）
npm run db:constraints  # 只执行 prisma/constraints.sql（幂等，可重复跑）
# 旧库升级：psql 或以 pg 执行 prisma/migrate-features.sql 与 prisma/migrate-timestamptz.sql
```

`prisma/ddl.sql` 是建表 DDL，由 `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` 离线生成，改了 `schema.prisma` 后重新生成并保留 `IF NOT EXISTS`。

改了 `schema.prisma` 后必须重跑 `db:constraints`，否则新列上的值域与完整性约束缺失。

旧库若时间列仍是 `timestamp without time zone`，执行一次 `prisma/migrate-timestamptz.sql`（幂等），把 `created_at`/`updated_at`/`inspected_at`/`due_at`/`closed_at` 改成 `timestamptz`。

## 接口

基础路径 `/api/v1`，另有 `/health`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/login` | 账号密码登录，签发 JWT（唯一免鉴权接口） |
| GET | `/auth/me` | 当前登录用户 |
| POST | `/inspections` | 提交巡检，含明细与得分计算 |
| POST | `/hazards` | 新增隐患 |
| PATCH | `/hazards/{id}/status` | 修改整改状态，四态单向流转 |
| GET | `/hazards` | 隐患列表，支持状态、房间、责任人、逾期/临期筛选与分页，含 `escalated_level` |
| GET | `/hazards/{id}` | 隐患详情，含状态时间轴、催办记录 |
| POST | `/hazards/{id}/remind` | 催办，累计次数并写入状态时间轴 |
| GET | `/users` | 用户列表，供责任人下拉 |
| GET | `/stats/overview` | 看板统计：待办、逾期、闭环、整改率、房间排行、7 天趋势 |
| GET | `/inspections` | 巡检记录列表，含得分、异常项数、隐患数 |
| GET | `/inspections/{id}` | 巡检详情，含明细与关联隐患 |
| GET | `/reports/weekly` | 周报数据：概览、级别分布、分类异常、TOP 房间与隐患 |
| GET | `/rooms` | 实训室列表，含坐标、半径、巡检周期、今日是否已巡检、周期是否到期 |
| GET | `/check-items?room_id=` | 检查项，按房间 `check_item_codes` 过滤，未配置时返回全量 |
| POST | `/uploads/presign` | 对象存储预签名上传地址，300 秒有效 |
| GET | `/uploads/presign?key=` | 对象存储预签名下载地址，300 秒有效 |
| PATCH | `/hazards/{id}` | 编辑隐患描述/级别/责任人/期限，记入时间轴且幂等 |

## 约定

- 除 `POST /api/v1/auth/login` 外，所有接口要求 `Authorization: Bearer <JWT>`；token 默认 30 天。
- 主键一律字符串形式十进制，入参同样按字符串校验。
- 所有写操作带 `client_uuid`，重复提交返回 200 与首次创建的资源并附 `duplicated: true`；同一 `client_uuid` 用于不同目标状态返回 409 `idempotency_key_conflict`。
- 响应统一 `{ ok: true, data }` / `{ ok: false, error: { code, message, issues } }`。
- 编号格式 `XJ-YYYYMMDD-NNNN` / `HZ-YYYYMMDD-NNNN`，按 Asia/Shanghai 日期，序号由 advisory lock 保证唯一。
- 对象 key 为桶内相对路径，不含桶名，`seed-fire-01.jpg` 这类 key 可直接用于下载签名。
- 时间统一返回 `+08:00` 偏移（`2026-11-26T21:30:00.000+08:00`），入参接受 `Z` 与 `+08:00`，库内以 `timestamptz` 存瞬时值。

## 已知限制

- JWT 无状态，签发后不能单条撤销；需要强制下线只能换 `JWT_SECRET`（全员失效）或缩短 TTL。
- 登录没有限流与验证码；演示口令 `xunan2026` 写在种子脚本里，上线前必须改。
- 没有速率限制。跨域由 `CORS_ORIGINS` 控制。
- `users` 没有唯一键，只用于指派与操作人记录，暂不建认证表。
- 检查项是服务端静态配置，不建 `check_items` 表。
