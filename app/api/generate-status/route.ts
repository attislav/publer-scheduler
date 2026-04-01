import type { NextRequest } from 'next/server'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return Response.json({ error: 'OPENAI_API_KEY nicht konfiguriert' }, { status: 500 })

  const { niche, additionalInfo, count, existingPosts } = await request.json()

  if (!niche || !count) {
    return Response.json({ error: 'Nische und Anzahl sind Pflichtfelder' }, { status: 400 })
  }

  const existingContext = existingPosts?.length
    ? `\n\nDo NOT repeat or closely paraphrase any of these existing posts:\n${existingPosts.slice(-50).map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}`
    : ''

  const systemPrompt = `You are an expert Facebook social media strategist specializing in viral organic reach. You create short German status posts that FORCE people to engage.

## ENGAGEMENT PSYCHOLOGY - use these techniques:

1. **Polarizing either/or statements** — Force people to pick a side. Everyone has an opinion and can't resist sharing it.
   Example: "Garten umgraben im Herbst — ja oder nein? 🤔"

2. **Bold controversial claims** — State something as absolute fact that many will disagree with. Disagreement = comments.
   Example: "Wer seinen Rasen düngt, hat den Garten nicht verstanden 🌿"

3. **"Obvious truth" posts** — Say something so relatable that people tag friends or comment "SO TRUE".
   Example: "Der erste eigene Tomatenertrag schmeckt besser als jedes Restaurant 🍅❤️"

4. **Hot takes / unpopular opinions** — Start with "Unpopuläre Meinung:" or a strong take that splits the audience.
   Example: "Unpopuläre Meinung: Hochbeete sind komplett überbewertet 😬"

5. **Open-ended debate starters** — Short questions that everyone has a different answer to.
   Example: "Was war euer größter Garten-Fail? 😅🌱"

6. **Fill-in-the-blank / complete the sentence** — People can't resist finishing a sentence.
   Example: "Ein Garten ohne _____ ist kein richtiger Garten 🌻"

7. **"Only real ones know"** — Creates in-group feeling, people comment to prove they belong.
   Example: "Wer um 6 Uhr morgens schon im Garten steht, weiß wovon ich rede ☀️🌱"

8. **Surprising facts or myth-busting** — Challenges what people thought they knew.
   Example: "Kaffeesatz als Dünger? Macht in 90% der Fälle mehr kaputt als es hilft ☕😳"

## RULES:
- Use 1-3 emojis per post (they boost visibility in Facebook feeds!)
- Keep posts to 1-2 sentences max — shorter = more engagement
- Mix ALL techniques above, don't just use one type
- Use casual, authentic German (du-Form, not Sie)
- NEVER use hashtags
- NEVER say "Teilt eure Meinung", "Schreibt in die Kommentare", "Like wenn..." or similar generic CTAs
- Open questions are GREAT — but make them specific and opinionated, not generic
- The post should feel like a real person wrote it, not a brand

Topic/Niche: ${niche}
${additionalInfo ? `Additional context: ${additionalInfo}` : ''}

Generate exactly ${count} unique Facebook status posts. At least 50% should be QUESTIONS (open-ended, either/or, fill-in-the-blank, debate starters). Mix in the other techniques for the rest. Return ONLY a JSON array of strings, no other text.${existingContext}`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Erstelle ${count} Facebook Status-Posts zum Thema "${niche}".` }
        ],
        temperature: 0.9,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[generate-status] OpenAI error:', errText)
      return Response.json({ error: `OpenAI Fehler (${res.status}): ${errText.substring(0, 200)}` }, { status: 502 })
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ''

    let posts: string[]
    try {
      const parsed = JSON.parse(content)
      // Handle both { posts: [...] } and direct array
      posts = Array.isArray(parsed) ? parsed : (parsed.posts || parsed.results || Object.values(parsed)[0])
      if (!Array.isArray(posts)) throw new Error('No array found')
    } catch {
      // Fallback: try extracting JSON array from markdown code fences
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (match) {
        posts = JSON.parse(match[1])
      } else {
        throw new Error(`Konnte AI-Antwort nicht parsen: ${content.substring(0, 200)}`)
      }
    }

    return Response.json({ posts })
  } catch (err) {
    console.error('[generate-status] Error:', err)
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
