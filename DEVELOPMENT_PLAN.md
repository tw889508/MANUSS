# Manus Wrapper — 开发计划与架构指南

> 本文档是项目的完整开发蓝图。任何开发者（包括 AI Agent）从 Git 拉取代码后，阅读本文档即可了解项目全貌并继续开发。

---

## 1. 项目概述

**Manus Wrapper** 是一个"套壳 MANUS"的 Web 应用，通过代理方式安全地调用 MANUS 官方 API，提供以下核心能力：

- **多账户管理**：用户可添加多个 MANUS API 账户（API Key 加密存储），随时切换。
- **对话上下文保持**：通过 `previous_response_id` 实现多轮对话，上下文在 MANUS 侧自动保留。
- **任务状态持久化**：在本地数据库中保存任务信息和对话历史，支持断点续聊。
- **灵活的模型配置**：支持 MANUS 的三种 agent 模式（chat/adaptive/agent）和三种模型（manus-1.6/lite/max）。

---

## 2. 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | React 19 + TypeScript + TailwindCSS 4 + shadcn/ui | Vite 构建，wouter 路由 |
| 后端 | Express 4 + tRPC 11 + Superjson | 类型安全的 RPC 调用 |
| 数据库 | TiDB (MySQL 兼容) + Drizzle ORM | Manus 平台内置托管数据库 |
| 认证 | Manus OAuth | 平台内置，`protectedProcedure` 自动注入 `ctx.user` |
| 加密 | AES-256-GCM | 使用 `JWT_SECRET` 派生密钥加密 API Key |
| HTTP 代理 | Axios | 转发请求到 MANUS API |

---

## 3. MANUS API 关键信息

### 3.1 认证方式

```
Header: API_KEY: <your-manus-api-key>
Base URL: https://api.manus.im
```

### 3.2 核心端点

| 方法 | 端点 | 描述 |
|---|---|---|
| POST | `/v1/responses` | 创建任务（OpenAI SDK 兼容） |
| GET | `/v1/responses/{id}` | 获取任务详情/状态 |
| DELETE | `/v1/responses/{id}` | 删除任务 |
| GET | `/v1/tasks` | 列出任务（支持过滤和分页） |
| PUT | `/v1/tasks/{id}` | 更新任务属性 |
| POST | `/v1/files` | 上传文件 |

### 3.3 创建任务请求体

```json
{
  "input": [
    {
      "role": "user",
      "content": [
        { "type": "input_text", "text": "你的提示" },
        { "type": "input_file", "file_id": "file-xxx" },
        { "type": "input_image", "image_url": "https://..." }
      ]
    }
  ],
  "model": "manus-1.6",
  "previous_response_id": "上一轮任务ID（多轮对话用）",
  "extra_body": {
    "task_mode": "agent",
    "agent_profile": "manus-1.6",
    "project_id": "proj_xxx",
    "hide_in_task_list": false,
    "create_shareable_link": false
  }
}
```

### 3.4 任务状态

- `running` → 正在执行
- `pending` → 等待用户输入
- `completed` → 已完成
- `failed` / `error` → 失败

### 3.5 多轮对话

通过 `previous_response_id` 字段链接到上一轮任务，MANUS 会自动保留上下文（包括文件、中间结果等）。

### 3.6 Agent Profile 选项

- `manus-1.6-lite` — 简单任务，速度快
- `manus-1.6` — 通用任务
- `manus-1.6-max` — 复杂分析任务

---

## 4. 数据库设计

### 4.1 `users` 表（框架内置）

平台 OAuth 认证自动管理，包含 `id`, `openId`, `name`, `email`, `role` 等字段。

### 4.2 `accounts` 表

存储用户添加的 MANUS API 账户。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int, PK, auto | 主键 |
| userId | int | 关联 users.id |
| name | varchar(255) | 账户别名 |
| apiKeyEncrypted | text | AES-256-GCM 加密后的 API Key |
| apiBaseUrl | varchar(512) | API 地址，默认 `https://api.manus.im` |
| isDefault | int | 是否为默认账户（0/1） |
| createdAt / updatedAt | timestamp | 时间戳 |

### 4.3 `tasks` 表

