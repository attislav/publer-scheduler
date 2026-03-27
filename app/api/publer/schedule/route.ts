import type { NextRequest } from 'next/server'

const PUBLER_BASE = 'https://app.publer.com/api/v1'

function headers(key: string, workspaceId: string) {
  return {
    'Authorization': `Bearer-API ${key}`,
    'Publer-Workspace-Id': workspaceId,
    'Content-Type': 'application/json',
  }
}

export async function POST(request: NextRequest) {
  const key = process.env.PUBLER_API_KEY!
  const { workspaceId, posts } = await request.json()

  const results = []

  for (const post of posts) {
    try {
      // 1. Upload image
      const mediaRes = await fetch(`${PUBLER_BASE}/media/from-url`, {
        method: 'POST',
        headers: headers(key, workspaceId),
        body: JSON.stringify({ media: [{ url: post.imageUrl, name: 'post-image' }], type: 'single' })
      })
      const mediaData = await mediaRes.json()
      const jobId = mediaData?.job_id
      if (!jobId) throw new Error('Bild-Upload fehlgeschlagen: ' + JSON.stringify(mediaData))

      // 2. Poll for media ID
      await new Promise(r => setTimeout(r, 3000))
      let mediaId = null
      for (let i = 0; i < 15; i++) {
        const statusRes = await fetch(`${PUBLER_BASE}/job_status/${jobId}`, {
          headers: headers(key, workspaceId)
        })
        const statusData = await statusRes.json()
        if (statusData?.data?.status === 'complete') {
          const payload = statusData?.data?.payload
          mediaId = payload?.id || (Array.isArray(payload) ? payload[0]?.id : null)
          break
        }
        if (statusData?.data?.status === 'failed') throw new Error('Bild-Upload Job fehlgeschlagen')
        await new Promise(r => setTimeout(r, 2000))
      }
      if (!mediaId) throw new Error('Konnte Media-ID nach Upload nicht ermitteln')

      // 3. Create post
      const accountEntry: Record<string, unknown> = { id: post.accountId }
      if (post.scheduledAt) accountEntry.scheduled_at = post.scheduledAt
      if (post.firstComment) {
        accountEntry.comments = [{ text: post.firstComment }]
      }

      const postBody = {
        bulk: {
          state: 'scheduled',
          posts: [{
            networks: { facebook: { type: 'photo', text: post.text } },
            media: [{ id: mediaId, type: 'photo' }],
            accounts: [accountEntry]
          }]
        }
      }

      const postRes = await fetch(`${PUBLER_BASE}/posts/schedule/publish`, {
        method: 'POST',
        headers: headers(key, workspaceId),
        body: JSON.stringify(postBody)
      })
      const postData = await postRes.json()

      results.push({
        success: postData?.success === true,
        text: post.text.substring(0, 50),
        scheduledAt: post.scheduledAt,
        jobId: postData?.data?.job_id,
        error: postData?.success ? null : JSON.stringify(postData)
      })
    } catch (err: unknown) {
      results.push({ success: false, text: post.text?.substring(0, 50), error: String(err) })
    }
  }

  return Response.json({ results })
}
