# Project TODO

- [x] Database schema: accounts table (encrypted API key, alias)
- [x] Database schema: tasks table (task history, conversation, status)
- [ ] Backend: account CRUD (add, list, delete MANUS accounts)
- [ ] Backend: API proxy to MANUS (inject API key from selected account)
- [ ] Backend: create task (text, attachments, project_id, agent profile)
- [ ] Backend: continue task (multi-turn via task_id/previous_response_id)
- [ ] Backend: get task status and details
- [ ] Backend: list tasks with filtering
- [ ] Frontend: dark theme, global layout with sidebar
- [ ] Frontend: account management page (add/switch/delete accounts)
- [ ] Frontend: chat/conversation page with message input
- [ ] Frontend: task list view with status indicators
- [ ] Frontend: account switcher in chat header
- [ ] Frontend: agent mode and model selector (chat/adaptive/agent, lite/1.6/max)
- [ ] Frontend: display files/links from MANUS responses
- [ ] Frontend: real-time polling for task status
- [ ] Vitest tests for backend routes
