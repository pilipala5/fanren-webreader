Cloudflare Pages + Functions + D1 部署指南（免费）

内容：托管静态网页（viewer.html + 章节文件夹），并用 Pages Functions + D1 实现多人阅读进度同步。

1) 准备仓库
- 确保以下文件存在：
  - viewer.html
  - 凡人修仙传/、凡人修仙传·仙界篇/（切章后的 txt 与 manifest.json）
  - functions/api/progress.js（进度 API）
  - functions/api/health.js（健康检查）
  - d1_schema.sql（数据库表结构）

2) 连接 Cloudflare Pages
- 登录 Cloudflare Dashboard → Pages → Create a project → Connect to Git → 选择你的仓库。
- Build 设置：
  - Framework preset: None
  - Build command: 留空
  - Build output directory: /
  （无构建，直接从仓库根目录发布）

3) 开启 Functions、D1 与环境变量
- 打开 Pages 项目 → Settings → Functions。
  - Functions: 开启
  - D1 database bindings: Add binding
    - Binding name: DB
    - Database: 新建或选择一个 D1 实例
  - Environment variables (Bindings → Variables)：
    - 新增 `AUTH_SECRET`（长度 ≥ 32 的随机字符串，用于签名会话令牌）

4) 初始化数据库表
- 方式 A（Dashboard）：
  - Cloudflare Dashboard → D1 → 进入你刚创建的数据库 → Console。
  - 粘贴并执行仓库里的 d1_schema.sql 内容（包含 users 与 progress 两张表）：
    CREATE TABLE IF NOT EXISTS progress (
      username TEXT NOT NULL,
      book TEXT NOT NULL,
      idx INTEGER NOT NULL,
      updated_at REAL NOT NULL,
      PRIMARY KEY (username, book)
    );
- 方式 B（Wrangler，本地可选）：
  - 安装：npm i -g wrangler
  - 关联数据库：wrangler d1 execute <DB_NAME> --file=./d1_schema.sql --remote

5) 部署
- 回到 Pages 项目 → Deployments → 重新部署（或 push 一次代码触发）
- 部署完成后访问 *.pages.dev 域名即可。

6) 使用
- 右上角圆形按钮：点击打开登录/注册弹窗（页面初始不会强制弹出）。
  - 注册：用户名（3–32位，字母数字_-.）+ 密码（≥6位），注册成功后自动登录。
  - 登录：登录成功后右上角显示用户名（过长会省略显示）。
- 登录后：切章会自动同步到云端（按用户隔离）。
- 未登录：进度保存在浏览器本地（localStorage）。

- 本地预览小贴士：
- 仅静态预览（python -m http.server）时，页面不会发起任何 /api/* 请求，默认进入“离线模式”：
  - 登录/注册 UI 隐藏（右上角按钮不显示）；
  - 控制台不再出现 /api/* 的 404；
  - 可正常阅读与切换章节，进度仅保存在浏览器本地。
- 如需在本地体验登录/进度同步：
  - 方式 A：部署到 Cloudflare Pages（推荐）。
  - 方式 B：使用 Cloudflare Wrangler 在本地运行 Pages Functions（完整模拟）：
    - 安装：npm i -g wrangler；登录：wrangler login
    - 运行：wrangler pages dev .
    - 在 Pages → Settings 里创建 D1 并设置 `AUTH_SECRET` 后再本地绑定（参考官方文档）

7) 自定义域名与 HTTPS（可选）
- Pages 项目 → Custom domains → 绑定你的域名。
- 按向导配置 DNS（Cloudflare 托管 DNS 最简单）。

8) 常见问题
- 看不到 /api/progress：确认 functions/api/progress.js 路径正确，且 Pages → Settings → Functions 已开启，D1 绑定名为 DB。
- 500 报错：到 D1 Console 确认是否已执行建表 SQL。
- 章节文件过多：Pages 免费层对文件数与体积有配额，当前两部书（约 2–3k 文件）通常在配额内。
