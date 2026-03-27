import type { NextRequest } from 'next/server'

export const maxDuration = 60

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

  console.log(`[schedule] Starting: ${posts.length} posts, workspaceId=${workspaceId}`)

  const results = []

  for (const post of posts) {
    try {
      console.log(`[schedule] Post: "${post.text?.substring(0, 40)}", imageUrl=${post.imageUrl}, scheduledAt=${post.scheduledAt || 'sofort'}`)

      // 1. Upload image
      console.log(`[schedule] Step 1: Uploading image from URL...`)
      const mediaRes = await fetch(`${PUBLER_BASE}/media/from-url`, {
        method: 'POST',
        headers: headers(key, workspaceId),
        body: JSON.stringify({ media: [{ url: post.imageUrl, name: 'post-image' }], type: 'single' })
      })
      const mediaData = await mediaRes.json()
      console.log(`[schedule] Step 1 response (${mediaRes.status}):`, JSON.stringify(mediaData))

      const jobId = mediaData?.job_id
      if (!jobId) throw new Error(`Bild-Upload fehlgeschlagen (${mediaRes.status}): ${JSON.stringify(mediaData)}`)

      // 2. Poll for media ID
      console.log(`[schedule] Step 2: Polling job ${jobId}...`)
      await new Promise(r => setTimeout(r, 3000))
      let mediaId = null
      let lastStatusData = null
      for (let i = 0; i < 15; i++) {
        const statusRes = await fetch(`${PUBLER_BASE}/job_status/${jobId}`, {
          headers: headers(key, workspaceId)
        })
        const statusData = await statusRes.json()
        lastStatusData = statusData
        // Support both response shapes: { status, payload } and { data: { status, payload } }
        const status = statusData?.status ?? statusData?.data?.status
        const payload = statusData?.payload ?? statusData?.data?.payload
        console.log(`[schedule] Job poll ${i + 1}: status=${status}, payload=${JSON.stringify(payload)}`)

        if (status === 'complete') {
          mediaId = Array.isArray(payload) ? payload[0]?.id : (payload?.id ?? null)
          console.log(`[schedule] Job complete. mediaId=${mediaId}`)
          break
        }
        if (status === 'failed') throw new Error(`Bild-Upload Job fehlgeschlagen: ${JSON.stringify(statusData)}`)
        await new Promise(r => setTimeout(r, 2000))
      }
      if (!mediaId) throw new Error(`Konnte Media-ID nicht ermitteln. Letzter Job-Status: ${JSON.stringify(lastStatusData)}`)

      // 3. Create post
      const accountEntry: Record<string, unknown> = { id: post.accountId }
      if (post.scheduledAt) accountEntry.scheduled_at = post.scheduledAt
      if (post.firstComment) {
        const comment: Record<string, unknown> = { text: post.firstComment }
        if (post.commentDelay) comment.delay = post.commentDelay
        accountEntry.comments = [comment]
      }

      const state = post.postMode === 'draft' ? 'draft' : 'scheduled'
      console.log(`[schedule] Using state="${state}"`)
      const postBody = {
        bulk: {
          state,
          posts: [{
            networks: { facebook: { type: 'photo', text: post.text } },
            media: [{ id: mediaId, type: 'photo' }],
            accounts: [accountEntry]
          }]
        }
      }

      console.log(`[schedule] Step 3: Creating post...`, JSON.stringify(postBody))
      const postRes = await fetch(`${PUBLER_BASE}/posts/schedule/publish`, {
        method: 'POST',
        headers: headers(key, workspaceId),
        body: JSON.stringify(postBody)
      })
      const postData = await postRes.json()
      console.log(`[schedule] Step 3 response (${postRes.status}):`, JSON.stringify(postData))

      results.push({
        success: postData?.success === true,
        text: post.text.substring(0, 50),
        scheduledAt: post.scheduledAt,
        jobId: postData?.data?.job_id,
        error: postData?.success ? null : `Publer Fehler (${postRes.status}): ${JSON.stringify(postData)}`
      })
    } catch (err: unknown) {
      console.error(`[schedule] Error:`, err)
      results.push({ success: false, text: post.text?.substring(0, 50), scheduledAt: post.scheduledAt, error: String(err) })
    }
  }

  console.log(`[schedule] Done. Results:`, JSON.stringify(results))
  return Response.json({ results })
}