存储 MANUS 任务信息和对话历史。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int, PK, auto | 本地主键 |
| manusTaskId | varchar(128) | MANUS 返回的任务 ID |
| userId | int | 关联 users.id |
| accountId | int | 使用的账户 ID |
| title | varchar(512) | 任务标题 |
| status | enum | pending/running/completed/failed/unknown |
| agentProfile | varchar(64) | 使用的模型 |
| taskMode | varchar(32) | 使用的模式 |
| projectId | varchar(128) | 关联的 MANUS 项目 ID |
| taskUrl | varchar(512) | MANUS 任务链接 |
| shareUrl | varchar(512) | 分享链接 |
| creditUsage | int | 积分消耗 |
| conversationHistory | json | 完整对话历史（ConversationMessage[]） |
| createdAt / updatedAt | timestamp | 时间戳 |

---

## 5. 后端架构

### 5.1 文件结构

```
server/
  _core/           ← 框架核心（不要修改）
  crypto.ts        ← AES-256-GCM 加密/解密工具 ✅ 已完成
  manusProxy.ts    ← MANUS API 代理模块 ✅ 已完成
  db.ts            ← 数据库查询助手 ✅ 已完成
  routers.ts       ← tRPC 路由定义 ⬜ 待实现
  routers/         ← 拆分的路由文件（如果 routers.ts 超过 150 行）
    account.ts     ⬜ 待创建
    task.ts        ⬜ 待创建
```

### 5.2 tRPC 路由设计

#### `account` 路由（全部需要 `protectedProcedure`）

| 路由 | 方法 | 输入 | 说明 |
|---|---|---|---|
| `account.create` | mutation | `{ name, apiKey, apiBaseUrl? }` | 加密 apiKey 后存入数据库 |
| `account.list` | query | 无 | 返回当前用户的所有账户（不含 apiKey） |
| `account.delete` | mutation | `{ accountId }` | 删除指定账户 |
| `account.setDefault` | mutation | `{ accountId }` | 设为默认账户 |
| `account.test` | mutation | `{ accountId }` | 用该账户的 Key 调 MANUS API 测试连通性 |

#### `task` 路由（全部需要 `protectedProcedure`）

| 路由 | 方法 | 输入 | 说明 |
|---|---|---|---|
| `task.create` | mutation | `{ accountId, prompt, agentProfile?, taskMode?, projectId? }` | 创建新任务 |
| `task.continue` | mutation | `{ taskId (本地), prompt }` | 继续多轮对话 |
| `task.get` | query | `{ taskId (本地) }` | 获取任务详情，同时从 MANUS 拉取最新状态 |
| `task.poll` | query | `{ taskId (本地) }` | 轮询任务状态（轻量级，只返回 status） |
| `task.list` | query | `{ accountId? }` | 列出用户的历史任务 |
| `task.delete` | mutation | `{ taskId (本地) }` | 删除本地任务记录 |

### 5.3 加密方案

- 使用 `server/crypto.ts` 中的 `encrypt()` / `decrypt()` 函数
- 算法：AES-256-GCM
- 密钥：从环境变量 `JWT_SECRET` 通过 SHA-256 派生
- 格式：`IV(hex) + AuthTag(hex) + Ciphertext(hex)`

### 5.4 API 代理流程

```
用户请求 → tRPC route → 从 DB 获取 account → decrypt(apiKey) → 构造 MANUS 请求 → 转发 → 返回结果 → 更新 DB
```

---

## 6. 前端架构

### 6.1 文件结构

```
client/src/
  App.tsx           ← 路由和主题配置
  index.css         ← 全局样式（暗色主题色板）
  pages/
    Home.tsx        ← 首页/仪表盘
    Accounts.tsx    ← 账户管理页
    Chat.tsx        ← 对话页面（核心）
    Tasks.tsx       ← 任务列表页
  components/
    DashboardLayout.tsx  ← 内置侧边栏布局
    AccountSwitcher.tsx  ← 账户切换下拉
    ChatMessage.tsx      ← 单条消息组件
    TaskStatusBadge.tsx  ← 任务状态标签
    ModelSelector.tsx    ← 模型/模式选择器
```

### 6.2 页面设计

#### 首页 (Home)
- 显示快速统计（账户数量、活跃任务数）
- 快速入口：新建对话、管理账户

#### 账户管理 (Accounts)
- 账户列表（卡片式），显示别名、Base URL、是否默认
- 添加账户对话框（输入别名 + API Key）
- 删除确认、设为默认

