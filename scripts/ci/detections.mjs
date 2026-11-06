// Reads the API's JSON log lines on stdin and reports the alerts raised by the detection rules
// (backend/src/security.js, docs/detection.md). Writes reports/detections.md and, in CI, the run-page summary.
// REQUIRE=rule1,rule2 makes it exit 1 unless each of those rules raised at least one alert.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'

let input = ''
for await (const chunk of process.stdin) input += chunk

const events = []
for (const line of input.split('\n')) {
  const json = line.slice(line.indexOf('{')) // kubectl --prefix adds "[pod/name/container] " in front
  if (!json.startsWith('{')) continue
  try { events.push({ ...JSON.parse(json), pod: line.match(/^\[pod\/([^/]+)/)?.[1] }) } catch { /* not a JSON line */ }
}

const alerts = events.filter((e) => e.level === 'alert').sort((a, b) => String(a.time).localeCompare(String(b.time)))
const byEvent = {}
for (const e of events) if (e.level === 'warn' || e.level === 'alert' || e.level === 'error') byEvent[e.event] = (byEvent[e.event] ?? 0) + 1
const required = (process.env.REQUIRE ?? '').split(',').filter(Boolean)
const missing = required.filter((rule) => !alerts.some((a) => a.rule === rule))

const cell = (v) => String(v ?? '—').replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 90)
const md = [
  '## 🚨 Runtime detection — alerts raised by the API',
  missing.length
    ? `**❌ Not detected:** ${missing.join(', ')} (the attacks run in this job should have raised them).`
    : `**✅ ${alerts.length} alert${alerts.length === 1 ? '' : 's'} raised**${required.length ? `, every expected rule fired (${required.join(', ')})` : ''}.`,
  '',
  '| Time (UTC) | Rule | What was seen | Source | Count / 5 min | Evidence | Request id |',
  '|---|---|---|---|---|---|---|',
  ...alerts.map((a) => `| ${a.time?.slice(11, 19)} | \`${a.rule}\` | ${cell(a.description)} | \`${cell(a.ip)}\`${a.account ? ` → ${cell(a.account)}` : ''} | ${a.count} | ${a.sample ? `\`${cell(a.sample)}\`` : `${a.method} ${cell(a.path)}${a.status ? ` → ${a.status}` : ''}`} | \`${cell(a.requestId)}\` |`),
  '',
  `**Security events in the logs:** ${Object.entries(byEvent).map(([k, n]) => `\`${k}\` ${n}`).join(' · ') || 'none'}`,
  '',
  `<sub>${events.length} log lines read${new Set(events.map((e) => e.pod).filter(Boolean)).size ? ` from ${new Set(events.map((e) => e.pod).filter(Boolean)).size} API pods` : ''}. Rules and thresholds: docs/detection.md. Response: docs/incident-response.md.</sub>`,
  '',
].join('\n')

mkdirSync('reports', { recursive: true })
writeFileSync('reports/detections.md', md)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md)
console.log(md)
process.exit(missing.length ? 1 : 0)
