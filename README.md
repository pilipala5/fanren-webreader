# 凡人修仙传 · 网页阅读器

一个简洁的网页阅读器，用于将《凡人修仙传》与《凡人修仙传·仙界篇》的整本 TXT 拆分为章节，并在网页端阅读、切换书本与章节。支持（可选）登录后云端同步阅读进度。

在线地址
- 阅读器（Cloudflare Pages）：
  - https://fanren-webreader.pages.dev/viewer
  - 如果上面的链接不可用，也可以尝试：
    - https://fanren-webreader.pages.dev/viewer.html

功能特性
- 章节切换、书本切换，自动记忆阅读进度（本地存储）。
- 可选登录（用户名+密码）：登录后将阅读进度同步到云端（Cloudflare D1）。
- 字号切换（小/中/大），移动端友好：底部上一章/下一章触控按钮。

快速开始（本地预览）
1. 确保仓库根目录存在两个书籍目录和清单：`凡人修仙传/`、`凡人修仙传·仙界篇/`，每个目录中包含章节 txt 与 `manifest.json`。
2. 启动静态服务器：
   ```bash
   python -m http.server 8000
   ```
3. 浏览器打开：http://localhost:8000/viewer.html
   - 本地静态预览不会发起任何 /api 请求，不会显示登录入口；阅读进度保存到浏览器本地。

云端部署（免费）
- 使用 Cloudflare Pages + Functions + D1：本仓库已包含 Functions 代码与数据库建表脚本，详见 `DEPLOY_CLOUDFLARE.md`。
  - 部署后访问上述在线地址，右上角可登录/注册；登录后进度将保存到 D1。

章节拆分脚本（可选）
- 脚本：`tools/split_novel.py`
  - 默认把 `1.txt`（GB2312/GBK 家族）与 `2.txt`（UTF-8）拆分为章节到两个文件夹：
    - `凡人修仙传/`
    - `凡人修仙传·仙界篇/`
  - 章节识别：
    - “第X章XXXX”（中文数字/阿拉伯数字）
    - “XX外传”
  - 运行：
    ```bash
    python tools/split_novel.py
    # 或处理任意文件
    python tools/split_novel.py <源文件> <编码> <输出目录>
    ```

目录说明
- `viewer.html`：阅读器网页
- `凡人修仙传/`、`凡人修仙传·仙界篇/`：章节文本与 `manifest.json`
- `functions/`：Cloudflare Pages Functions（登录、进度 API）
- `d1_schema.sql`：D1 数据库建表脚本（users、progress）
- `tools/`：拆分脚本

许可证
- 个人学习用途示例项目。原著/文本版权归原作者与出版社所有，请勿未经授权传播商业使用。

