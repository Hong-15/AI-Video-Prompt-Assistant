/**
 * 构建前更新 win-unpacked 中的 app.asar
 * 从项目源文件提取最新代码，打入 asar，供 electron-builder --prepackaged 使用
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST_ASAR = path.join(ROOT, 'dist', 'win-unpacked', 'resources', 'app.asar');
const TMP_DIR = path.join(ROOT, 'dist', '.tmp_asar');

const SOURCE_FILES = ['main.js', 'preload.js', 'package.json', 'aiSpecContent.js', 'mdToHtml.js'];

// 检查 logger.js 是否存在
if (fs.existsSync(path.join(ROOT, 'logger.js'))) {
  SOURCE_FILES.push('logger.js');
}

console.log('[update-asar] 提取旧 asar...');
execSync(`npx asar extract "${DIST_ASAR}" "${TMP_DIR}"`, { stdio: 'inherit', cwd: ROOT });

console.log('[update-asar] 覆盖最新源文件...');
for (const file of SOURCE_FILES) {
  const src = path.join(ROOT, file);
  const dst = path.join(TMP_DIR, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`  + ${file}`);
  }
}

// 同步 renderer 和 config 目录
const dirsToSync = ['renderer', 'config'];
for (const dir of dirsToSync) {
  const srcDir = path.join(ROOT, dir);
  const dstDir = path.join(TMP_DIR, dir);
  if (fs.existsSync(srcDir)) {
    copyDirSync(srcDir, dstDir);
    console.log(`  + ${dir}/`);
  }
}

console.log('[update-asar] 重新打包 asar...');
execSync(`npx asar pack "${TMP_DIR}" "${DIST_ASAR}"`, { stdio: 'inherit', cwd: ROOT });

// 清理临时目录
fs.rmSync(TMP_DIR, { recursive: true, force: true });

const size = (fs.statSync(DIST_ASAR).size / 1024).toFixed(0);
console.log(`[update-asar] 完成 (${size} KB)`);

// 重命名 electron.exe → 产品名（方便用户直接双击运行）
const electronExe = path.join(ROOT, 'dist', 'win-unpacked', 'electron.exe');
const renamedExe = path.join(ROOT, 'dist', 'win-unpacked', 'AI提示词助手.exe');
try {
  if (fs.existsSync(electronExe)) {
    fs.copyFileSync(electronExe, renamedExe);
    console.log('[update-asar] electron.exe → AI提示词助手.exe');
  }
} catch (err) {
  console.log(`[update-asar] 重命名失败: ${err.message}`);
}

function copyDirSync(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}
