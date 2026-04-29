# JCCgaoshou
A TFT (Golden Spatula) comp counter &amp; matchup analysis tool

## Next.js 版本

这个仓库现在保留了原始静态页，同时新增了可部署到 Vercel 的 Next.js 应用骨架：

- `app/`：Next.js App Router 页面入口
- `components/JccWorkbench.tsx`：React 版阵容工作台
- `lib/`：数据类型和 matchup 工具函数
- `data/demo-data.json`：当前前端使用的数据源

本地运行：

```bash
npm install
npm run dev
```

部署到 Vercel 时，选择这个仓库即可，Vercel 会识别 `package.json` 并执行 Next.js 构建。
