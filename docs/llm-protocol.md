# LLM 协议与内容扩展

## 两条传输路径

1. 浏览器 → `InferenceBroker` → 同源 `/api/llm` → 本地服务 → 兼容供应商。
2. 相同本地服务选择 `manual`，写请求文件，等待操作者写回复。静态站点也可在设置中手动导出/载入 JSON。

`POST /api/llm/requests` 接收完整请求，返回服务端作业 ID。`GET /api/llm/requests/:id` 查询状态、回复、耗时、token usage（供应商返回时）；`DELETE` 取消。请求进入浏览器的 Soar 安装接口后仍要通过规则和证据检查。服务默认仅监听 localhost，不提供公网身份认证；部署时需自行增加认证、用户隔离和配额。

## 信封与回复

以实际导出的 `context.contract` 为准。不要猜测事件、角色、物品、规则版本或动作 ID。

```json
{
  "requestId": "knowledge-1",
  "epoch": 1,
  "baseRevision": 1,
  "contentRevision": 1,
  "evidence": ["event-24"],
  "summary": "我听到了朋友的顾虑，下次愿意先让她说完。",
  "rules": [],
  "retireRules": [],
  "goals": [],
  "cancelGoals": [],
  "cognition": []
}
```

以上 ID 仅说明格式。必须从实际请求复制信封和自己看得到的证据。可以只返回有依据的总结而不增加规则。真实完整示例是 `research/runtime/01-t.json` 等记录中的 `request` 和 `reply`。

- `rules`：声明式选择条件，经 `compilePolicy` 生成 `learned*` Soar productions，在隔离 agent 内解析验证后安装。可选择已有动作、对象和提案类型；条件来自 `self` / `candidate` / `memory`。
- `goals`：目标 `id/title/motive/priority/deadline/about/activeWhen/steps`，可选 `successWhen` / `abandonWhen`。一步可包含 `action/roles/args/when/alternatives/skipWhen/repeatUntil/spacingMinutes` 或 `{until:{key,value}}`。
- `retireRules` / `cancelGoals`：只能退役自己的生成规则、替换自己的目标，不能删除基座规则或修改别人。
- `cognition`：数值 `{field,delta,reason}`；枚举字段用 `{field,value,reason}`。变化通过字段注册与每日/累计边界检查。

规则优先级通常 50–100。让课程、紧急身体需求和当前问题回应保留优先权。模型应在动作自己的范围内规划；高优先级不会使不可用动作绕过执行条件。

表达式是 JSON，例如 `{"op":"eq","left":"$clock.period","right":"after-school"}`、`{"op":"gte","left":"$relationships.m.trust","right":25}`。个人记忆快捷键是 `$knownByKey.subject:predicate`。未注册路径不会获得新能力，不应猜测任意对象结构。

## 谈话计划要写出前提与结果

发言需要同一会话、双方就位、轮到自己。为发言提供 `start-conversation` 和 `seek-contact` 替代方法，可以在被打断后重新接近。`start-conversation` 邀请对方，对方仍可拒绝。使用私人内容时设 `args.access="private"`。

`propose-reconnect` / `propose-support` 是提案，结果写入个人 `对方:response-reconnect` 或 `对方:response-support`。后续步骤应等待 `accepted`，并对 `declined` 提供放弃/改期条件。重试不能无限堆积同类请求。

## 新增物品与交互

维护 `scripts/author-social-content.py` 或其他校园内容生成脚本，再运行 `npm run author`。也可通过 `world.extendContent(pack,objects)` 在运行时添加扩展包。核心模块不包含校园人物/物品 ID。

1. 物品 `types` 声明 tags、状态及可见字段、碰撞体、交互槽、进出位置与渲染数据；场景声明实例。
2. `actions` 声明角色绑定、可用条件、参数、时长、动画、资源要求、注意力与 effects。已有 primitive 足够时无需增加决策代码。
3. `routines` 定义共同作息，`projects` 定义持久项目模板；人物 profile 选择项目并设置认知字段。
4. `appraisals` 定义实际事件如何影响观察者自己的有向关系；`relationships` 注册新维度。
5. `school-policies.json` / 生成器中的 `common` 和 `people` 定义共同及个人选择逻辑。LLM 新策略使用同一契约编译。

不要把未观察事件写入角色记忆来强推故事。不要把“行动完成”当作对方同意。也不要通过放大优先级让角色忽略所有作息。

## 运行和费用调节

`.env.example` 提供并发、每分钟请求上限、输出 token 上限和截止。`LLM_ALLOWED_HOSTS` 可额外配置受控代理的主机名列表；默认 API 拒绝其他 Origin 和 Host。密钥只在服务端。

真正接模型时，先保持并发 1、每分钟 4 次，在设置中观察队列和耗时，再根据供应商实测调整。不要用本次人工接管耗时估计模型 token 速率或费用。`npm test` 使用本地/mock 传输，不向供应商发送请求。
