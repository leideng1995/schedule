# 行程预约系统(schedule)

一个基于 Spring Boot 的行程预约与邀约系统。普通用户可以预约自己的行程、邀请其他用户;管理员和普通用户都可以建组并发起组内邀约;预约和接受邀请时会检查时间冲突,邀请前可以查看对方是否有空。参与者可以在行程下留言和回复,系统通过站内通知、邮件和活动开始前的弹窗提醒相关的人。

## 功能

### 用户与权限

| 角色 | 能做什么 |
|---|---|
| 普通用户 | 预约自己的行程;邀请其他普通用户;创建组(成员**同意后**才算加入),对组内已加入的成员发起组内邀约;回复行程邀请和入组邀请 |
| 管理员 | 创建组(成员**直接加入**),给组内成员发起组内邀约(管理员本人不作为参与人);用户管理:新建用户、重置密码、移除不合适的头像;可以删除任何留言 |

- 登录:用户名或邮箱都可以登录;自助注册的是普通用户。
- 密码:8~64 位,同时包含字母和数字,使用 PBKDF2-HMAC-SHA512 加盐哈希存储。
- 管理员可以把用户密码重置为 `123456`,该用户下次登录后必须先修改密码才能继续使用。
- **忘记密码**:登录页输入用户名或邮箱,系统把重置链接发到账号的邮箱。链接 30 分钟内有效、只能用一次,再次申请后旧链接失效;数据库只存链接令牌的 SHA-256。无论账号是否存在都返回同样的提示,不能用来试探别人的账号。同一账号 1 分钟 1 封、1 小时 5 封,同一 IP 1 小时 20 次。
- 密码改过之后(邮箱重置、管理员重置、自己修改),其他用旧密码登录的会话都会失效;自己修改密码的那个页面保持登录。

### 个人信息和头像

- 在「个人信息」里修改姓名、邮箱,上传或移除头像;选好的图片先预览,点「保存」后才生效。
- 头像支持 PNG、JPG、GIF,不超过 2MB、4096×4096。服务器按文件内容判断真实格式,居中裁成正方形并缩成 256×256 后重新保存为 PNG(去掉照片里的位置等元数据,原图不保存)。
- 头像显示在顶栏、行程卡片、参与人、组成员、留言和选人列表里;没有头像的用户显示姓名首字。

### 行程与邀请

- 被邀请的人先是"待确认",**同意后**这个行程才进入他的日程;已同意的也可以改为"不参加了"。
- 拒绝过的人可以被再次邀请;已同意或待确认的不会重复邀请。
- 发起人可以追加邀请或取消行程;不能预约已经过去的时间。
- 行程状态:未开始 / 进行中 / 已结束 / 已取消。

### 编辑行程

- 发起人可以修改标题、时间、地点、说明;已取消或已结束的行程不能修改。
- 只改文字时参与人状态不变;**改了时间**会重新检查冲突,除发起人外已同意的人改回"待确认",需要重新确认。
- 两种修改都会通知未拒绝的参与人(站内通知 + 邮件,邮件里列出改了什么)。

### 邀请前查看是否有空

- 预约、追加邀请、编辑行程时,选人列表里每个人旁边显示所选时间段「空闲」或「忙 10:00-11:30」;选择组内邀约时汇总组里有几个人忙。
- 只显示忙闲时间,不显示对方行程的标题、地点等内容;只查普通用户,一次最多 200 人、31 天。

### 时间冲突提示

- 预约、邀请、同意邀请、修改行程时间时,如果某个参与人在这个时间段已有**已同意**的行程,接口返回 `409` 和冲突明细(谁、哪个行程、什么时间)。
- 冲突只做提示,不强制禁止:前端列出冲突后,用户确认可以带 `force: true` 重新提交。
- 首尾相接(一个 10:00 结束、另一个 10:00 开始)不算冲突;待确认的邀请不计入冲突。

### 行程留言

- 发起人和未拒绝的参与人可以在行程下留言(最多 500 字);能看到行程的人都能看到留言;已取消的行程只能看。
- **回复**:可以回复别人的留言(不能回复自己的)。回复只有一层,回复「回复」时仍归在同一条留言下,并标明「回复 @某人」;被回复的人会收到通知和邮件。
- **编辑**:只能编辑自己的留言,编辑过的显示「(已编辑)」;编辑不发通知。
- **删除**:除管理员外只能删除自己的。自己的留言下面有别人的回复时,删除后显示「该留言已删除」,别人的回复保留;管理员删除留言时下面的回复一起删除。

### 站内通知和开始提醒

