import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  const apiKey = Deno.env.get('DEEPL_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'DEEPL_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  // Free accounts end in :fx and use api-free; paid use api.deepl.com
  const baseUrl = apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate'

  let texts: string[]
  try {
    const body = await req.json() as { texts: string[] }
    texts = body.texts ?? []
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  if (texts.length === 0) {
    return new Response(JSON.stringify({ translations: [] }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  // DeepL allows up to 50 texts per request — chunk if needed
  const CHUNK = 50
  const allTranslations: string[] = []

  for (let i = 0; i < texts.length; i += CHUNK) {
    const chunk = texts.slice(i, i + CHUNK)
    const params = new URLSearchParams()
    for (const t of chunk) params.append('text', t)
    params.set('target_lang', 'ES')
    params.set('source_lang', 'EN')

    const resp = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })

    if (!resp.ok) {
      const errText = await resp.text()
      return new Response(JSON.stringify({ error: errText }), {
        status: resp.status,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    const data = await resp.json() as { translations: Array<{ text: string }> }
    for (const t of data.translations) allTranslations.push(t.text)
  }

  return new Response(JSON.stringify({ translations: allTranslations }), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
})
