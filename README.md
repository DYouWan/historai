# HistorAI

基于 Next.js 的 AI 历史故事创作平台，集成多家大模型（DeepSeek、通义千问等）与多媒体生成（文生图、图生视频）。

## 环境要求

- **Node.js** 20 ~ 22（推荐 22）— [下载地址](https://nodejs.org/)
- **npm** 9+（随 Node 自带）


## 快速开始

```bash
# 1. 克隆项目
git clone <repo-url> historai
cd historai

# 2. 确认 Node 版本为 22
node -v

# 3. 安装依赖
npm install

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 API Key（至少填一个文本模型密钥）

# 5. 启动开发服务器
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000) 即可访问。
Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 环境变量

复制 `.env.example` 为 `.env`，按需填写以下密钥：

| 变量 | 用途 |
|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek 文本模型 |
| `DASHSCOPE_API_KEY` | 通义千问 / 阿里云文生图 |
| `ARK_API_KEY` | 火山引擎（Seedream 文生图、Seedance 图生视频） |
| `HAPPYHORSE_API_KEY` | HappyHorse 图生视频 |
| `OPENAI_API_KEY` | OpenAI DALL·E 3 文生图 |
| `TENCENT_COS_*` | 腾讯云 COS 图片存储（可选） |

文本模型和媒体模型的档案配置分别在 `llm-profiles.json` 和 `media-profiles.json` 中管理。

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run start` | 运行生产版本（需先 build） |
| `npm run lint` | 代码检查 |

## 项目结构

```
historai/
├── src/
│   ├── app/            # Next.js 页面与 API 路由
│   ├── components/     # React 组件
│   ├── data/           # 静态数据
│   └── lib/            # 工具函数与服务端逻辑
├── llm-profiles.json   # 文本模型档案配置
├── media-profiles.json # 媒体模型档案配置
├── .env.example        # 环境变量模板
└── package.json
```

## 多机协作提示

- 项目已通过 `.nvmrc` / `.node-version` 固定 Node 版本；使用 fnm 进入目录会自动切换，无需手动操作
- `package-lock.json` 已锁定依赖版本，确保各机器安装一致的依赖
- `.env` 包含密钥，已在 `.gitignore` 中忽略，每台机器需自行配置

## 可安全删除的文件

以下文件为自动生成的缓存，删除后运行 `npm run dev` 会自动重建：

| 文件/目录 | 说明 |
|-----------|------|
| `.next/` | Next.js 构建缓存 |
| `tsconfig.tsbuildinfo` | TypeScript 增量编译缓存 |
| `next-env.d.ts` | Next.js 类型声明（自动生成） |
