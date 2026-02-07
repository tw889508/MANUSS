# Project TODO

## 阶段一：后端核心（账户管理 + API 代理）
- [x] Database schema: accounts table (encrypted API key, alias)
- [x] Database schema: tasks table (task history, conversation, status)
- [x] Crypto module: AES-256-GCM encrypt/decrypt for API keys
- [x] DB helpers: account CRUD queries (create, list, delete, getById, setDefault)
- [x] DB helpers: task CRUD queries (create, list, getById, update, delete)
- [x] MANUS API proxy module (createTask, continueTask, getTask, listTasks, deleteTask)
- [x] tRPC routes: account.create / account.list / account.delete / account.setDefault / account.test
- [x] Vitest: account CRUD + crypto tests (18 tests passed)
- [x] Checkpoint: 阶段一

## 阶段二：后端任务管理（创建任务 + 多轮对话 + 状态）
- [x] tRPC route: task.create (create new MANUS task)
- [x] tRPC route: task.continue (multi-turn via previous_response_id)
- [x] tRPC route: task.get (get task details + poll status from MANUS)
- [x] tRPC route: task.poll (lightweight status polling)
- [x] tRPC route: task.list (list user tasks with filtering)
- [x] tRPC route: task.delete (delete local task record)
- [ ] Vitest: task management tests
- [ ] Checkpoint: 阶段二

## 阶段三：前端基础（布局 + 账户管理）
- [ ] Dark theme setup, color palette in index.css
- [ ] DashboardLayout with sidebar navigation
- [ ] Routes: Home, Accounts, Chat, Tasks
- [ ] Account management page (add/switch/delete accounts)
- [ ] Checkpoint: 阶段三

## 阶段四：前端对话界面
- [ ] Chat page with message input and conversation display
- [ ] Account switcher in chat header
- [ ] Agent mode selector (chat/adaptive/agent)
- [ ] Model selector (manus-1.6 / lite / max)
- [ ] Real-time polling for task status
- [ ] Markdown rendering for MANUS responses
- [ ] Checkpoint: 阶段四

## 阶段五：前端任务列表 + 收尾
- [ ] Task list view with status indicators
- [ ] Continue existing conversation from task list
- [ ] Display files/links from MANUS responses
- [ ] Home dashboard with quick stats
- [ ] Final testing and polish
- [ ] Checkpoint: 阶段五（最终交付）
