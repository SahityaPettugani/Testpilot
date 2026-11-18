#!/usr/bin/env node
// Applies one Jira ticket to the guide content.
//
// Input: a JSON payload, from either
//   - GitHub Actions (repository_dispatch: event.client_payload, workflow_dispatch: event.inputs), or
//   - a file path given as the first argument (for local testing).
//
// Payload fields
//   key        Jira key, e.g. "YC-482"                         (required)
//   summary    Ticket summary                                   (required)
//   change     "User-facing change" field in plain words        (optional, falls back to summary)
//   feature    Feature ID or component that maps to a guide     (required unless guideId)
//   guideId    Guide id to update directly                      (optional)
//   version    Fix version, e.g. "2.5"                          (optional)
//   url        Link to the ticket                               (optional)
//   stepIndex  1-based step number the change affects           (optional)
//   stepText   New text for that step                           (optional)
//
// If ANTHROPIC_API_KEY is set, Claude rewrites the ticket into a reader-friendly note
// and proposes step text. Every change still lands in a pull request for human review.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const GUIDES = path.join(ROOT, 'content/guides.json');
const NEWS = path.join(ROOT, 'content/whats-new.json');

function readPayload() {
  if (process.argv[2]) return JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const evPath = process.env.GITHUB_EVENT_PATH;
  if (!evPath) throw new Error('No payload: pass a JSON file path or run inside GitHub Actions.');
  const ev = JSON.parse(fs.readFileSync(evPath, 'utf8'));
  return ev.client_payload || ev.inputs || {};
}

const clean = (v) => (typeof v === 'string' ? v.trim() : v);
const today = () => new Date().toISOString().slice(0, 10);

function findGuide(guides, p) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  // Jira sends several components as "A, B": try each one.
  const parts = String(p.feature || '').split(',').map(norm).filter(Boolean);
  if (p.guideId) { const hit = guides.find((g) => g.id === p.guideId); if (hit) return hit; }
  for (const f of parts) {
    const hit = guides.find((g) => norm(g.featureId) === f) || guides.find((g) => norm(g.title) === f || norm(g.id) === f);
    if (hit) return hit;
  }
  return null;
}

async function askClaude(guide, p) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const prompt = `You maintain a user guide for dealers and sub-dealers using the YaraConnect app.
A Jira ticket has shipped. Write how it affects this guide, for a non-technical shop owner.

Guide (JSON):
${JSON.stringify({ title: guide.title, steps: guide.steps }, null, 2)}

Ticket ${p.key}: ${p.summary}
User-facing change: ${p.change || '(not given)'}
${p.stepIndex ? `Developer says it affects step ${p.stepIndex}.` : ''}

Reply with JSON only, no prose:
{"note": "<one short sentence, plain words, what changed for the user>",
 "stepIndex": <1-based step number to rewrite, or null if no step text needs to change>,
 "step": {"title": "...", "android": "...", "ios": "..."} or null}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) {
    console.warn(`Claude API returned ${res.status}; continuing without AI rewrite.`);
    return null;
  }
  const body = await res.json();
  const text = (body.content || []).map((c) => c.text || '').join('');
  const match = text.match(/\{[\s\S]*\}/);
  try { return match ? JSON.parse(match[0]) : null; } catch { return null; }
}

function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  const delim = 'EOF_' + Math.random().toString(36).slice(2);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${delim}\n${value}\n${delim}\n`);
}

async function main() {
  const raw = readPayload();
  const p = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, clean(v)]));
  if (!p.key || !p.summary) throw new Error('Payload needs at least "key" and "summary".');
  p.stepIndex = p.stepIndex ? parseInt(p.stepIndex, 10) : null;

  const data = JSON.parse(fs.readFileSync(GUIDES, 'utf8'));
  const news = JSON.parse(fs.readFileSync(NEWS, 'utf8'));
  const guide = findGuide(data.guides, p);
  if (!guide) {
    const known = data.guides.map((g) => `${g.featureId} (${g.title})`).join(', ');
    throw new Error(`No guide matches feature "${p.feature}" / guideId "${p.guideId}". Known features: ${known}`);
  }

  const ai = await askClaude(guide, p);
  const note = (ai && ai.note) || p.change || p.summary;

  // Optional step rewrite: AI suggestion first, then the ticket's own stepText.
  let stepIdx0 = null;
  const aiStep = ai && Number.isInteger(ai.stepIndex) && ai.step ? ai : null;
  if (aiStep && guide.steps[aiStep.stepIndex - 1]) {
    stepIdx0 = aiStep.stepIndex - 1;
    guide.steps[stepIdx0] = { ...guide.steps[stepIdx0], ...aiStep.step };
  } else if (p.stepIndex && guide.steps[p.stepIndex - 1]) {
    stepIdx0 = p.stepIndex - 1;
    if (p.stepText) guide.steps[stepIdx0] = { ...guide.steps[stepIdx0], android: p.stepText, ios: p.stepText };
  }

  const date = today();
  guide.updated = date;
  if (p.version) guide.appVersion = p.version;
  guide.changes = (guide.changes || []).filter((c) => c.ticket !== p.key); // re-runs replace, not duplicate
  guide.changes.unshift({
    ticket: p.key, date, text: note,
    ...(p.version ? { version: p.version } : {}),
    ...(p.url ? { url: p.url } : {}),
    ...(stepIdx0 !== null ? { stepIndex: stepIdx0 } : {})
  });

  news.items = news.items.filter((n) => n.ticket !== p.key);
  news.items.unshift({ date, title: note, guideId: guide.id, ticket: p.key, ...(p.url ? { url: p.url } : {}) });

  fs.writeFileSync(GUIDES, JSON.stringify(data, null, 2) + '\n');
  fs.writeFileSync(NEWS, JSON.stringify(news, null, 2) + '\n');

  const summary = [
    `**Guide:** ${guide.title} (\`${guide.id}\`)`,
    `**Jira:** ${p.url ? `[${p.key}](${p.url})` : p.key} — ${p.summary}`,
    `**Note shown to readers:** ${note}`,
    stepIdx0 !== null ? `**Step changed:** ${stepIdx0 + 1}. ${guide.steps[stepIdx0].title}` : '**Step changed:** none',
    `**Drafted by:** ${ai ? 'Claude (please check wording)' : 'ticket text as written'}`,
    '',
    'Check screenshots for this step before merging.'
  ].join('\n');
  console.log(summary);
  setOutput('guide_id', guide.id);
  setOutput('guide_title', guide.title);
  setOutput('summary', summary);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
