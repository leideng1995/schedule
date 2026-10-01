# 行程预约系统(schedule)

一个基于 Spring Boot 的行程预约与邀约系统。普通用户可以预约自己的行程、邀请其他用户;管理员和普通用户都可以建组并发起组内邀约;预约和接受邀请时会检查时间冲突,并通过邮件通知相关的人。

## 功能

### 用户与权限

| 角色 | 能做什么 |
|---|---|
| 普通用户 | 预约自己的行程;邀请其他普通用户;创建组(成员**同意后**才算加入),对组内已加入的成员发起组内邀约;回复行程邀请和入组邀请 |
| 管理员 | 创建组(成员**直接加入**),给组内成员发起组内邀约(管理员本人不作为参与人);用户管理:新建用户、重置密码 |

- 登录:用户名或邮箱都可以登录;自助注册的是普通用户。
- 密码:8~64 位,同时包含字母和数字,使用 PBKDF2-HMAC-SHA512 加盐哈希存储。
- 管理员可以把用户密码重置为 `123456`,该用户下次登录后必须先修改密码才能继续使用。

### 行程与邀请

- 被邀请的人先是"待确认",**同意后**这个行程才进入他的日程;已同意的也可以改为"不参加了"。
- 拒绝过的人可以被再次邀请;已同意或待确认的不会重复邀请。
- 发起人可以追加邀请或取消行程;不能预约已经过去的时间。

### 时间冲突提示

- 预约、邀请、同意邀请时,如果某个参与人在这个时间段已有**已同意**的行程,接口返回 `409` 和冲突明细(谁、哪个行程、什么时间)。
- 冲突只做提示,不强制禁止:前端列出冲突后,用户确认可以带 `force: true` 重新提交。
- 首尾相接(一个 10:00 结束、另一个 10:00 开始)不算冲突;待确认的邀请不计入冲突。

### 邮件通知

| 事件 | 收件人 |
|---|---|
| 被邀请参加行程(单独邀请、组内邀约、追加邀请) | 被邀请人(该时间段已有行程时邮件里会提醒) |
| 同意 / 拒绝行程邀请 | 行程发起人 |
| 行程被取消 | 已同意和待确认的参与人 |
| 被邀请加入组 / 被管理员加入组 | 被邀请或被加入的人 |
| 同意 / 拒绝入组邀请 | 组的创建者 |

- 在事务提交后异步发送:发信慢或失败不影响预约等操作,失败只记日志;操作失败(如回滚)不会发信。
- 每个收件人单独一封,不会暴露其他用户的邮箱;没填邮箱的用户自动跳过。
- 没有配置发件邮箱时不发信,只在日志里提示,其他功能照常使用。

### 页面

- **我的行程**:欢迎区(下一个行程倒计时)、今日 / 本周 / 待回复 / 冲突统计,列表视图和周视图(点击空白时段快速预约)、月历、"接下来"列表、按类型着色和筛选。
- **待我回复**:行程邀请和入组邀请,一键同意或拒绝。
- **我的组**:创建组、管理成员、组内邀约。
- **用户管理**(管理员):查看、搜索、新建用户,重置密码。

## 技术栈

- Java 27、Spring Boot 4.1(Spring MVC、JDBC、Mail)
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
- 首次启动会自动创建 `schedule` 数据库和所有表(`schema.sql`,只建不存在的表,不会清空数据)。
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
    │   ├── ScheduleApplication.java   启动类(开启异步,用于发邮件)
    │   ├── common/                    业务异常、冲突异常、密码哈希
    │   ├── config/                    登录拦截器、统一错误处理、初始管理员
    │   ├── controller/                REST 接口
    │   ├── dto/                       请求 / 响应对象
    │   ├── mapper/                    MyBatis 接口
    │   ├── model/                     实体和枚举
    │   ├── notify/                    邮件通知(事件 + 异步发送)
    │   └── service/                   业务逻辑:用户、组、行程与冲突检测
    └── resources
        ├── application.yaml           公共配置(不含敏感信息)
        ├── schema.sql                 建表脚本
        ├── mapper/                    MyBatis XML
        └── static/                    前端页面(login.html、index.html、css、js)
```

## 数据表

| 表 | 说明 |
|---|---|
| `sys_user` | 用户:用户名、邮箱、密码哈希、角色(`USER` / `ADMIN`)、是否需要修改密码 |
| `user_group` | 组:组名、创建者、是否需要成员同意(管理员建的组不需要) |
| `group_member` | 组成员:`PENDING` 待同意 / `ACCEPTED` 已加入 / `DECLINED` 已拒绝 |
| `schedule_event` | 行程:标题、地点、说明、开始结束时间、发起人、所属组、状态(`ACTIVE` / `CANCELLED`) |
| `event_participant` | 参与人:`PENDING` 待确认 / `ACCEPTED` 已同意 / `DECLINED` 已拒绝 |

## 接口一览

所有接口都在 `/api` 下,除登录和注册外都需要先登录;错误统一返回 `{"message": "..."}`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/login` | 登录(`username` 可填用户名或邮箱) |
| POST | `/api/auth/register` | 注册普通用户并登录 |
| POST | `/api/auth/logout` | 退出登录 |
| GET | `/api/auth/me` | 当前用户 |
| PUT | `/api/auth/password` | 修改自己的密码 |
| PUT | `/api/auth/profile` | 修改自己的姓名和邮箱 |
| GET | `/api/users` | 可邀请的普通用户(不含邮箱) |
| GET | `/api/events` | 我发起的和被邀请的行程 |
| GET | `/api/events/{id}` | 行程详情和参与人 |
| POST | `/api/events` | 预约行程 / 组内邀约(可带 `inviteeIds`、`groupId`、`force`) |
| POST | `/api/events/{id}/invite` | 追加邀请(发起人) |
| POST | `/api/events/{id}/respond` | 同意或拒绝邀请(`accept`、`force`) |
| POST | `/api/events/{id}/cancel` | 取消行程(发起人) |
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
- 把 `app.mail.base-url` 改成实际访问地址。
- 生产环境建议使用 HTTPS,并按需调整 `server.servlet.session` 中的会话设置。
