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
      const mediaRawText = await mediaRes.text()
      console.log(`[schedule] Step 1 response (${mediaRes.status}): ${mediaRawText}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let mediaData: any
      try { mediaData = JSON.parse(mediaRawText) } catch { throw new Error(`Upload-Antwort kein JSON (${mediaRes.status}): ${mediaRawText.substring(0, 200)}`) }

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
        const statusRawText = await statusRes.text()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let statusData: any
        try { statusData = JSON.parse(statusRawText) } catch { throw new Error(`Job-Status kein JSON: ${statusRawText.substring(0, 200)}`) }
        lastStatusData = statusData
        // Support both response shapes: { status, payload } and { data: { status, payload } }
        const status = statusData?.status ?? statusData?.data?.status
        const payload = statusData?.payload ?? statusData?.data?.payload
        console.log(`[schedule] Job poll ${i + 1}: status=${status}, payload=${JSON.stringify(payload)}`)

        if (status === 'complete') {
          mediaId = Array.isArray(payload) ? payload[0]?.id : payload?.id ?? null
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

      const isDraft = post.postMode === 'draft'
      const isAuto = post.postMode === 'auto'
      console.log(`[schedule] Mode=${post.postMode}, isDraft=${isDraft}, isAuto=${isAuto}`)

      const postBody = isDraft
        ? {
            bulk: {
              state: 'draft',
              posts: [{
                networks: { facebook: { type: 'photo', text: post.text } },
                media: [{ id: mediaId, type: 'photo' }],
                accounts: [{ id: post.accountId }]
              }]
            }
          }
        : isAuto
        ? {
            bulk: {
              state: 'scheduled',
              auto: true,
              posts: [{
                networks: { facebook: { type: 'photo', text: post.text } },
                media: [{ id: mediaId, type: 'photo' }],
                accounts: [{ id: post.accountId, share_next: true }]
              }]
            }
          }
        : {
            bulk: {
              state: 'scheduled',
              posts: [{
                networks: { facebook: { type: 'photo', text: post.text } },
                media: [{ id: mediaId, type: 'photo' }],
                accounts: [accountEntry]
              }]
            }
          }

      const postEndpoint = isDraft ? `${PUBLER_BASE}/posts/schedule` : `${PUBLER_BASE}/posts/schedule/publish`
      console.log(`[schedule] Step 3: Creating post via ${postEndpoint}...`, JSON.stringify(postBody))
      const postRes = await fetch(postEndpoint, {
        method: 'POST',
        headers: headers(key, workspaceId),
        body: JSON.stringify(postBody)
      })
      const postRawText = await postRes.text()
      console.log(`[schedule] Step 3 response (${postRes.status}): ${postRawText}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let postData: any
      try { postData = JSON.parse(postRawText) } catch { throw new Error(`Post-Antwort kein JSON (${postRes.status}): ${postRawText.substring(0, 200)}`) }

      // Publer returns either {"success":true,"data":{"job_id":"..."}} or just {"job_id":"..."}
      const postJobId = postData?.job_id ?? postData?.data?.job_id
      if (!postJobId) throw new Error(`Post-Erstellung fehlgeschlagen (${postRes.status}): ${JSON.stringify(postData)}`)

      // Poll post job to confirm actual success
      console.log(`[schedule] Step 4: Polling post job ${postJobId}...`)
      await new Promise(r => setTimeout(r, 2000))
      let postFinalStatus = null
      let postFinalData = null
      for (let i = 0; i < 10; i++) {
        const jobRes = await fetch(`${PUBLER_BASE}/job_status/${postJobId}`, { headers: headers(key, workspaceId) })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let jobData: any
        try { jobData = await jobRes.json() } catch { break }
        const status = jobData?.status ?? jobData?.data?.status
        console.log(`[schedule] Post job poll ${i + 1}: status=${status}`)
        if (status === 'complete' || status === 'failed') { postFinalStatus = status; postFinalData = jobData; break }
        await new Promise(r => setTimeout(r, 1500))
      }
      const postSuccess = postFinalStatus === 'complete'
      results.push({
        success: postSuccess,
        text: post.text.substring(0, 50),
        scheduledAt: post.scheduledAt,
        jobId: postJobId,
        error: postSuccess ? null : `Post-Job fehlgeschlagen: ${JSON.stringify(postFinalData)}`
      })
    } catch (err: unknown) {
      console.error(`[schedule] Error:`, err)
      results.push({ success: false, text: post.text?.substring(0, 50), scheduledAt: post.scheduledAt, error: String(err) })
    }
  }

  console.log(`[schedule] Done. Results:`, JSON.stringify(results))
  return Response.json({ results })
}
