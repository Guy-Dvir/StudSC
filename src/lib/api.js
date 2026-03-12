const BASE = '/api'

export function streamDrafts(prompt, { onDraftStart, onDraftReady, onDone, onError }) {
  const url = `${BASE}/drafts/generate?prompt=${encodeURIComponent(prompt)}`
  const source = new EventSource(url)

  source.addEventListener('draft_start', (e) => {
    onDraftStart?.(JSON.parse(e.data))
  })
  source.addEventListener('draft_ready', (e) => {
    onDraftReady?.(JSON.parse(e.data))
  })
  source.addEventListener('done', (e) => {
    onDone?.(JSON.parse(e.data))
    source.close()
  })
  source.addEventListener('error', (e) => {
    try { onError?.(JSON.parse(e.data)) } catch (_) { onError?.({ message: 'Connection lost' }) }
    source.close()
  })

  return () => source.close()
}

export async function createPlan(name, initialPrompt) {
  const res = await fetch(`${BASE}/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, initialPrompt }),
  })
  if (!res.ok) throw new Error('Failed to create plan')
  return res.json()
}

export async function getPlan(id) {
  const res = await fetch(`${BASE}/plans/${id}`)
  if (!res.ok) throw new Error('Plan not found')
  return res.json()
}

export async function sendChat(planId, message) {
  const res = await fetch(`${BASE}/plans/${planId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  if (!res.ok) throw new Error('Chat failed')
  return res.json()
}

export async function uploadFile(planId, file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/plans/${planId}/upload`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error('Upload failed')
  return res.json()
}

export async function saveSection(planId, sectionId, content) {
  const res = await fetch(`${BASE}/plans/${planId}/sections/${sectionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error('Save failed')
  return res.json()
}

export async function listPlans() {
  const res = await fetch(`${BASE}/plans`)
  if (!res.ok) throw new Error('Failed to load plans')
  return res.json()
}

export async function listDraftSessions() {
  const res = await fetch(`${BASE}/drafts/history`)
  if (!res.ok) throw new Error('Failed to load draft history')
  return res.json()
}

export async function saveDraftSession(prompt, drafts) {
  const res = await fetch(`${BASE}/drafts/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, drafts }),
  })
  if (!res.ok) throw new Error('Failed to save draft session')
  return res.json()
}

export async function getDraftSession(id) {
  const res = await fetch(`${BASE}/drafts/history/${id}`)
  if (!res.ok) throw new Error('Draft session not found')
  return res.json()
}
