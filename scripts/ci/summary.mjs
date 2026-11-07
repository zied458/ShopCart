// Turns each security tool's JSON report into a readable Markdown summary for the GitHub Actions run page
// (written to $GITHUB_STEP_SUMMARY by the workflow). Secret values are never printed.
//   node scripts/ci/summary.mjs gitleaks reports/gitleaks.json
//   node scripts/ci/summary.mjs semgrep  reports/semgrep.json
//   node scripts/ci/summary.mjs trivy    reports/dependencies.json "Dependencies"
//   node scripts/ci/summary.mjs config   reports/iac.json
//   node scripts/ci/summary.mjs zap      reports/zap/zap-report.json
//   node scripts/ci/summary.mjs report   reports/          (final overview; gate results in the NEEDS variable)
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [kind, file, title] = process.argv.slice(2)

const read = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8') || 'null') : null)
const cell = (text, max = 120) => {
  const s = String(text ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
const table = (head, rows) =>
  rows.length ? [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n') : ''
const SEV = { CRITICAL: '🟥 Critical', HIGH: '🟧 High', MEDIUM: '🟨 Medium', LOW: '⬜ Low', UNKNOWN: '⬜ Unknown', ERROR: '🟥 Error', WARNING: '🟨 Warning', INFO: '⬜ Info' }
const order = ['CRITICAL', 'HIGH', 'ERROR', 'MEDIUM', 'WARNING', 'LOW', 'INFO', 'UNKNOWN']
const bySeverity = (a, b) => order.indexOf(a) - order.indexOf(b)
const verdict = (blocking, what) => (blocking ? `**❌ Blocked:** ${blocking} ${what}.` : `**✅ Passed:** no ${what}.`)
const counts = (list, key) => {
  const c = {}
  for (const x of list) c[key(x)] = (c[key(x)] ?? 0) + 1
  return Object.entries(c).sort(([a], [b]) => bySeverity(a, b)).map(([s, n]) => `${SEV[s] ?? s}: **${n}**`).join(' · ')
}

// Which planted flaw (docs/vulnerabilities.md) a finding points at, when it is one of ours.
const FLAW = [
  [/sql|injection/i, 'V1'],
  [/xss|cross.site scripting|dangerouslySetInnerHTML|html-from-variable/i, 'V5'],
  [/role-taken-from-request/i, 'V4'],
  [/hardcoded|secret|signing-key|postgres-url|jwt/i, 'V6'],
  [/lodash|CVE-2019-10744|CVE-2020-8203|CVE-2021-23337|prototype/i, 'V7'],
  [/cors|cross-domain|x-powered-by|error|stack|debug|header|content security|clickjacking|anti-clickjacking|x-content-type/i, 'V8'],
]
const flawOf = (...texts) => FLAW.find(([re]) => texts.some((t) => re.test(String(t ?? ''))))?.[1] ?? ''

// ---------------------------------------------------------------- parsers: { total, blocking, md }
function gitleaks(path) {
  const leaks = read(path) ?? []
  const rows = leaks.map((l) => [
    `\`${l.RuleID}\``,
    `\`${String(l.File).replace(/^\/repo\//, '')}:${l.StartLine}\``,
    l.Commit ? `\`${l.Commit.slice(0, 7)}\`` : '—',
    cell(l.Date?.slice(0, 10)) || '—',
    flawOf(l.RuleID) || '—',
  ])
  return {
    total: leaks.length,
    blocking: leaks.length,
    md: [
      `## 🔑 Secrets in the Git history — Gitleaks`,
      verdict(leaks.length, `secret${leaks.length === 1 ? '' : 's'} found in the history (every commit scanned, values redacted)`),
      table(['Rule', 'Where', 'Commit', 'Date', 'Flaw'], rows),
      leaks.length ? `\n> A secret that reached Git is compromised even after a later commit removes it: **revoke it first, then purge the history** (docs/secrets.md).` : '',
    ],
  }
}

function semgrep(path) {
  const results = (read(path)?.results ?? []).sort((a, b) => bySeverity(a.extra.severity, b.extra.severity))
  const blocking = results.filter((r) => r.extra.severity === 'ERROR').length
  const rows = results.map((r) => [SEV[r.extra.severity] ?? r.extra.severity, `\`${r.check_id.split('.').pop()}\``, `\`${r.path}:${r.start.line}\``, cell(r.extra.message, 140), flawOf(r.check_id, r.extra.message) || '—'])
  return {
    total: results.length,
    blocking,
    md: [
      `## 🧩 Code — Semgrep (OWASP rules + team rules)`,
      verdict(blocking, `finding${blocking === 1 ? '' : 's'} of severity ERROR`),
      results.length ? counts(results, (r) => r.extra.severity) : '',
      table(['Severity', 'Rule', 'Where', 'Message', 'Flaw'], rows),
      `\n<sub>Blocks on ERROR; WARNING is reported. Rules: \`p/default\` and \`.semgrep/tropicline.yml\`.</sub>`,
    ],
  }
}

function trivy(path, label = 'Dependencies') {
  const report = read(path) ?? {}
  const vulns = []
  const secrets = []
  for (const r of report.Results ?? []) {
    for (const v of r.Vulnerabilities ?? []) vulns.push({ ...v, Target: r.Target })
    for (const s of r.Secrets ?? []) secrets.push({ ...s, Target: r.Target })
  }
  vulns.sort((a, b) => bySeverity(a.Severity, b.Severity))
  const blocks = (v) => (v.Severity === 'HIGH' || v.Severity === 'CRITICAL') && v.FixedVersion
  const blocking = vulns.filter(blocks).length + secrets.filter((s) => s.Severity === 'HIGH' || s.Severity === 'CRITICAL').length
  const rows = vulns.map((v) => [
    SEV[v.Severity] ?? v.Severity,
    v.PrimaryURL ? `[${v.VulnerabilityID}](${v.PrimaryURL})` : v.VulnerabilityID,
    `\`${v.PkgName}\` ${v.InstalledVersion}`,
    v.FixedVersion ? `\`${cell(v.FixedVersion, 40)}\`` : '_no fix yet_',
    cell(v.Title, 90),
    blocks(v) ? '❌' : '—',
    flawOf(v.PkgName, v.VulnerabilityID) || '—',
  ])
  const srows = secrets.map((s) => [SEV[s.Severity] ?? s.Severity, `\`${s.RuleID}\``, `\`${s.Target}:${s.StartLine}\``, cell(s.Title)])
  return {
    total: vulns.length + secrets.length,
    blocking,
    md: [
      `## 📦 ${label} — Trivy`,
      verdict(blocking, `blocking finding${blocking === 1 ? '' : 's'} (HIGH or CRITICAL with a fix available, or a secret)`),
      vulns.length ? counts(vulns, (v) => v.Severity) : '',
      table(['Severity', 'Vulnerability', 'Package', 'Fixed in', 'Title', 'Blocks', 'Flaw'], rows),
      srows.length ? `\n**Secrets inside the image**\n\n${table(['Severity', 'Rule', 'Where', 'Title'], srows)}` : '',
      `\n<sub>Image: \`${report.ArtifactName ?? '.'}\`. Exceptions with an expiry date live in \`.trivyignore\` (docs/pipeline-policy.md).</sub>`,
    ],
  }
}

function config(path) {
  const report = read(path) ?? {}
  const found = []
  for (const r of report.Results ?? []) for (const m of r.Misconfigurations ?? []) if (m.Status === 'FAIL') found.push({ ...m, Target: r.Target })
  found.sort((a, b) => bySeverity(a.Severity, b.Severity))
  const blocking = found.filter((m) => m.Severity === 'HIGH' || m.Severity === 'CRITICAL').length
  const scanned = (report.Results ?? []).map((r) => r.Target)
  const rows = found.map((m) => [SEV[m.Severity] ?? m.Severity, `\`${m.ID}\``, `\`${m.Target}${m.CauseMetadata?.StartLine ? `:${m.CauseMetadata.StartLine}` : ''}\``, cell(m.Title, 80), cell(m.Message, 110)])
  return {
    total: found.length,
    blocking,
    md: [
      `## 🏗️ Deployment files — Trivy config (Dockerfiles, Compose, Kubernetes)`,
      verdict(blocking, `HIGH or CRITICAL misconfiguration${blocking === 1 ? '' : 's'}`),
      `${scanned.length} files checked: ${scanned.map((t) => `\`${t}\``).join(', ')}`,
      found.length ? `\n${counts(found, (m) => m.Severity)}` : '',
      table(['Severity', 'Check', 'Where', 'Problem', 'Detail'], rows),
    ],
  }
}

function zap(path) {
  const report = read(path) ?? {}
  const alerts = []
  // An alert whose every instance was filtered as a false positive (zap/plan.yaml) stays listed with count 0: skip it.
  for (const site of report.site ?? []) for (const a of site.alerts ?? []) if (Number(a.count) > 0) alerts.push(a)
  const RISK = { 3: '🟥 High', 2: '🟧 Medium', 1: '🟨 Low', 0: '⬜ Info' }
  alerts.sort((a, b) => Number(b.riskcode) - Number(a.riskcode) || Number(b.count) - Number(a.count))
  const blocking = alerts.filter((a) => Number(a.riskcode) >= 3).length
  const rows = alerts.map((a) => {
    const i = a.instances?.[0] ?? {}
    const example = `${i.method ?? ''} ${(i.uri ?? '').replace(/^https?:\/\/[^/]+/, '')}${i.param ? ` · param \`${cell(i.param, 30)}\`` : ''}`
    return [RISK[a.riskcode] ?? a.riskdesc, cell(a.alert ?? a.name, 70), a.count, cell(example, 90), i.attack ? `\`${cell(i.attack, 50)}\`` : '—', flawOf(a.alert, a.name) || '—']
  })
  const confirmed = [...new Set(alerts.filter((a) => Number(a.riskcode) >= 1).map((a) => flawOf(a.alert, a.name)).filter(Boolean))].sort()
  return {
    total: alerts.length,
    blocking,
    confirmed,
    md: [
      `## 🕷️ Dynamic scan — OWASP ZAP, authenticated, on the deployed app`,
      verdict(blocking, `High-risk alert${blocking === 1 ? '' : 's'}`),
      alerts.length ? [3, 2, 1, 0].map((r) => [r, alerts.filter((a) => +a.riskcode === r).length]).filter(([, n]) => n).map(([r, n]) => `${RISK[r]}: **${n}**`).join(' · ') : '',
      confirmed.length ? `\n**Alerts linked to a planted flaw:** ${confirmed.join(', ')} (docs/vulnerabilities.md, docs/dast.md)` : '',
      table(['Risk', 'Alert', 'Count', 'Example request', 'Attack', 'Flaw'], rows),
      `\n<sub>Signed in as a customer (Bearer token on every request); routes from \`zap/openapi.yaml\` plus a crawl of the shop. Blocks on High; Medium is reported. Full report: artifact **dast-report**.</sub>`,
    ],
  }
}

