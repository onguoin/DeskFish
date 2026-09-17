# DeskFish 发布说明规范

从 v0.13.0 开始，每次发布安装包时必须同时更新以下三处：

1. `CHANGELOG.md`：记录该版本的中文与英文变更。
2. `docs/release-vX.Y.Z.md`：作为 GitHub Release 正文，写清新增、改进、修复、使用方法、已知限制和安装升级步骤。
3. `README.md` 与 `README_EN.md`：更新最新版下载链接、版本号，以及对长期功能有影响的项目简介。

GitHub Release 上传完成后，再把安装包的实际 SHA-256 写入 Release 正文。发布前应完成全部 Node 回归测试、.NET 回归测试、Release 构建和本地 API 冒烟测试。

## 中文模板

```markdown
# DeskFish vX.Y.Z

## 这次更新了什么

### 新增
- …

### 改进
- …

### 修复
- …

## 使用方法
1. …

## 已知限制
- …

## 安装与升级
…

## 下载校验
`SHA-256: …`
```

英文部分使用对应的 `Added`、`Improved`、`Fixed`、`How to use it`、`Known limitations`、`Install or upgrade` 和 `Checksum` 小节。没有内容的小节可以省略，但不能只写“修复若干问题”或“优化体验”。
