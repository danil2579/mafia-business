const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const { version } = require(path.join(root, 'package.json'));
const releaseDirectory = path.join(root, 'release');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mafia-business-release-'));
const releaseName = `mafia-business-v${version}`;
const bundleDirectory = path.join(tempRoot, releaseName);
const outputPath = path.join(releaseDirectory, `${releaseName}.zip`);
const excludedRoots = new Set(['.git', '.claude', 'release', 'data']);

try {
  fs.mkdirSync(releaseDirectory, { recursive: true });
  fs.cpSync(root, bundleDirectory, {
    recursive: true,
    filter(source) {
      const relative = path.relative(root, source);
      if (!relative) return true;
      const segments = relative.split(path.sep);
      return !excludedRoots.has(segments[0]) && segments[segments.length - 1] !== '.DS_Store';
    }
  });
  fs.mkdirSync(path.join(bundleDirectory, 'data'), { recursive: true, mode: 0o700 });
  fs.rmSync(outputPath, { force: true });
  const result = spawnSync('zip', ['-q', '-r', outputPath, path.basename(bundleDirectory)], {
    cwd: tempRoot,
    stdio: 'inherit'
  });
  if (result.status !== 0) process.exit(result.status || 1);
  console.log(outputPath);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