// ---------------------------------------------------------------- final overview of every gate
function report(dir) {
  const needs = JSON.parse(process.env.NEEDS ?? '{}')
  const find = (name) => {
    const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
    return existsSync(dir) ? walk(dir).filter((p) => p.endsWith(name)) : []
  }
  const sum = (paths, parse) => paths.map((p) => parse(p)).reduce((a, b) => ({ total: a.total + b.total, blocking: a.blocking + b.blocking }), { total: 0, blocking: 0 })
  const k8s = find('k8s-checks.md')[0]
  const k8sText = k8s ? readFileSync(k8s, 'utf8') : ''
  const zapResult = find('zap-report.json')[0] ? zap(find('zap-report.json')[0]) : null
  const gates = [
    ['build', 'Build', 'npm ci, type check, Vite build', null, 'compile error'],
    ['secrets', 'Secrets', 'Gitleaks (whole history)', sum(find('gitleaks.json'), gitleaks), 'any secret'],
    ['sast', 'Code', 'Semgrep', sum(find('semgrep.json'), semgrep), 'ERROR'],
    ['dependencies', 'Dependencies', 'Trivy fs', sum(find('dependencies.json'), trivy), 'HIGH/CRITICAL with a fix'],
    ['iac', 'Deployment files', 'Trivy config', sum(find('iac.json'), config), 'HIGH/CRITICAL'],
    ['image', 'Images', 'Trivy image (api + web)', sum(find('image.json'), trivy), 'HIGH/CRITICAL with a fix, secrets, root user'],
    ['dast', 'Deployment + DAST', 'kind + Kyverno + regression tests + ZAP + detection', zapResult, 'failed hardening check or test, High alert, undetected attack'],
  ]
  const icon = { success: '✅ passed', failure: '❌ failed', cancelled: '⚪ cancelled', skipped: '⏭️ skipped' }
  const findings = (found) => (found ? `${found.total}${found.blocking ? ` (${found.blocking} blocking)` : ''}` : '—')
  const detFile = find('detections.md')[0]
  const detLine = detFile && readFileSync(detFile, 'utf8').match(/(\d+ alerts? raised|Not detected:[^(]*)/)?.[1]
  const testsFile = find('tests.md')[0]
  const testsLine = testsFile && readFileSync(testsFile, 'utf8').match(/(All \d+ tests passed|\d+ of \d+ tests failed)/)?.[1]
  const k8sLine = k8sText.match(/\*\*(All \d+ checks passed|\d+ of \d+ checks failed)\*\*/)?.[1]
  const rows = gates.map(([id, gate, tool, found, rule]) => [
    `**${gate}**`,
    tool,
    icon[needs[id]?.result] ?? '—',
    id === 'dast' ? [k8sLine && `Kubernetes: ${k8sLine.toLowerCase()}`, testsLine && `Tests: ${testsLine.toLowerCase()}`, found && `ZAP: ${findings(found)} alerts`, detLine && `Detection: ${detLine.trim()}`].filter(Boolean).join(' · ') || '—' : findings(found),
    rule,
  ])
  const failed = Object.values(needs).filter((n) => n.result === 'failure').length
  const json = { commit: process.env.GITHUB_SHA, gates: Object.fromEntries(gates.map(([id, gate, tool, found]) => [id, { gate, tool, result: needs[id]?.result ?? null, findings: found?.total ?? null, blocking: found?.blocking ?? null }])), flawsConfirmedByZap: zapResult?.confirmed ?? [] }
  writeFileSync(join(dir, 'security-report.json'), JSON.stringify(json, null, 2))
  return {
    md: [
      `# 🛡️ Tropic Line — security report`,
      failed ? `**❌ ${failed} gate${failed === 1 ? '' : 's'} failed: images are not published.**` : `**✅ Every gate passed: images can be published.**`,
      table(['Gate', 'Tool', 'Result', 'Findings', 'Blocks on'], rows),
      zapResult?.confirmed?.length ? `\nZAP alerts linked to a planted flaw: **${zapResult.confirmed.join(', ')}**.` : '',
      `\n<sub>Each job's own summary below has the details. Policy and thresholds: docs/pipeline-policy.md. Machine-readable: artifact **security-report** (security-report.json).</sub>`,
    ],
  }
}

const parsers = { gitleaks, semgrep, trivy, config, zap, report }
if (!parsers[kind]) {
  console.error(`usage: node scripts/ci/summary.mjs <${Object.keys(parsers).join('|')}> <file> [title]`)
  process.exit(2)
}
if (kind !== 'report' && !existsSync(file)) {
  console.log(`> ⚠️ No report at \`${file}\`: the scan did not run to the end. See the job log.\n`)
  process.exit(0)
}
console.log(parsers[kind](file, title).md.filter(Boolean).join('\n\n') + '\n')
