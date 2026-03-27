export async function GET(request: Request) {
  const key = process.env.PUBLER_API_KEY
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get('workspaceId')
  const res = await fetch('https://app.publer.com/api/v1/accounts', {
    headers: {
      'Authorization': `Bearer-API ${key}`,
      'Publer-Workspace-Id': workspaceId || '',
    },
    cache: 'no-store'
  })
  const data = await res.json()
  return Response.json(data)
}