- 顶部铃铛显示未读通知数,面板里分「全部 / 未读 / 给我的留言」;点一条通知会标记已读并跳到相关的行程(留言通知会定位到那条留言)或组。
- 「给我的留言」:别人在你参与的行程里的留言,以及别人对你的回复。
- **活动开始前 5 分钟提醒**:后台每 30 秒检查一次,给要参加的人(已同意的参与人)生成提醒,页面右上角弹窗,可以「查看详情」或「知道了」;开启桌面提醒后,页面在后台标签页时也会弹出系统通知。改了时间会按新时间再提醒。
- 页面每 30 秒轮询一次;有新通知时自动刷新页面数据。

### 通知一览

| 事件 | 收件人 | 站内 | 邮件 |
|---|---|---|---|
| 被邀请参加行程(单独邀请、组内邀约、追加邀请) | 被邀请人(该时间段已有行程时邮件里会提醒) | ✓ | ✓ |
| 同意 / 拒绝行程邀请 | 行程发起人 | ✓ | ✓ |
| 修改行程 | 未拒绝的参与人 | ✓ | ✓ |
| 行程被取消 | 已同意和待确认的参与人 | ✓ | ✓ |
| 被邀请加入组 / 被管理员加入组 | 被邀请或被加入的人 | ✓ | ✓ |
| 同意 / 拒绝入组邀请 | 组的创建者 | ✓ | ✓ |
| 别人在我参与的行程里留言 | 发起人和未拒绝的参与人(不含留言人) | ✓ | |
| 别人回复了我的留言 | 被回复的人 | ✓ | ✓ |
| 活动 5 分钟内开始 | 已同意的参与人 | ✓(弹窗) | |
| 申请重置密码 | 账号本人 | | ✓ |

- 都在事务提交后发出:操作失败(如回滚)不会通知;邮件异步发送,发信慢或失败不影响预约等操作,失败只记日志。
- 每个收件人单独一封邮件,不会暴露其他用户的邮箱;没填邮箱的用户自动跳过。
- 没有配置发件邮箱时不发邮件,只在日志里提示,站内通知和其他功能照常使用。

### 页面

- **登录页**:登录、注册、忘记密码;`reset-password.html` 为邮件里的重置密码页面。
- **顶栏**:通知铃铛、头像、个人信息、修改密码、退出。
- **我的行程**:欢迎区(下一个行程倒计时)、今日 / 本周 / 待回复 / 冲突统计,列表视图和周视图(点击空白时段快速预约)、月历、"接下来"列表、按类型着色和筛选;行程详情里编辑、邀请、留言。
- **待我回复**:行程邀请和入组邀请,一键同意或拒绝。
- **我的组**:创建组、管理成员、组内邀约。
- **用户管理**(管理员):查看、搜索、新建用户,重置密码,移除头像。

## 技术栈

- Java 27、Spring Boot 4.1(Spring MVC、JDBC、Mail、定时任务 `@Scheduled`、异步 `@Async`)
- MyBatis 4.1(XML 映射)、MySQL 8
- Lombok 1.18.48
- 前端:原生 HTML / CSS / JavaScript(位于 `src/main/resources/static`,无需单独构建)
- 登录状态:服务端 Session + HttpOnly Cookie

## 快速开始

### 1. 准备环境

- JDK 27
- MySQL 8(本地运行在 `localhost:3306`)
- 不需要单独安装 Maven,项目自带 Maven Wrapper(`mvnw` / `mvnw.cmd`)

### 2. 配置

敏感配置(数据库密码、邮箱账号和密码、初始管理员密码)**不写在仓库里**。在项目根目录复制一份示例配置并填入自己的值:

```bash
cp application-local.yaml.example application-local.yaml
```

```yaml
spring:
  datasource:
    username: root
    password: your-mysql-password
  mail:
    username: your-account@gmail.com
    password: your-16-char-app-password   # Gmail 应用专用密码,留空则不发邮件
app:
  admin:
    initial-password: change-me-123        # 初始管理员 admin 的密码,留空则不创建
  mail:
    base-url: http://localhost:${server.port}   # 邮件里链接指向的地址
```

`application-local.yaml` 已加入 `.gitignore`,不会被提交。也可以不建这个文件,改用环境变量:

| 环境变量 | 说明 | 默认值 |
|---|---|---|
| `DB_USERNAME` | MySQL 用户名 | `root` |
| `DB_PASSWORD` | MySQL 密码 | 空 |
| `MAIL_USERNAME` | 发件 Gmail 地址 | 空(不发邮件) |
| `MAIL_PASSWORD` | Gmail 应用专用密码 | 空(不发邮件) |
| `ADMIN_INITIAL_PASSWORD` | 初始管理员密码 | 空(不创建管理员) |
| `MAIL_BASE_URL` | 邮件中链接的网站地址 | `http://localhost:${server.port}` |

### 3. 启动

在**项目根目录**执行(本地配置文件按当前目录读取):

