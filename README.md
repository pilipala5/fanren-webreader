# 灵阅书屋 · 网页阅读器

一个用于在线阅读网文与电子书的简洁方案。内置示例书架（凡人修仙传 + 仙界篇），支持登录、进度同步（Cloudflare D1），并可展示服务器“公共书库”。

在线地址
- 首页（书架 + 上传）：
  - https://fanren-webreader.pages.dev/
- 阅读器（直接阅读页）：
  - https://fanren-webreader.pages.dev/viewer
  - 或：https://fanren-webreader.pages.dev/viewer.html

功能简介
- 首页书架：列出内置书与“公共书库（服务器）”，展示每本书的阅读进度。
- 上传书籍：支持 TXT / EPUB / PDF（可选，配合 Functions 写入 D1）。
- 阅读器：章节切换、书本切换、方向键导航、字号（小/中/大）、移动端底部前后章按钮。
- 进度同步：
  - 未登录：每本书的进度保存到浏览器本地（localStorage）。
  - 登录后：进度写入 Cloudflare D1（/api/progress）。

快速开始（本地静态预览）
1. 确保仓库根目录存在两个书籍目录和清单：`凡人修仙传/`、`凡人修仙传·仙界篇/`，每个目录包含章节 txt 与 `manifest.json`（如不可用，可仅预览 UI 和服务器书库）。
2. 启动静态服务器：
   ```bash
   python -m http.server 8000
   ```
3. 浏览器打开：http://localhost:8000/
   - 本地静态预览不发起 /api 请求，默认“离线模式”：登录/上传到服务器不可用；阅读进度保存到本地。

云端部署（免费）
- 使用 Cloudflare Pages + Functions + D1：本仓库包含 Functions 代码与数据库建表脚本，详见 `DEPLOY_CLOUDFLARE.md`。
- 部署后：
  - 首页 `/` 上传书籍并（可选）保存为公共书库。
  - 阅读器 `/viewer` 可通过 `?book=`（内置）或 `?srv=`（服务器书库）打开对应书籍。

API 概览（由 Pages Functions 提供）
- 进度：
  - `GET /api/progress` → { items: { [bookKey]: index } }
  - `POST /api/progress` → { book, index } → { ok }
- 书库（公共）：
  - `GET /api/books` → 列出公共书籍（含章节数与上传者）
  - `POST /api/books`（需登录）→ 新建书：{ title, chapters: [{ index, title, content }] }
  - `POST /api/books/:id/chapters`（需登录+原上传者）→ 批量追加或覆盖章节
  - `GET /api/books/:id` → 书籍元信息与章节清单（不含正文）
  - `GET /api/books/:id/chapter/:index` → 返回章节正文（text/plain）
- 收藏（可选）：
  - `GET /api/favorites`、`POST /api/favorites`

目录说明
- `index.html`：首页（书架 + 上传）
- `viewer.html`：阅读器网页
- `凡人修仙传/`、`凡人修仙传·仙界篇/`：章节文本与 `manifest.json`
- `functions/`：Cloudflare Pages Functions（登录、进度、书库、收藏 APIs）
- `d1_schema.sql`：D1 数据库建表脚本（users、progress、books、chapters、favorites）
- `tools/split_novel.py`：整本 TXT 拆分脚本（可选）

免责声明
- 仅供个人学习交流。原作文本版权归原作者与出版社所有，请勿用于商业用途或未经授权传播。
