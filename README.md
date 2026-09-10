# 青禾高中 · Soar + 异步 LLM

可本地运行的 2.5D 校园生活 demo。玩家主控林知夏，其他 7 个角色使用独立的原生 Soar agent、个人记忆、关系评价与目标。19 个区域通过公共通路连接，物品、交互、作息和情景由 tuning 定义。

现有能力包括跨人物关系谋划、经历引发的有限人格变化、每日反思队列、异步模型接口及人工接管调试。LLM 返回声明式知识，经校验编译为 Soar productions 或写入原生个人目标；NPC 继续选择和执行行动。情景提供机会与冲突，不能指定他人的接受或结局。

课堂 Situation 已接入：工作日 08:44 起，老师和同学可在持续听课中自主讲解、追问、支持和回应。玩家可以直接使用情景面板里的发言选项。实际回应会改变现场人物的关系；本人答应课后补做才产生自己的持续目标。没有固定发言者，也不会强制把讨论推进到和解。机制和实测见 [课堂 Situation](docs/classroom-situations.md)。

## 本地运行

需要 Node.js 22+。原生 Soar WASM 和 Three.js 已随仓库提供，正常运行不用重新编译。

```bash
npm ci
cp .env.example .env
npm start
```

打开 `http://localhost:3000`。默认 `LLM_PROVIDER=manual`，不产生模型费用；没有操作者回复时，角色仍按既有规则生活。游戏设置可查看推理队列、耗时和导入/导出请求。人物与计划面板显示真实目标、阶段、关系和反思记录。

单独开发前端可用 `npm run dev`。它只启动静态前端，不启动 LLM 服务。静态托管版本使用手动导出/导入；需要自动运行时反思，请使用 `npm start` 或自行部署同源 API。

## 接入自己的模型

在本地 `.env` 设置：

```dotenv
LLM_PROVIDER=compatible
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=你的模型名
LLM_API_KEY=你的密钥
LLM_CONCURRENCY=1
LLM_REQUESTS_PER_MINUTE=4
LLM_TIMEOUT_MS=60000
LLM_MAX_OUTPUT_TOKENS=2800
```

重启 `npm start`。服务端调用 `<LLM_BASE_URL>/chat/completions`；如供应商不支持 `response_format`，设置 `LLM_JSON_MODE=false`。替换其他协议只需调整 `server/provider.mjs`，无需改世界执行和 Soar 内核。密钥不进入浏览器、tuning、存档或 Git。

默认每天游戏时间 18:00 为 7 个 NPC 各排一次反思；每个角色独立提交，限速排队。上下文仅含该角色已知信息。60 秒截止包含服务端处理时间；模型超时或非法回复保留原策略。浏览器额外留 2 秒网络余量。高倍速下允许跳过已被新一天替代的过期排队任务。

## 开发时由人或 Codex 充当 LLM

保持 `LLM_PROVIDER=manual`。服务把实际运行请求写到 `.runtime-inbox/<id>.request.json`，操作者读完后写同名 `<id>.reply.json`。文件中的 `request.id` 和文件名中的服务器作业 ID 是两个不同 ID，回复须复制请求信封字段。不会自动调用当前 ChatGPT 会话。

```bash
npm run test:live
```

这是独立的三人实时调试实验：只设置一次公开排斥事件，之后放开自治。操作目录是 `.runtime-lab/`，需要操作者逐次读取并回答至少六份真实请求（根据排队和跨日情况可能更多）。为容纳人工操作，该实验的回复截止为 180 秒；真实等待、行动轨迹和安装耗时写入 `research/runtime/`。它不是无人值守测试，也不代表模型供应商延迟。普通自动化回归使用 `npm test`。

## 项目导航

| 目录 | 职责 |
|---|---|
| `dist/campus/` | 游戏 UI、Three.js 场景、动画、Worker、服务门面、存档迁移 |
| `dist/content/school-*.json` | 校园场景、物品与交互 tuning、共同和个人策略 |
| `dist/foundation/` | 通用感知、执行、资源占用、会话、群组、约定、目标、关系与反思 |
| `dist/soar/` | 原生 WASM、SML 适配、记忆规则与学习机制 |
| `dist/llm/` | 可替换 provider 的异步调度、取消、截止和限流 |
| `server/` | 本地同源 API、人工回复目录、兼容模型供应商适配 |
| `scripts/author-*.py` | 内容生成；`npm run author` 重建校园 tuning |
| `tests/foundation/`, `tests/campus/`, `tests/runtime/` | 内核、校园行为、反思和 HTTP 回归 |
| `research/runtime/` | 本轮真实人工接管输入、回复、时序和观察结果 |
| `docs/` | 架构、协议、扩展方式、历史实验记录 |

`dist/` 是当前直接运行的源代码目录，不是可删除的构建缓存。`dist/family.html`、根目录旧家庭模块及 `tests/*.test.mjs` 是保留的历史实验，未接入当前校园主循环；历史说明见 [legacy-family.md](docs/legacy-family.md)。当前校园默认测试集不包含历史家庭测试。

## 验证与扩展

```bash
npm test
npm run author
```

测试运行真实 Soar WASM，检查观察范围、关系更新、长期目标与替代方法、人格阈值改变原生选择、真实接受后的等待完成、日终去重、读档世代、异步超时与限流，并覆盖课程、群组、资源和空间回归。

- [本轮认知与异步架构](docs/social-cognition.md)
- [课堂机会、个人回应与课后承诺](docs/classroom-situations.md)
- [模型协议和 tuning 扩展](docs/llm-protocol.md)
- [调试结果与性能记录](research/runtime/README.md)
- [通用基座](docs/foundation.md)、[校园空间](docs/campus-space.md)、[长期计划](docs/campus-planning.md)

目前的“人格演化”是有经历依据、有每日和累计边界的领域参数/策略变化，并非完整心理学模型。行动仍来自已注册能力；新增效果语义要实现一个通用执行 primitive。没有在线 AI 导演或任意自然语言动作执行器。本轮由 Codex 在开发过程中处理实际请求，外部模型调用为 0；供应商质量、费用和 P95 延迟仍需用你的模型实测。

## 原生内核与许可

重建仅在修改 C++ 桥接时需要：

```bash
python3 scripts/build-soar.py /path/to/Soar-releases-9.6.5 /path/to/emsdk /path/to/wasm-build
```

现有产物使用 Soar 9.6.5 / Emscripten 3.1.74。参见 `dist/soar/SOAR-LICENSE.md` 和 `dist/vendor/THREE-LICENSE.txt`。校园角色与场景为程序化卡通表达；历史家庭 demo 的题材来源说明保留在历史文档中。