```bash
./mvnw spring-boot:run
```

Windows 命令行可以用 `mvnw.cmd spring-boot:run`,或者直接在 IDEA 里运行 `ScheduleApplication`。

- 默认端口 `8084`(`application.yaml` 中的 `server.port`),浏览器打开 http://localhost:8084 。
- 首次启动会自动创建 `schedule` 数据库和所有表(`schema.sql`,只建不存在的表,不会清空数据);旧版本的数据库在启动时会自动补上新增的列。
- 系统里没有管理员时,会用 `app.admin.initial-password` 创建管理员账号 `admin`,请登录后尽快修改密码。

## 配置 Gmail 发信

Gmail 不允许用登录密码通过 SMTP 发信,需要使用"应用专用密码":

1. 在 [Google 账号安全设置](https://myaccount.google.com/security) 中先添加第二步验证方式(手机号、通行密钥或身份验证器),再开启**两步验证**。
2. 打开 [应用专用密码](https://myaccount.google.com/apppasswords),创建一个(名称随意),得到 16 位密码。
3. 把它填到 `application-local.yaml` 的 `spring.mail.password`(去掉空格),或设置环境变量 `MAIL_PASSWORD`。
4. 重启后日志出现 `邮件通知已开启,发件邮箱 …` 即生效。发送结果会记录在日志中(`已发送邮件…` 或 `发送邮件…失败:原因`)。

## 让同一局域网的其他人访问

1. 用本机局域网 IP 访问,例如 `http://192.168.1.10:8084`(用 `ipconfig` 查看 IP)。
2. Windows 防火墙默认会拦截入站连接,需要放行端口(以管理员身份运行 PowerShell):

   ```powershell
   New-NetFirewallRule -DisplayName "schedule 8084" -Direction Inbound -Protocol TCP -LocalPort 8084 -Action Allow -Profile Any
   ```

3. 校园网(如 eduroam)、公共 Wi-Fi 通常开启了**客户端隔离**,设备之间无法互相访问。这时可以改用手机热点或自己的路由器,或使用内网穿透工具、部署到服务器。
4. 把 `app.mail.base-url` 改成别人能访问的地址,否则邮件里的链接只能在本机打开。

## 项目结构

```
schedule
├── application-local.yaml.example     本机敏感配置示例(复制为 application-local.yaml)
├── pom.xml
└── src/main
    ├── java/com/example/schedule
    │   ├── ScheduleApplication.java   启动类(开启异步发邮件、定时任务)
    │   ├── common/                    业务异常、冲突异常、密码哈希
    │   ├── config/                    登录拦截器、统一错误处理、上传大小限制、初始管理员
    │   ├── controller/                REST 接口
    │   ├── dto/                       请求 / 响应对象
    │   ├── mapper/                    MyBatis 接口
    │   ├── model/                     实体和枚举
    │   ├── notify/                    业务事件(Notice)、邮件通知、站内通知
    │   └── service/                   业务逻辑:用户、组、行程与冲突、忙闲、留言、通知、
    │                                  重置密码、头像、开始提醒定时任务(ReminderJob)
    └── resources
        ├── application.yaml           公共配置(不含敏感信息)
        ├── schema.sql                 建表脚本(含旧库补列)
        ├── mapper/                    MyBatis XML
        └── static/                    前端页面
            ├── login.html             登录、注册、忘记密码
            ├── reset-password.html    邮件里的重置密码页
            ├── index.html             主页面
            ├── css/app.css
            └── js/                    common.js 公共工具、app.js 主要功能、
                                       home.js 首页、notify.js 通知中心
```

## 数据表

| 表 | 说明 |
|---|---|
| `sys_user` | 用户:用户名、邮箱、密码哈希、角色(`USER` / `ADMIN`)、是否需要修改密码 |
| `user_group` | 组:组名、创建者、是否需要成员同意(管理员建的组不需要) |
| `group_member` | 组成员:`PENDING` 待同意 / `ACCEPTED` 已加入 / `DECLINED` 已拒绝 |
| `schedule_event` | 行程:标题、地点、说明、开始结束时间、发起人、所属组、状态(`ACTIVE` / `CANCELLED`) |
| `event_participant` | 参与人:`PENDING` 待确认 / `ACCEPTED` 已同意 / `DECLINED` 已拒绝 |
| `event_comment` | 留言:内容、所属顶层留言(`parent_id`,回复用)、被回复的人、编辑时间、删除时间(下面有别人的回复时只标记删除) |
| `notification` | 站内通知:收件人、类型、标题、内容、相关的行程 / 组 / 留言、已读时间 |
| `password_reset_token` | 重置密码令牌:只存 SHA-256、过期时间、使用时间 |
| `user_avatar` | 用户头像:256×256 PNG |

## 接口一览

所有接口都在 `/api` 下,除登录、注册、忘记密码和重置密码外都需要先登录;错误统一返回 `{"message": "..."}`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/login` | 登录(`username` 可填用户名或邮箱) |
| POST | `/api/auth/register` | 注册普通用户并登录 |
| POST | `/api/auth/logout` | 退出登录 |
| GET | `/api/auth/me` | 当前用户 |
| PUT | `/api/auth/password` | 修改自己的密码 |
| PUT | `/api/auth/profile` | 修改自己的姓名和邮箱 |
| POST | `/api/auth/forgot-password` | 忘记密码,发送重置邮件(`account` 为用户名或邮箱) |
| GET | `/api/auth/reset-password?token=` | 检查重置链接是否有效 |
| POST | `/api/auth/reset-password` | 用邮件里的令牌设置新密码(`token`、`newPassword`) |
| POST | `/api/auth/avatar` | 上传自己的头像(multipart,字段名 `file`) |
| DELETE | `/api/auth/avatar` | 移除自己的头像 |
| GET | `/api/users` | 可邀请的普通用户(不含邮箱) |
| GET | `/api/users/avatars` | 有头像的用户 → 版本号 |
| GET | `/api/users/{id}/avatar` | 头像图片(PNG) |
| GET | `/api/events` | 我发起的和被邀请的行程 |
| GET | `/api/events/{id}` | 行程详情和参与人 |
| POST | `/api/events` | 预约行程 / 组内邀约(可带 `inviteeIds`、`groupId`、`force`) |
| PUT | `/api/events/{id}` | 修改行程(发起人;改时间有冲突时可带 `force`) |
| GET | `/api/events/availability?start=&end=&userIds=&excludeEventId=` | 这些普通用户在该时间段的忙碌时段(只有时间) |
| POST | `/api/events/{id}/invite` | 追加邀请(发起人) |
| POST | `/api/events/{id}/respond` | 同意或拒绝邀请(`accept`、`force`) |
| POST | `/api/events/{id}/cancel` | 取消行程(发起人) |
| GET | `/api/events/{id}/comments` | 行程的留言和回复 |
| POST | `/api/events/{id}/comments` | 留言;带 `parentId` 为回复 |
| PUT | `/api/events/{id}/comments/{commentId}` | 编辑自己的留言 |
| DELETE | `/api/events/{id}/comments/{commentId}` | 删除留言(自己的;管理员可删任何留言) |
| GET | `/api/notifications?filter=all\|unread\|comment&beforeId=&limit=` | 我的通知(分页) |
| GET | `/api/notifications/summary` | 未读数、最新通知 ID、需要弹窗的开始提醒(页面轮询用) |
| POST | `/api/notifications/{id}/read` | 标记一条已读 |
| POST | `/api/notifications/read-all?filter=` | 全部标记已读 |
| GET | `/api/groups` | 我创建的和所在的组 |
| GET | `/api/groups/{id}` | 组详情和成员 |
| POST | `/api/groups` | 创建组 |
| DELETE | `/api/groups/{id}` | 删除组(创建者) |
| POST | `/api/groups/{id}/members` | 添加成员(创建者) |
| DELETE | `/api/groups/{id}/members/{userId}` | 移除成员;移除自己即退出组 |
| POST | `/api/groups/{id}/respond` | 同意或拒绝入组邀请 |
| GET | `/api/admin/users` | 全部用户(管理员) |
| POST | `/api/admin/users` | 新建用户,可指定角色(管理员) |
| POST | `/api/admin/users/{id}/reset-password` | 重置用户密码为 `123456`(管理员) |
| DELETE | `/api/admin/users/{id}/avatar` | 移除用户的头像(管理员) |

时间冲突时的响应示例(HTTP 409):

```json
{
  "message": "以下用户在该时间段已有行程",
  "conflicts": [
    {
      "userId": 3,
      "displayName": "Bob",
      "eventId": 4,
      "title": "项目周会",
      "startTime": "2026-10-02T14:00:00",
      "endTime": "2026-10-02T15:00:00"
    }
  ]
}
```

确认后在原请求中加上 `"force": true` 重新提交即可。

## 上线前注意

- 登录后修改初始管理员密码;`application-local.yaml` 和应用专用密码不要提交或外传。
- 把 `app.mail.base-url` 改成实际访问地址(重置密码和通知邮件里的链接都用它)。
- 生产环境建议使用 HTTPS,并按需调整 `server.servlet.session` 中的会话设置。
- 重置密码的频率限制计数保存在内存里,重启后清零;部署多台服务器时需要改为共享存储。
- 开始前的弹窗提醒需要用户开着网页(后台标签页也可以);页面关闭时提醒仍会出现在通知列表里。
