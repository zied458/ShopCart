// node:test reporter that writes a Markdown table (for the GitHub Actions run page).
//   node --test --test-reporter=spec --test-reporter-destination=stdout \
//        --test-reporter=./scripts/ci/md-reporter.mjs --test-reporter-destination=reports/tests.md test/
export default async function* reporter(source) {
  const rows = []
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue
    if (event.data.details?.type === 'suite' || event.data.nesting > 0) continue
    const [flaw, name] = event.data.name.includes(' · ') ? event.data.name.split(' · ') : ['', event.data.name]
    const error = event.data.details?.error
    const reason = (error?.cause?.message ?? error?.message ?? '').split('\n').map((l) => l.trim()).filter(Boolean).join(' ').replace(/\|/g, '\\|').slice(0, 160)
    rows.push({ flaw, name, ok: event.type === 'test:pass', reason, ms: Math.round(event.data.details?.duration_ms ?? 0) })
  }
  const failed = rows.filter((r) => !r.ok).length
  yield '## 🧪 Security regression tests (on the deployed app)\n\n'
  yield failed ? `**❌ ${failed} of ${rows.length} tests failed.**\n\n` : `**✅ All ${rows.length} tests passed.**\n\n`
  yield '| Flaw | Test | Result | Detail |\n|---|---|---|---|\n'
  for (const r of rows) yield `| ${r.flaw} | ${r.name} | ${r.ok ? '✅ pass' : '❌ fail'} | ${r.ok ? `${r.ms} ms` : r.reason} |\n`
  yield '\n<sub>Each V… test fails while the flaw exists (backend/test/security.test.mjs). Control tests check the shop still works.</sub>\n'
}
