export async function GET() {
  const key = process.env.PUBLER_API_KEY
  const res = await fetch('https://app.publer.com/api/v1/workspaces', {
    headers: { 'Authorization': `Bearer-API ${key}` },
    cache: 'no-store'
  })
  const data = await res.json()
  return Response.json(data)
}
