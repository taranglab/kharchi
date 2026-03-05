export const config = {
  api: { bodyParser: { sizeLimit: '20mb' } },
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.VITE_ANTHROPIC_KEY
  if (!apiKey) return res.status(500).json({ error: 'API key not set' })

  try {
    const body = { ...req.body, model: 'claude-haiku-4-5-20251001' }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })
    const text = await response.text()
    res.setHeader('Content-Type', 'application/json')
    return res.status(response.status).send(text)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
