'use client'

import { useState, useEffect, useRef } from 'react'

interface Post {
  imageUrl: string
  text: string
  firstComment: string
  scheduledAt: string
  status: 'ausstehend' | 'geplant' | 'fehlgeschlagen'
  error?: string
}

interface Workspace {
  id: string
  name: string
}

interface Account {
  id: string
  name: string
  type: string
}

function parseCSVLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false
  for (let j = 0; j < line.length; j++) {
    const ch = line[j]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      values.push(current.trim().replace(/^"|"$/g, ''))
      current = ''
    } else {
      current += ch
    }
  }
  values.push(current.trim().replace(/^"|"$/g, ''))
  return values
}

function parseCSV(raw: string): Post[] {
  const lines = raw.trim().split('\n')
  if (lines.length < 2) return []
  const header = parseCSVLine(lines[0]).map(h => h.toLowerCase())

  // Find column indexes — supports both Publer native export and custom format
  const findCol = (matchers: string[]) => {
    for (const m of matchers) {
      const idx = header.findIndex(h => h.includes(m))
      if (idx >= 0) return idx
    }
    return -1
  }
  const colDate    = findCol(['date', 'scheduled_at'])
  const colText    = findCol(['text'])
  const colMedia   = findCol(['media url', 'image_url'])
  const colComment = findCol(['comment', 'first_comment'])

  const posts: Post[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseCSVLine(line)
    const get = (idx: number) => (idx >= 0 ? (values[idx] || '').trim() : '')
    // Media URL: take only the first URL if comma-separated
    const mediaRaw = get(colMedia)
    const imageUrl = mediaRaw.split(',')[0].trim()
    posts.push({
      imageUrl,
      text: get(colText),
      firstComment: get(colComment),
      scheduledAt: get(colDate),
      status: 'ausstehend',
    })
  }
  return posts
}

