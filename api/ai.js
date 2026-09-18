// Routing AI: Groq for text/microphone, Gemini Vision only for real images.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' });

  try {
    const body = req.body || {};
    const payload = body.payload || {
      ...(body.systemInstruction ? { system_instruction: { parts: [{ text: body.systemInstruction }] } } : {}),
      contents: [{ role: 'user', parts: [{ text: body.prompt || '' }] }],
      generationConfig: { temperature: body.temperature ?? 0.7, maxOutputTokens: body.maxOutputTokens ?? 2048 }
    };

    // Considera immagine solo quando esiste realmente un dato immagine non vuoto.
    const allParts = (payload.contents || []).flatMap(item => item?.parts || []);
    const hasImage = allParts.some(part => {
      const inline = part?.inline_data || part?.inlineData;
      const imageUrl = part?.image_url;
      return Boolean(
        inline && (inline.data || inline.mime_type || inline.mimeType) ||
        imageUrl && (typeof imageUrl === 'string' ? imageUrl.length > 20 : imageUrl.url) ||
        part?.fileData?.fileUri ||
        part?.file_data?.file_uri
      );
    });

    // Coach e Scanner testuale, senza foto, usano Groq.
    if (!hasImage && process.env.GROQ_API_KEY) {
      const userText = body.prompt || payload?.contents?.flatMap(c => c.parts || [])?.map(p => p.text || '').join('\n') || '';
      const systemText = body.systemInstruction || payload?.system_instruction?.parts?.map(p => p.text || '').join('\n') || '';
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          messages: [...(systemText ? [{ role: 'system', content: systemText }] : []), { role: 'user', content: userText }],
          temperature: body.temperature ?? 0.7,
          max_tokens: body.maxOutputTokens ?? 2048
        })
      });
      const data = await response.json();
      if (response.ok && data?.choices?.[0]?.message?.content) {
        return res.status(200).json({ text: data.choices[0].message.content, raw: data, model: 'groq' });
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY non configurata su Vercel' });
    if (!payload.contents || !Array.isArray(payload.contents)) return res.status(400).json({ error: 'Payload Gemini non valido' });
    const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
    let lastError = 'Errore nella risposta Gemini';
    for (const model of models) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (response.ok) {
        const text = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
        if (text) return res.status(200).json({ text, raw: data, model });
        lastError = 'Gemini ha restituito una risposta vuota';
      } else {
        lastError = data?.error?.message || `Errore Gemini ${response.status}`;
        if (![400, 404, 429, 500, 502, 503, 504].includes(response.status)) break;
      }
    }
    return res.status(503).json({ error: `Servizio AI temporaneamente non disponibile. Dettaglio: ${lastError}` });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Errore interno del backend' });
  }
}
