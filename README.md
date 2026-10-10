# 六城奇牌 · Node.js + WebSocket 联机原型

要求 Node.js 22 或以上。首次运行 `npm ci`，然后 `npm start`，浏览器访问 http://127.0.0.1:5173 。网页必须通过服务器访问，不支持直接双击 index.html。

执行 `npm test` 检查牌型、小丑、边池、加注、筹码守恒、六个真实 WebSocket 客户端及网页交互。

## 邀请朋友

1. 输入昵称并创建房间，复制邀请链接或六位房间码。
2. 朋友打开相同网站，输入昵称和房间码加入。每位真人点击准备。
3. 房主点击开局。默认要求六名真人；勾选「空位用电脑补齐」可以少于六名真人开局。
4. 本局结算后，由房主开始下一局。房主断线时自动移交给在线真人。
5. 同一浏览器标签页刷新或短暂断线后自动恢复原座位；离线玩家仍受服务端 30 秒计时约束。

## 已实现

- 最多六名真人，各自为战；可选择电脑补位，六个角色随机分配、不重复。
- 每场 10 局，角色整场固定，技能每局 1 次。
- 六种技能：换一张、看首张公共牌、换两张、看对手一张牌、看最后一张公共牌、三选二。
- 换牌先于信息技能结算；固定公共牌；两张万能小丑。
- 三轮下注、庄家轮换、盲注递增、超时处理、全下、主池/边池、平分底池与最终排名。
- 技能阶段和每次下注决策均提供完整 30 秒，按实际截止时间计算倒计时。
- 输光的玩家在下一局自动补充 1,000 试玩筹码，保留角色，技能机会恢复，六人共同玩满 10 局。
- 补充筹码计入累计投入，按「剩余筹码 − 初始筹码 − 累计补充筹码」的净收益排名；补充本身不增加排名分数。
- 五座城市随机主题、角色图鉴、玩法说明、可选音效、移动端布局。

## 原型边界

Node.js 服务端保存完整牌局，并执行发牌、技能、下注、主池/边池结算和超时动作。网页只提交操作，显示按玩家裁剪后的状态。未公开的对手手牌、牌堆和未来公共牌不会发送给其他客户端。查看类技能的信息只发送给发动者。

房间码用于邀请，不是账号登录。重连令牌存储在当前标签页的 sessionStorage 中，不包含在邀请链接里。没有账号系统、长期成绩数据库或跨实例共享存储。Node 版本房间保存在进程内存，重启会丢失；Cloudflare 版本将牌局保存到 Durable Object 存储，并用 Alarm 推进倒计时。离线超过两小时的房间自动清理。电脑玩家采用简单策略，技能平衡仍需实测。

## Render 免费部署

项目根目录的 render.yaml 已配置一个 Singapore 区域、Free 规格的 Node Web Service：

- 构建：`npm ci`
- 启动：`npm start`
- 健康检查：`/healthz`
- 服务端监听 `0.0.0.0` 与 Render 注入的 `PORT`。
- HTTP 和 WebSocket 共用一个端口，线上网页自动使用 `wss://`，无需单独配置 WebSocket 地址。

把本项目推送到 GitHub/GitLab 仓库，在 Render 的 New → Blueprint 选择该仓库，确认 plan 为 Free 后部署。也可以 New → Web Service 手动填写以上参数，选择 Free。

上线后用两台设备打开 Render 提供的同一网址，创建并加入同一房间即可联机。

官方文档： https://render.com/docs/websocket 与 https://render.com/docs/free 。免费服务闲置约 15 分钟后会休眠，下次访问通常需要约一分钟启动。首次启动等待不计入游戏决策时间。免费服务的额度限制见官方文档；此版本只创建一个免费 Web Service，没有付费数据库。

## 文件职责

- server.js：静态文件白名单、HTTP 健康检查、WebSocket 接入与心跳。
- multiplayer.js：房间、座位、权限、重连、私密状态裁剪及服务端计时。
- engine.js：牌型和游戏规则，支持每个玩家提交独立技能计划。
- app.js：房间界面与 WebSocket 客户端；玩家在自己的视角始终位于牌桌底部。
- tests.js / network-tests.js / client-tests.js：规则、真实 WebSocket 与 DOM 交互检查。

## 地域背景图

当前只有主题配色与界面装饰，尚未生成 AI 地域插画。当前会话没有内置 image_gen，Dreamfield NEW_image2_API_KEY 也未配置。

为每个城市保留了可选图片接入口。加入下列图片文件后，在 assets/backgrounds.js 中填入城市与文件路径的对应关系即可加载，例如 `'南京': 'assets/nanjing.webp'`：

- assets/nanjing.webp
- assets/lianyungang.webp
- assets/wuhan.webp
- assets/yancheng.webp
- assets/tianjin.webp

推荐宽幅插画，地标围绕边缘，中央留出较平静的区域供牌桌覆盖。生图提示词保存在 assets/image-prompts.json。背景在开场随机选取，可手动切换；不在每次开场实时调用付费生图接口。

## Cloudflare 免费部署（当前推荐）

安装依赖后运行 `npm run dev:cloudflare` 本地验证，或 `npm run deploy:cloudflare` 使用已授权的 Cloudflare 账号发布。

通过 Cloudflare Workers 的 GitHub 部署选择 sinoatlas/depugame，构建命令填 `npm run build:cloudflare`，部署命令填 `npx wrangler deploy`。使用 Workers Free 与 SQLite Durable Objects，不启用付费计划、数据库或 R2。

`wrangler.jsonc` 配置静态文件和牌局协调器。`cloudflare/worker.mjs` 处理 WebSocket、牌局持久化与 Alarm，复用 `multiplayer.js` 和 `engine.js`。本原型用一个协调器管理最多 100 个房间；大规模使用需拆分为每房间一个对象。

联机验证：`node cloudflare/smoke.cjs`；用 GAME_URL 指定线上网址，TEST_ALARM=1 可验证真实 30 秒技能超时。
