const BASE = '/api'

export async function generateDrafts(prompt) {
  const res = await fetch(`${BASE}/drafts/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to generate')
  return res.json()
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
