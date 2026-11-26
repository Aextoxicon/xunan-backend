# 巡安后端（xunan-server）

实训室隐患巡检的后端 API。契约见 `../docs/api-contract.md`（v1，定稿）。

## 技术栈

Hono + TypeScript + Zod，node-postgres 裸 SQL，Prisma 只作 DDL 工具（运行时不引入 PrismaClient），对象存储用 Cloudflare R2 的 S3 兼容接口。

## 目录

```
src/index.ts                 全部接口
src/scripts/apply-constraints.ts   执行 prisma/constraints.sql
prisma/schema.prisma         数据库结构唯一真源
prisma/constraints.sql        值域与完整性 CHECK 约束
```

## 环境变量

复制 `.env.example` 为 `.env` 并填写：

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL 连接串，pooled 形式 |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | R2 凭证，缺失时 `/uploads/presign` 返回 503 |
| `PORT` | 监听端口，默认 3000 |

## 运行

```bash
npm install
npm run dev        # tsx watch
npm run build      # 编译到 dist
npm run start      # 运行编译产物
npm run typecheck  # tsc --noEmit
```

## 建表与约束

Prisma 不支持 CHECK 约束，也不会检测它们，因此结构与约束分开管理：

```bash
npm run db:setup        # db push 建表/改结构，再执行约束
npm run db:push         # 只推结构
npm run db:constraints  # 只执行 prisma/constraints.sql（幂等，可重复跑）
```

改了 `schema.prisma` 后必须重跑 `db:constraints`，否则新列上的值域与完整性约束缺失。

## 接口

基础路径 `/api/v1`，另有 `/health`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/inspections` | 提交巡检，含明细与得分计算 |
| POST | `/hazards` | 新增隐患 |
| PATCH | `/hazards/{id}/status` | 修改整改状态，四态单向流转 |
| GET | `/stats/overview` | 看板统计：待办、逾期、闭环、整改率、房间排行、7 天趋势 |
| GET | `/rooms` | 实训室列表 |
| GET | `/check-items?room_id=` | 检查项（服务端静态配置） |
| POST | `/uploads/presign` | R2 预签名上传地址，300 秒有效 |

## 约定

- 主键一律字符串形式十进制，入参同样按字符串校验。
- 所有写操作带 `client_uuid`，重复提交返回 200 与首次创建的资源并附 `duplicated: true`；同一 `client_uuid` 用于不同目标状态返回 409 `idempotency_key_conflict`。
- 响应统一 `{ ok: true, data }` / `{ ok: false, error: { code, message, issues } }`。
- 编号格式 `XJ-YYYYMMDD-NNNN` / `HZ-YYYYMMDD-NNNN`，按 Asia/Shanghai 日期，序号由 advisory lock 保证唯一。

## 已知限制

- 没有鉴权，应用层 API Key 也未做，公网部署前必须补。
- 没有 CORS 与速率限制。
- `users` 没有唯一键，只用于指派与操作人记录，暂不建认证表。
- 检查项是服务端静态配置，不建 `check_items` 表。
