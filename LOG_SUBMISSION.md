# 三国杀游戏日志提交指南

## 功能说明
游戏现在支持将用户对局日志提交到GitHub Issues，方便开发者收集和分析游戏数据。

## 设置步骤

### 1. 创建GitHub Personal Access Token
1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token" → "Generate new token (classic)"
3. 勾选权限：`repo` (完整仓库权限)
4. 点击 "Generate token"
5. **复制token并保存**（只显示一次）

### 2. 配置Token
在游戏设置界面输入你的GitHub Token，或者设置环境变量：

```bash
# 本地测试
export GITHUB_TOKEN=你的token

# 推送代码时使用token
git remote set-url origin https://<TOKEN>@github.com/cjh-98/sanguosha.git
```

### 3. 自动推送设置
创建 `.github/workflows/deploy.yml` 已在仓库中配置，支持自动部署到GitHub Pages。

## 日志收集方式

### 方式1：通过游戏界面提交（推荐）
1. 游戏结束后，点击"提交对局记录"按钮
2. 填写反馈信息（可选）
3. 点击"提交"，自动创建GitHub Issue

### 方式2：手动导出
1. 点击"导出日志"按钮
2. 下载JSON文件
3. 手动上传或发送给我

## GitHub Issues标签
提交的日志会自动添加以下标签：
- `game-log`: 游戏日志
- `bug-report`: 错误报告
- `feedback`: 用户反馈

## 隐私说明
- 日志只包含游戏数据，不包含个人隐私信息
- 可以在提交前查看要发送的数据
- 可以选择不提交某些敏感信息