#### 对话页面 (Chat) — 核心页面
- 顶部：账户切换器 + 模型选择器 + 模式选择器
- 中间：对话消息流（用户消息 + MANUS 回复，支持 Markdown 渲染）
- 底部：消息输入框 + 发送按钮
- 右侧/弹出：任务元数据（状态、积分消耗、任务链接）
- 实时轮询：任务 running 时每 5 秒轮询一次状态

#### 任务列表 (Tasks)
- 表格/卡片展示历史任务
- 状态筛选（running/completed/failed）
- 点击任务可进入对话页面继续聊天
- 显示任务链接和分享链接

### 6.3 视觉风格

- **主题**：暗色主题（dark），适合开发者工具
- **色板**：深灰背景 + 蓝色强调色
- **字体**：Inter（正文）+ JetBrains Mono（代码）
- **布局**：DashboardLayout 侧边栏导航

---

## 7. 分阶段实施计划

### 阶段一：后端核心（账户管理 + API 代理）✅ 部分完成

**已完成：**
- [x] 数据库 Schema（accounts + tasks 表）
- [x] 加密模块 `server/crypto.ts`
- [x] 数据库查询助手 `server/db.ts`
- [x] MANUS API 代理模块 `server/manusProxy.ts`

**待完成：**
- [ ] tRPC 路由：`account.create` / `account.list` / `account.delete` / `account.setDefault` / `account.test`
- [ ] tRPC 路由：`manus.proxy`（通用代理，可选）
- [ ] Vitest 测试：账户 CRUD
- [ ] 提交检查点

### 阶段二：后端任务管理

- [ ] tRPC 路由：`task.create`
- [ ] tRPC 路由：`task.continue`（多轮对话）
- [ ] tRPC 路由：`task.get` / `task.poll`
- [ ] tRPC 路由：`task.list` / `task.delete`
- [ ] Vitest 测试：任务管理
- [ ] 提交检查点

### 阶段三：前端基础（布局 + 账户管理）

- [ ] 暗色主题配置（index.css 色板）
- [ ] DashboardLayout 侧边栏配置
- [ ] 路由注册（Home, Accounts, Chat, Tasks）
- [ ] 账户管理页面（增删查 + 设默认）
- [ ] 提交检查点

### 阶段四：前端对话界面

- [ ] Chat 页面：消息流 + 输入框
- [ ] 账户切换器组件
- [ ] 模型/模式选择器
- [ ] 实时轮询任务状态
- [ ] Markdown 渲染 MANUS 回复
- [ ] 提交检查点

### 阶段五：前端任务列表 + 收尾

- [ ] 任务列表页（状态筛选、继续对话）
- [ ] 文件/链接展示组件
- [ ] 首页仪表盘统计
- [ ] 全面测试和优化
- [ ] 最终提交

---

## 8. 开发注意事项

### 8.1 环境变量

项目依赖以下环境变量（由 Manus 平台自动注入）：

| 变量 | 用途 |
|---|---|
| `DATABASE_URL` | TiDB 数据库连接串 |
| `JWT_SECRET` | 会话签名 + API Key 加密密钥派生 |
| `VITE_APP_ID` | Manus OAuth 应用 ID |
| `OAUTH_SERVER_URL` | OAuth 后端地址 |
| `VITE_OAUTH_PORTAL_URL` | OAuth 前端登录页 |

### 8.2 关键命令

```bash
pnpm dev          # 启动开发服务器
pnpm test         # 运行 Vitest 测试
pnpm db:push      # 推送 Schema 变更到数据库
pnpm build        # 生产构建
pnpm check        # TypeScript 类型检查
```

### 8.3 代码规范

- tRPC 路由文件超过 150 行时，拆分到 `server/routers/` 目录
- 所有数据库操作放在 `server/db.ts`
- 前端使用 `trpc.*.useQuery/useMutation`，不要引入额外的 fetch/axios
- 使用 `protectedProcedure` 保护需要登录的路由
- API Key 只在后端解密，永远不传到前端

### 8.4 继续开发指引

1. 阅读本文档了解全貌
2. 查看 `todo.md` 了解当前进度
3. 按阶段顺序继续未完成的任务
4. 每完成一个阶段，运行测试并提交检查点
