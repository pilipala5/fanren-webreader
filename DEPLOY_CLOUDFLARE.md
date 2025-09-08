Cloudflare Pages + Functions + D1 部署指南（免费）

目标：
- 托管静态网页（`index.html` + `viewer.html` + 章节目录）。
- 使用 Pages Functions + D1 实现登录、阅读进度同步，以及“公共书库”（服务器保存上传书籍）。

1) 准备仓库
- 必需文件：
  - `index.html`：首页（书架 + 上传）
  - `viewer.html`：阅读器
  - `凡人修仙传/`、`凡人修仙传·仙界篇/`：章节 txt 与 `manifest.json`
  - `functions/api/health.js`：健康检查
  - `functions/api/auth/*`：注册/登录/登出/自查
  - `functions/api/progress.js`：进度 API
  - `functions/api/books/*`：公共书库 API（列表/创建/获取/章节）
  - `functions/api/favorites.js`：收藏 API（可选）
  - `d1_schema.sql`：数据库表结构（users、progress、books、chapters、favorites）

2) 创建 Pages 项目
- Cloudflare Dashboard → Pages → Create a project → Connect to Git → 选择本仓库。
- Build 设置：
  - Framework preset: None
  - Build command: 留空
  - Build output directory: `/`
  - 无构建：直接从仓库根目录发布

3) 开启 Functions、绑定 D1、设置环境变量
- Pages 项目 → Settings → Functions：启用 Functions。
- D1 database bindings：Add binding
  - Binding name: `DB`
  - Database: 新建或选择一份 D1 实例
- Environment variables（Bindings → Variables）：
  - `AUTH_SECRET`：长度 ≥ 32 的随机字符串，用于签名会话令牌

4) 初始化/升级数据库
- 方式 A（Dashboard）：Cloudflare Dashboard → D1 → 选择数据库 → Console，执行 `d1_schema.sql` 全部内容。
  - 脚本包含：
    - `users`（登录）
    - `progress`（每用户每书阅读进度）
    - `books`（公共书库书目）
    - `chapters`（公共书库章节内容）
    - `favorites`（收藏）
- 方式 B（Wrangler）：
  ```bash
  npm i -g wrangler
  wrangler d1 execute <DB_NAME> --file=./d1_schema.sql --remote
  ```
  - 脚本使用 IF NOT EXISTS，可重复执行

5) 部署
- Pages → Deployments → 重新部署（或 push 代码触发）。
- 部署完成后：
  - 首页：https://<你的域名>/
  - 阅读器：https://<你的域名>/viewer 或 /viewer.html

6) 功能验证（建议）
- 健康检查：`GET /api/health` 返回 200
- 注册/登录（首页右上角）：创建账户后登录
- 上传到服务器（首页勾选“保存到服务器”）：
  - 选择 TXT/EPUB/PDF，解析后分批写入 D1（如每批 30 章）
  - 上传完成后“公共书库”出现新书，点击进入阅读
- 阅读进度：登录状态切章后 `/api/progress` 会写入记录；公共书库在其他访客可见

7) 本地开发提示
- 仅静态预览：
  ```bash
  python -m http.server 8000
  # 打开 http://localhost:8000/（离线模式：不走 /api）
  ```
- 完整模拟（Wrangler 本地运行 Pages Functions）：
  ```bash
  npm i -g wrangler
  wrangler login
  wrangler pages dev .
  ```
  - 需要在 Pages 项目中创建 D1 并设置 `AUTH_SECRET`，再按 Cloudflare 文档进行本地绑定

8) 常见问题（FAQ）
- 404/500：确认 Functions 已开启、`DB` 绑定存在、`AUTH_SECRET` 已设置；到 D1 Console 检查是否执行了建表 SQL
- 书库/章节过多：Pages 免费层对静态文件数量/体积有限制。内置两本书走静态文件；自定义书籍存 D1，不增加静态体积
- 权限与可见性：公共书库默认“公开”，任何登录用户可创建书籍，但仅创建者可追加/覆盖章节；如需私有/审核，可扩展 API 增加 `visibility` 与权限校验

9) API 速览
- 健康检查：
  - `GET /api/health` → 200 OK
- 认证：
  - `POST /api/auth/register` → { ok }
  - `POST /api/auth/login` → { ok, username }（会设置会话 Cookie）
  - `POST /api/auth/logout` → { ok }（清除会话 Cookie）
  - `GET /api/auth/me` → { ok, loggedIn, username }
- 进度：
  - `GET /api/progress` → { ok, items: { [bookKey]: index } }
  - `POST /api/progress`（需登录）→ { book, index } → { ok }
- 书库：
  - `GET /api/books` → { ok, items: [{ id, title, chapters, uploader }] }
  - `POST /api/books`（需登录）→ { title, chapters: [{ index, title, content }] } → { ok, id }
  - `GET /api/books/:id` → { ok, title, chapters: [{ index, title }] }
  - `POST /api/books/:id/chapters`（需登录+创建者）→ 批量 upsert 章节
  - `GET /api/books/:id/chapter/:index` → text/plain 正文
- 收藏（可选）：
  - `GET /api/favorites`（需登录）→ { ok, items: [{ book, created_at }] }
  - `POST /api/favorites`（需登录）→ { action: 'add'|'remove', book }

10) 编码与文件名
- 建议全站统一使用 UTF-8 编码（无 BOM）。
- 若章节原文为 GBK/GB2312，可在对应 `manifest.json` 中声明 `encoding` 或在导入前转换为 UTF-8。
- HTML/JS 中的中文请保存为 UTF-8，与 `<meta charset="utf-8">` 一致，以避免浏览器乱码。

11) 安全与限制
- 本示例仅做演示，帐号体系与权限模型较简化，不适合生产敏感场景。
- D1 免费层性能/配额有限，建议控制章节体积与并发写入；必要时分页或做限流。

附：部署完成后的快速检查清单
- 访问 `/api/health` 返回 200
- `Settings → Functions → Bindings` 中可见 `DB` 与 `AUTH_SECRET`
- D1 Console 能查询到 `users/progress/books/chapters/favorites` 表
- 首页能看到内置书；登录后能在“公共书库”看到自己上传的书
