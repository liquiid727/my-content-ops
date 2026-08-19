import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Node LTS 门禁：校验当前 Node 版本满足 `engines.node`（>=22.12.0），
 * 并提示 CI 应跑在 Active LTS（22/24）上。低于 engines 最低版本 → 硬失败。
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const range = String(pkg.engines?.node ?? '>=22').replace(/^>=/, '').split('.')
const [minMajor, minMinor, minPatch] = [Number(range[0] ?? 0), Number(range[1] ?? 0), Number(range[2] ?? 0)]
const [curMajor, curMinor, curPatch] = process.versions.node.split('.').map(Number)

const satisfiesRange =
  curMajor > minMajor ||
  (curMajor === minMajor && (curMinor > minMinor || (curMinor === minMinor && curPatch >= minPatch)))

/** Active LTS major（截至基线 Node 22；22/24 均为 Active LTS）。 */
const LTS_MAJORS = new Set([22, 24])

if (!satisfiesRange) {
  console.error(`[node-lts-gate] Node ${process.version} does NOT satisfy engines.node "${pkg.engines?.node}" (>=${minMajor}.${minMinor}.${minPatch}).`)
  process.exit(1)
}

if (!LTS_MAJORS.has(curMajor)) {
  console.warn(`[node-lts-gate] Warning: Node ${process.version} is not an Active LTS (${[...LTS_MAJORS].sort().join('/')}). engines allows it, but CI should run on an LTS major.`)
} else {
  console.log(`[node-lts-gate] Node ${process.version} satisfies engines.node "${pkg.engines?.node}" (Active LTS).`)
}
