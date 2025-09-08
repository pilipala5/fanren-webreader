Cloudflare Pages + Functions + D1 部署指南（免费）

目标：托管静态网页（index.html + viewer.html + 章节目录），并用 Pages Functions + D1 提供登录进度同步与“公共书库”（服务器保存上传书籍）�?
1) 准备仓库
- 必需文件�?  - `index.html`（首页：书架 + 上传�?  - `viewer.html`（阅读器�?  - `凡人修仙�?`、`凡人修仙传·仙界篇/`（切章后�?txt �?manifest.json�?  - `functions/api/health.js`（健康检查）
  - `functions/api/auth/*`（登�?登出/自查�?  - `functions/api/progress.js`（进�?API�?  - `functions/api/books/*`（公共书�?API：列�?创建/获取/章节�?  - `d1_schema.sql`（数据库表结构：users、progress、books、chapters�?
2) 创建 Pages 项目
- Cloudflare Dashboard �?Pages �?Create a project �?Connect to Git �?选择本仓�?- Build 设置�?  - Framework preset: None
  - Build command: 留空
  - Build output directory: /
  - 无构建：直接从仓库根目录发布

3) 开�?Functions、绑�?D1、设置环境变�?- Pages 项目 �?Settings �?Functions：开�?Functions
- D1 database bindings：Add binding
  - Binding name: `DB`
  - Database: 新建或选择一�?D1 实例
- Environment variables（Bindings �?Variables）：
  - `AUTH_SECRET`：长度≥32 的随机字符串，用于签名会话令�?
4) 初始�?升级数据�?- 方式 A（Dashboard）：Cloudflare Dashboard �?D1 �?选择数据�?�?Console，执�?`d1_schema.sql` 全部内容�?  - 脚本包含�?    - `users`（登录）
    - `progress`（每用户每书阅读进度�?    - `books`（公共书库书目）
    - `chapters`（公共书库章节内容）
- 方式 B（Wrangler）：
  ```bash
  npm i -g wrangler
  wrangler d1 execute <DB_NAME> --file=./d1_schema.sql --remote
  ```
  - 脚本使用 IF NOT EXISTS，重复执行是安全的�?
5) 部署
- Pages �?Deployments �?重新部署（或 push 代码触发）�?- 部署完成后：
  - 首页：https://<你的域名>/
  - 阅读器：https://<你的域名>/viewer �?/viewer.html

6) 功能验证（建议）
- 健康检查：`GET /api/health` �?200
- 注册/登录（首页右上角）：创建账户后登�?- 上传到服务器（首页勾选“保存到服务器”）�?  - 选择 TXT/EPUB/PDF �?解析后自动分块写�?D1（首�?30 章，随后�?30 章一批）
  - 上传完成后“公共书库”出现新书，点击进入阅读
- 阅读进度：登录状态切章后 `/api/progress` 应写入记录；公共书库在其他访客可�?
7) 本地开发提�?- 仅静态预览：
  ```bash
  python -m http.server 8000
  # 打开 http://localhost:8000/（离线模式，�?/api�?  ```
- 完整模拟（Wrangler 本地开�?Pages Functions）：
  ```bash
  npm i -g wrangler
  wrangler login
  wrangler pages dev .
  ```
  - 需�?Pages 项目设置里创�?D1 并设�?`AUTH_SECRET`，再在本地绑定（参�?Cloudflare 文档）�?
8) 常见问题
- 404/500：确�?Functions 已开启、`DB` 绑定存在、`AUTH_SECRET` 设置完成；到 D1 Console 检查是否已执行建表 SQL�?- 书库与章节太多：Pages 免费层对文件�?体积有限制。内置两部书是静态文件；自定义书籍存�?D1，不增加静态文件体积�?- 权限与可见性：当前公共书库默认“公开”，任何登录用户都可创建书籍，但仅创建者可追加/覆盖章节；如需私有/审核，扩�?API 增加 `visibility` 与权限校验即可�?
9) API 速览
- 书库�?  - `GET /api/books` �?列表
  - `POST /api/books`（需登录）→ `{ title, chapters: [{index,title,content}] }` �?`{ ok, id }`
  - `POST /api/books/:id/chapters`（需登录且为创建者）�?批量 upsert 章节
  - `GET /api/books/:id` �?元信�?+ 章节清单
  - `GET /api/books/:id/chapter/:index` �?正文（text/plain�?- 进度�?  - `GET /api/progress`、`POST /api/progress`

