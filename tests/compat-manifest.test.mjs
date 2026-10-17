/**
 * Manifest-level compatibility guards for DSH 0.2.x support.
 * Run: node --test tests/compat-manifest.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')
const semver = require('semver')

// 版本必须是合法 semver（不锁死具体版本，避免阻塞发版）
assert.ok(semver.valid(pkg.version), 'package version must be valid semver')

// A DSH runtime version must be declared in engines.dsh (DSH reads it alone and
// ignores peerDependencies when present).
assert.equal(typeof pkg.engines?.dsh, 'string')
assert.ok(pkg.engines.dsh.length > 0)

// The six DSH peers must stay word-for-word identical to engines.dsh, otherwise
// the runtime range silently drifts from what the manifest promises.
const DSH_PEERS = [
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-commands',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-session-title',
  '@deepseek-ai/dsh-user-questions',
]
for (const name of DSH_PEERS) {
  assert.equal(pkg.peerDependencies?.[name], pkg.engines.dsh, `${name} must equal engines.dsh`)
}

// DSH evaluates the range with semver's includePrerelease semantics.
const dsh = (version) => semver.satisfies(version, pkg.engines.dsh, { includePrerelease: true })
for (const version of ['0.1.7-rc.2', '0.2.0-rc.2', '0.2.1-rc.1', '0.2.1', '0.2.9']) {
  assert.equal(dsh(version), true, `DSH ${version} must be accepted`)
}
for (const version of ['0.3.0-rc.1', '0.3.0']) {
  assert.equal(dsh(version), false, `DSH ${version} must stay outside the promised range`)
}

// npm/pnpm resolve peers with default semver semantics; those must accept the
// same era endpoints the plugin was tested against.
for (const version of ['0.1.7-rc.2', '0.2.1-rc.1']) {
  assert.equal(semver.satisfies(version, pkg.engines.dsh), true, `peer resolution must accept ${version}`)
}

console.log('compat-manifest.test.mjs: ok')