export default function Home() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedWorkspace, setSelectedWorkspace] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [csvText, setCsvText] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const [autoSchedule, setAutoSchedule] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [intervalValue, setIntervalValue] = useState(1)
  const [intervalUnit, setIntervalUnit] = useState<'days' | 'hours'>('days')
  const [isScheduling, setIsScheduling] = useState(false)
  const [schedulingProgress, setSchedulingProgress] = useState(0)
  const [results, setResults] = useState<{ success: boolean; text: string; scheduledAt: string; error?: string | null }[]>([])
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/publer/workspaces')
      .then(r => r.json())
      .then(data => {
        const list = data?.data || []
        setWorkspaces(list)
        if (list.length > 0) setSelectedWorkspace(list[0].id)
      })
      .catch(console.error)
      .finally(() => setLoadingWorkspaces(false))
  }, [])

  useEffect(() => {
    if (!selectedWorkspace) return
    setLoadingAccounts(true)
    setAccounts([])
    setSelectedAccount('')
    fetch(`/api/publer/accounts?workspaceId=${selectedWorkspace}`)
      .then(r => r.json())
      .then(data => {
        const list = (data?.data || []).filter((a: Account) => a.type === 'facebook' || a.type === 'facebook_page' || a.type?.includes('facebook'))
        setAccounts(list)
        if (list.length > 0) setSelectedAccount(list[0].id)
      })
      .catch(console.error)
      .finally(() => setLoadingAccounts(false))
  }, [selectedWorkspace])

  function handleParse() {
    const parsed = parseCSV(csvText)
    setPosts(parsed)
    setResults([])
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setCsvText(text)
    }
    reader.readAsText(file)
  }

  function applyAutoSchedule() {
    if (!startDate) return
    const start = new Date(startDate)
    const intervalMs = intervalUnit === 'days'
      ? intervalValue * 24 * 60 * 60 * 1000
      : intervalValue * 60 * 60 * 1000

    setPosts(prev => prev.map((post, idx) => {
      if (post.scheduledAt) return post
      const scheduled = new Date(start.getTime() + idx * intervalMs)
      return { ...post, scheduledAt: scheduled.toISOString() }
    }))
  }

  function deletePost(idx: number) {
    setPosts(prev => prev.filter((_, i) => i !== idx))
  }

  function updatePost(idx: number, field: keyof Post, value: string) {
    setPosts(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))
  }

  async function handleScheduleAll() {
    if (!selectedWorkspace || !selectedAccount || posts.length === 0) return
    setIsScheduling(true)
    setSchedulingProgress(0)
    setResults([])

    const payload = posts.map(p => ({
      imageUrl: p.imageUrl,
      text: p.text,
      firstComment: p.firstComment,
      scheduledAt: p.scheduledAt,
      accountId: selectedAccount,
    }))

    // Schedule in batches of 5 to show progress
    const batchSize = 5
    const allResults: typeof results = []

    for (let i = 0; i < payload.length; i += batchSize) {
      const batch = payload.slice(i, i + batchSize)
      try {
        const res = await fetch('/api/publer/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: selectedWorkspace, posts: batch }),
        })
        const data = await res.json()
        allResults.push(...(data.results || []))
      } catch (err) {
        batch.forEach(b => allResults.push({ success: false, text: b.text.substring(0, 50), scheduledAt: b.scheduledAt, error: String(err) }))
      }
      setSchedulingProgress(Math.min(i + batchSize, payload.length))
      setResults([...allResults])
    }

    // Update post statuses
    setPosts(prev => prev.map((p, idx) => ({
      ...p,
      status: allResults[idx]?.success ? 'geplant' : 'fehlgeschlagen',
      error: allResults[idx]?.error || undefined,
    })))

    setIsScheduling(false)
  }

  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Publer Scheduler</h1>
            <p className="text-gray-400 text-sm mt-0.5">Facebook Bulk Post Planer</p>
          </div>
          {posts.length > 0 && (
            <div className="text-sm text-gray-400">
              <span className="text-white font-medium">{posts.length}</span> Posts geladen
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Config Section */}
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Konfiguration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Workspace</label>
              {loadingWorkspaces ? (
                <div className="h-10 bg-gray-800 rounded-lg animate-pulse" />
              ) : (
                <select
                  value={selectedWorkspace}
                  onChange={e => setSelectedWorkspace(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  {workspaces.length === 0 && <option value="">Keine Workspaces gefunden</option>}
                  {workspaces.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Facebook-Seite</label>
              {loadingAccounts ? (
                <div className="h-10 bg-gray-800 rounded-lg animate-pulse" />
              ) : (
                <select
                  value={selectedAccount}
                  onChange={e => setSelectedAccount(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  {accounts.length === 0 && <option value="">Keine Facebook-Seiten gefunden</option>}
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </section>

        {/* CSV Import */}
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">CSV Import</h2>

          <div className="mb-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
            <p className="text-xs text-gray-400">
              <span className="text-gray-300 font-medium">Publer CSV-Export</span> wird direkt unterstützt.
              <br />
              <span className="text-gray-500">Spalten: Date · Text · Links · <span className="text-blue-400">Media URL(s)</span> · Title · Labels · Alt · <span className="text-blue-400">Comment(s)</span> · …</span>
            </p>
          </div>

          <div className="space-y-3">
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder="CSV hier einfügen..."
              className="w-full h-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none placeholder-gray-600"
            />

            <div className="flex items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
              >
                CSV-Datei hochladen
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={handleParse}
                disabled={!csvText.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm text-white font-medium transition-colors"
              >
                Parsen
              </button>
              {posts.length > 0 && (
                <span className="text-sm text-green-400">
                  {posts.length} Posts geladen
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Auto-Schedule */}
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Auto-Zeitplan</h2>
            <button
              onClick={() => setAutoSchedule(!autoSchedule)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoSchedule ? 'bg-blue-600' : 'bg-gray-700'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoSchedule ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {autoSchedule && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Setzt automatisch Zeiten fur Posts ohne scheduled_at (beginnend beim ersten leeren Post).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Startdatum & -Zeit</label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Intervall</label>
                  <input
                    type="number"
                    min={1}
                    value={intervalValue}
                    onChange={e => setIntervalValue(Number(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Einheit</label>
                  <select
                    value={intervalUnit}
                    onChange={e => setIntervalUnit(e.target.value as 'days' | 'hours')}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="days">Tage</option>
                    <option value="hours">Stunden</option>
                  </select>
                </div>
              </div>
              <button
                onClick={applyAutoSchedule}
                disabled={!startDate || posts.length === 0}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm text-white font-medium transition-colors"
              >
                Zeiten anwenden
              </button>
            </div>
          )}
        </section>

        {/* Posts Preview */}
        {posts.length > 0 && (
          <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Vorschau ({posts.length} Posts)</h2>
              <button
                onClick={handleScheduleAll}
                disabled={isScheduling || !selectedAccount || posts.length === 0}
                className="px-5 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm text-white font-medium transition-colors flex items-center gap-2"
              >
                {isScheduling ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Planend... ({schedulingProgress}/{posts.length})
                  </>
                ) : (
                  'Alle planen'
                )}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-gray-400 font-medium pb-3 pr-4 w-16">Bild</th>
                    <th className="text-left text-gray-400 font-medium pb-3 pr-4">Text</th>
                    <th className="text-left text-gray-400 font-medium pb-3 pr-4 w-48">Erster Kommentar</th>
                    <th className="text-left text-gray-400 font-medium pb-3 pr-4 w-44">Geplant am</th>
                    <th className="text-left text-gray-400 font-medium pb-3 pr-4 w-24">Status</th>
                    <th className="pb-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {posts.map((post, idx) => (
                    <tr key={idx} className="group">
                      <td className="py-3 pr-4">
                        {post.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={post.imageUrl}
                            alt=""
                            className="w-12 h-12 object-cover rounded-lg bg-gray-800"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                        ) : (
                          <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center text-gray-600 text-xs">
                            kein
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <textarea
                          value={post.text}
                          onChange={e => updatePost(idx, 'text', e.target.value)}
                          className="w-full bg-transparent hover:bg-gray-800 focus:bg-gray-800 rounded px-2 py-1 text-gray-200 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                          rows={2}
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <input
                          value={post.firstComment}
                          onChange={e => updatePost(idx, 'firstComment', e.target.value)}
                          className="w-full bg-transparent hover:bg-gray-800 focus:bg-gray-800 rounded px-2 py-1 text-gray-400 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                          placeholder="—"
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <input
                          type="datetime-local"
                          value={post.scheduledAt ? post.scheduledAt.slice(0, 16) : ''}
                          onChange={e => updatePost(idx, 'scheduledAt', e.target.value ? new Date(e.target.value).toISOString() : '')}
                          className="w-full bg-transparent hover:bg-gray-800 focus:bg-gray-800 rounded px-2 py-1 text-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={post.status} error={post.error} />
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => deletePost(idx)}
                          className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all text-lg leading-none"
                          title="Löschen"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Results */}
        {results.length > 0 && (
          <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              Ergebnisse
              <span className="ml-3 text-sm font-normal text-gray-400">
                <span className="text-green-400">{successCount} erfolgreich</span>
                {failCount > 0 && <span className="text-red-400 ml-2">{failCount} fehlgeschlagen</span>}
              </span>
            </h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {results.map((r, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 p-3 rounded-lg text-sm ${r.success ? 'bg-green-950 border border-green-900' : 'bg-red-950 border border-red-900'}`}
                >
                  <span className={`text-lg leading-none mt-0.5 ${r.success ? 'text-green-400' : 'text-red-400'}`}>
                    {r.success ? '✓' : '✗'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-200 truncate block">{r.text}</span>
                    {r.scheduledAt && (
                      <span className="text-gray-500 text-xs">{new Date(r.scheduledAt).toLocaleString('de-DE')}</span>
                    )}
                    {r.error && (
                      <p className="text-red-400 text-xs mt-1 font-mono break-all">{r.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  )
}

function StatusBadge({ status, error }: { status: Post['status']; error?: string }) {
  const styles = {
    ausstehend: 'bg-gray-800 text-gray-400',
    geplant: 'bg-green-950 text-green-400 border border-green-900',
    fehlgeschlagen: 'bg-red-950 text-red-400 border border-red-900',
  }
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}
      title={error}
    >
      {status}
    </span>
  )
}
