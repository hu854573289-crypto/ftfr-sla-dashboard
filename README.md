# FTFR Service SLA Dashboard — 部署指南

这是可以自己部署的完整版本：一个 Node.js/Express 后端 + MongoDB 数据库 + 单页前端。
部署后，任何人打开这个网址看到的都是同一份实时数据，导入 Excel、修改超期原因备注都会
真正保存下来，不再依赖 Claude 账号或付费版限制。

架构很简单：

```
浏览器 (public/index.html)
   │  fetch('/api/tickets'), fetch('/api/annotations')
   ▼
Express 服务器 (server.js)  ──同一个 Node 进程，Render 上跑这一个服务
   │  mongoose
   ▼
MongoDB Atlas（免费额度够用）
```

只需要三个免费账号：**GitHub**（放代码）、**MongoDB Atlas**（数据库）、**Render**（跑服务器）。

---

## 第一步：把代码推到 GitHub

1. 在 [github.com](https://github.com) 新建一个仓库（Repository），比如叫 `ftfr-sla-dashboard`，设为 Private 或 Public 都可以。
2. 把这次拿到的所有文件（`server.js`、`package.json`、`public/index.html`、`.gitignore` 等）放进一个文件夹，然后：

```bash
cd ftfr-sla-dashboard
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<你的用户名>/ftfr-sla-dashboard.git
git push -u origin main
```

（如果你不熟悉命令行，也可以直接在 GitHub 网页上点 "Add file → Upload files" 把文件夹拖上去。）

---

## 第二步：创建 MongoDB Atlas 免费数据库

1. 打开 [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas/register)，免费注册一个账号。
2. 创建一个新 Project，然后创建一个 **免费的 M0 集群**（Free Shared Cluster，选哪个云厂商/区域都可以，选离你近的即可）。
3. 集群建好后：
   - 左侧 **Database Access** → Add New Database User：设置一个用户名和密码（记下来，等下要用）。
   - 左侧 **Network Access** → Add IP Address → 选 **Allow Access from Anywhere**（`0.0.0.0/0`）。这是最简单的方式；如果你更注重安全，之后可以换成只允许 Render 的出口 IP。
4. 回到集群页面，点 **Connect → Drivers**，复制给出的连接字符串，形如：

   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

   把 `<username>` `<password>` 换成你刚才设置的账号密码，并在结尾加上数据库名，比如：

   ```
   mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/ftfr_sla?retryWrites=true&w=majority
   ```

   这一整串就是你的 `MONGODB_URI`，第三步会用到。

---

## 第三步：在 Render 上部署

### 方式 A：用 render.yaml 一键部署（推荐）

1. 打开 [render.com](https://render.com)，用 GitHub 账号登录（会自动关联你的 GitHub）。
2. 点 **New → Blueprint**，选择你刚才推送的 `ftfr-sla-dashboard` 仓库。
3. Render 会自动读取仓库里的 `render.yaml` 并识别出一个 Web Service。
4. 它会提示你填写 `MONGODB_URI` 这个环境变量——把第二步拿到的连接字符串粘贴进去。
5. 点 **Apply**，等待几分钟完成构建和部署。

### 方式 B：手动创建 Web Service

1. Render 首页点 **New → Web Service**，选择你的 GitHub 仓库。
2. 配置：
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free 即可
3. 在 **Environment** 里添加变量：
   - `MONGODB_URI` = 第二步拿到的连接字符串
4. 点 **Create Web Service**，等待部署完成。

部署成功后，Render 会给你一个类似 `https://ftfr-sla-dashboard.onrender.com` 的网址——这就是可以发给同事的分享链接。

---

## 第四步：验证

打开 Render 给的网址，应该能看到看板正常加载数据。可以试着：

- 导入一份 Excel，刷新页面确认数据还在（说明确实存进了 MongoDB，而不是只存在浏览器里）。
- 换一个浏览器/手机打开同一个网址，确认看到的是同一份数据。
- 给一条超期工单选择 Category/Reason/Cause statement，刷新页面确认备注还在。

如果打不开或者数据没保存，先看 Render 的 **Logs** 标签页，通常是 `MONGODB_URI` 填错了，
或者 MongoDB Atlas 的 Network Access 没放行。

---

## 本地开发（可选）

如果你想在自己电脑上先跑起来看看：

```bash
npm install
cp .env.example .env
# 编辑 .env，把 MONGODB_URI 换成你自己的连接字符串
npm start
```

然后打开 `http://localhost:3000` 即可。

---

## 文件说明

| 文件 | 作用 |
|---|---|
| `server.js` | Express 服务器：提供 `/api/tickets`、`/api/annotations` 接口，并托管前端静态文件 |
| `package.json` | Node 依赖声明（express、mongoose、dotenv） |
| `public/index.html` | 前端页面（看板本身），通过 `fetch()` 调用后端接口读写数据 |
| `render.yaml` | Render 一键部署的配置文件（Blueprint） |
| `.env.example` | 环境变量示例，本地开发时复制成 `.env` 使用 |
| `.gitignore` | 避免把 `node_modules/`、`.env` 等推上 GitHub |

## API 一览

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/tickets` | 获取当前所有工单数据 |
| PUT | `/api/tickets` | 用请求体（工单数组）整体替换数据（导入 Excel 时用） |
| DELETE | `/api/tickets` | 清空工单数据 |
| GET | `/api/annotations` | 获取所有超期原因备注（按工单号为 key 的对象） |
| PUT | `/api/annotations` | 整体替换备注（前端每次编辑后会调用） |
| PUT | `/api/annotations/:orderNo` | 更新单个工单的备注 |
| DELETE | `/api/annotations/:orderNo` | 删除单个工单的备注 |
| GET | `/api/health` | 健康检查，返回 MongoDB 连接状态 |

## 后续可以做的事

- 想要"只有我能改、别人只能看"的权限区分：可以加一个简单的密码/token 校验中间件，
  写操作（PUT/DELETE）需要携带正确的密钥才能执行。跟我说一声，我可以帮你加上。
- 想要更细的历史记录（谁在什么时候改了什么）：可以把 Annotation 的更新记录改成
  "追加一条历史记录"而不是覆盖，这样能看到完整的修改轨迹。
