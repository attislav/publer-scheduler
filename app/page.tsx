'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Upload, FileText, Play, Trash2, CheckCircle2, XCircle,
  Clock, RefreshCw, ChevronDown, Calendar, Settings2, LayoutList, Loader2
} from 'lucide-react'

interface Post {
  imageUrl: string
  text: string
  firstComment: string
  scheduledAt: string
  status: 'ausstehend' | 'geplant' | 'fehlgeschlagen'
  loading?: boolean
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
  provider?: string
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
  const [commentDelay, setCommentDelay] = useState(0)
  const [commentDelayUnit, setCommentDelayUnit] = useState<'Minute' | 'Hour' | 'Day'>('Minute')
  const [autoSchedule, setAutoSchedule] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [intervalValue, setIntervalValue] = useState(1)
  const [intervalUnit, setIntervalUnit] = useState<'days' | 'hours'>('days')
  const [postMode, setPostMode] = useState<'scheduled' | 'now' | 'draft' | 'auto'>('scheduled')
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
        const list = Array.isArray(data) ? data : (data?.data || [])
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
        const raw = Array.isArray(data) ? data : (data?.data || [])
        const list = raw.filter((a: Account) => a.type?.includes('facebook') || a.type === 'fb_page' || a.provider === 'facebook')
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

  async function schedulePostBatch(indices: number[]) {
    const payload = indices.map(i => {
      const p = posts[i]
      return {
        imageUrl: p.imageUrl,
        text: p.text,
        firstComment: p.firstComment,
        commentDelay: commentDelay > 0 ? { duration: commentDelay, unit: commentDelayUnit } : null,
        scheduledAt: postMode === 'now' ? '' : p.scheduledAt,
      postMode,
        accountId: selectedAccount,
      }
    })
    const res = await fetch('/api/publer/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: selectedWorkspace, posts: payload }),
    })
    const data = await res.json()
    return (data.results || []) as { success: boolean; text: string; scheduledAt: string; error?: string | null }[]
  }

  async function handleScheduleOne(idx: number) {
    if (!selectedWorkspace || !selectedAccount) return
    setPosts(prev => prev.map((p, i) => i === idx ? { ...p, loading: true } : p))
    try {
      const [result] = await schedulePostBatch([idx])
      setPosts(prev => prev.map((p, i) => i === idx ? { ...p, loading: false, status: result.success ? 'geplant' : 'fehlgeschlagen', error: result.error || undefined } : p))
      setResults(prev => [...prev, result])
    } catch (err) {
      setPosts(prev => prev.map((p, i) => i === idx ? { ...p, loading: false, status: 'fehlgeschlagen', error: String(err) } : p))
    }
  }

  async function handleScheduleAll() {
    if (!selectedWorkspace || !selectedAccount || posts.length === 0) return
    setIsScheduling(true)
    setSchedulingProgress(0)
    setResults([])

    const batchSize = 5
    const allResults: typeof results = []

    for (let i = 0; i < posts.length; i += batchSize) {
      const indices = Array.from({ length: Math.min(batchSize, posts.length - i) }, (_, k) => i + k)
      try {
        const batchResults = await schedulePostBatch(indices)
        allResults.push(...batchResults)
      } catch (err) {
        indices.forEach(idx => allResults.push({ success: false, text: posts[idx].text.substring(0, 50), scheduledAt: posts[idx].scheduledAt, error: String(err) }))
      }
      setSchedulingProgress(Math.min(i + batchSize, posts.length))
      setResults([...allResults])
    }

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
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">Publer Scheduler</h1>
              <p className="text-gray-500 text-xs">Facebook Bulk Post Planer</p>
            </div>
          </div>
          {posts.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <LayoutList className="w-4 h-4" />
              <span><span className="text-white font-medium">{posts.length}</span> Posts geladen</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-5">

        {/* Config Section */}
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 className="w-4 h-4 text-gray-400" />
            <h2 className="text-base font-semibold text-white">Konfiguration</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Workspace</label>
              {loadingWorkspaces ? (
                <div className="h-10 bg-gray-800 rounded-lg animate-pulse" />
              ) : (
                <div className="relative">
                  <select
                    value={selectedWorkspace}
                    onChange={e => setSelectedWorkspace(e.target.value)}
                    className="w-full appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-8 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    {workspaces.length === 0 && <option value="">Keine Workspaces gefunden</option>}
                    {workspaces.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-500 pointer-events-none" />
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Facebook-Seite</label>
              {loadingAccounts ? (
                <div className="h-10 bg-gray-800 rounded-lg animate-pulse" />
              ) : (
                <div className="relative">
                  <select
                    value={selectedAccount}
                    onChange={e => setSelectedAccount(e.target.value)}
                    className="w-full appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-8 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    {accounts.length === 0 && <option value="">Keine Facebook-Seiten gefunden</option>}
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-500 pointer-events-none" />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* CSV Import */}
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-gray-400" />
            <h2 className="text-base font-semibold text-white">CSV Import</h2>
          </div>

          <div className="mb-3 p-3 bg-gray-800/60 rounded-lg border border-gray-700/50">
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
              className="w-full h-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none placeholder-gray-600"
            />

            <div className="flex items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
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
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm text-white font-medium transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Parsen
              </button>
              {posts.length > 0 && (
                <span className="flex items-center gap-1.5 text-sm text-green-400">
                  <CheckCircle2 className="w-4 h-4" />
                  {posts.length} Posts geladen
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Comment Delay */}
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-gray-400" />
            <h2 className="text-base font-semibold text-white">First Comment Verzögerung</h2>
            <span className="text-xs text-gray-500 ml-1">— gilt für alle Posts</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Sofort</span>
              <button
                onClick={() => setCommentDelay(0)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${commentDelay === 0 ? 'bg-blue-600' : 'bg-gray-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${commentDelay === 0 ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {commentDelay === 0 && (
              <button
                onClick={() => setCommentDelay(5)}
                className="text-xs text-blue-400 hover:text-blue-300 underline transition-colors"
              >
                Verzögerung hinzufügen
              </button>
            )}
            {commentDelay > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">nach</span>
                <input
                  type="number"
                  min={1}
                  value={commentDelay}
                  onChange={e => setCommentDelay(Number(e.target.value))}
                  className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-center"
                />
                <div className="relative">
                  <select
                    value={commentDelayUnit}
                    onChange={e => setCommentDelayUnit(e.target.value as 'Minute' | 'Hour' | 'Day')}
                    className="appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 pr-7 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="Minute">Minuten</option>
                    <option value="Hour">Stunden</option>
                    <option value="Day">Tage</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                </div>
                <button
                  onClick={() => setCommentDelay(0)}
                  className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                >
                  entfernen
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Auto-Schedule */}
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <h2 className="text-base font-semibold text-white">Auto-Zeitplan</h2>
            </div>
            <button
              onClick={() => setAutoSchedule(!autoSchedule)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoSchedule ? 'bg-blue-600' : 'bg-gray-700'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoSchedule ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {autoSchedule && (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-gray-500">
                Setzt automatisch Zeiten für Posts ohne Datum (beginnend beim ersten leeren Post).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Startdatum & -Zeit</label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Intervall</label>
                  <input
                    type="number"
                    min={1}
                    value={intervalValue}
                    onChange={e => setIntervalValue(Number(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Einheit</label>
                  <div className="relative">
                    <select
                      value={intervalUnit}
                      onChange={e => setIntervalUnit(e.target.value as 'days' | 'hours')}
                      className="w-full appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-8 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="days">Tage</option>
                      <option value="hours">Stunden</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-500 pointer-events-none" />
                  </div>
                </div>
              </div>
              <button
                onClick={applyAutoSchedule}
                disabled={!startDate || posts.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm text-white font-medium transition-colors"
              >
                <Calendar className="w-3.5 h-3.5" />
                Zeiten anwenden
              </button>
            </div>
          )}
        </section>

        {/* Posts Preview */}
        {posts.length > 0 && (
          <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <LayoutList className="w-4 h-4 text-gray-400" />
                <h2 className="text-base font-semibold text-white">Vorschau <span className="text-gray-500 font-normal text-sm">({posts.length} Posts)</span></h2>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-gray-800 rounded-lg p-0.5 border border-gray-700">
                  {([
                    { value: 'draft', label: 'Draft', color: 'text-yellow-400' },
                    { value: 'auto', label: 'Auto', color: 'text-blue-400' },
                    { value: 'scheduled', label: 'Geplant', color: 'text-green-400' },
                    { value: 'now', label: 'Sofort', color: 'text-orange-400' },
                  ] as const).map(m => (
                    <button
                      key={m.value}
                      onClick={() => setPostMode(m.value)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${postMode === m.value ? `bg-gray-700 ${m.color}` : 'text-gray-500 hover:text-gray-300'}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleScheduleAll}
                  disabled={isScheduling || !selectedAccount || posts.length === 0}
                  className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm text-white font-medium transition-colors disabled:bg-gray-700 disabled:text-gray-500 ${
                    postMode === 'now' ? 'bg-orange-600 hover:bg-orange-500' :
                    postMode === 'draft' ? 'bg-yellow-700 hover:bg-yellow-600' :
                    postMode === 'auto' ? 'bg-blue-600 hover:bg-blue-500' :
                    'bg-green-600 hover:bg-green-500'
                  }`}
                >
                  {isScheduling ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {postMode === 'draft' ? 'Drafts...' : postMode === 'now' ? 'Veröffentliche...' : postMode === 'auto' ? 'Auto-Schedule...' : 'Planend...'} ({schedulingProgress}/{posts.length})
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      {postMode === 'draft' ? 'Alle als Draft' : postMode === 'now' ? 'Alle sofort posten' : postMode === 'auto' ? 'Alle auto-schedulen' : 'Alle planen'}
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-gray-500 font-medium text-xs pb-3 pr-4 w-16">Bild</th>
                    <th className="text-left text-gray-500 font-medium text-xs pb-3 pr-4">Text</th>
                    <th className="text-left text-gray-500 font-medium text-xs pb-3 pr-4 w-48">Erster Kommentar</th>
                    <th className="text-left text-gray-500 font-medium text-xs pb-3 pr-4 w-44">Geplant am</th>
                    <th className="text-left text-gray-500 font-medium text-xs pb-3 pr-4 w-24">Status</th>
                    <th className="pb-3 w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
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
                          <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center">
                            <FileText className="w-4 h-4 text-gray-600" />
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
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => handleScheduleOne(idx)}
                            disabled={post.status === 'geplant' || post.loading || isScheduling}
                            className={`p-1.5 rounded transition-colors disabled:opacity-30 ${postMode === 'now' ? 'text-orange-400 hover:bg-orange-900/40' : postMode === 'draft' ? 'text-yellow-400 hover:bg-yellow-900/40' : postMode === 'auto' ? 'text-blue-400 hover:bg-blue-900/40' : 'text-green-400 hover:bg-green-900/40'}`}
                            title={postMode === 'now' ? 'Sofort veröffentlichen' : postMode === 'auto' ? 'Auto-schedulen' : 'Planen'}
                          >
                            {post.loading
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Play className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => deletePost(idx)}
                            className="p-1.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                            title="Löschen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-base font-semibold text-white">Ergebnisse</h2>
              <div className="flex items-center gap-3 text-sm">
                {successCount > 0 && (
                  <span className="flex items-center gap-1 text-green-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {successCount} erfolgreich
                  </span>
                )}
                {failCount > 0 && (
                  <span className="flex items-center gap-1 text-red-400">
                    <XCircle className="w-3.5 h-3.5" />
                    {failCount} fehlgeschlagen
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {results.map((r, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 p-3 rounded-lg text-sm ${r.success ? 'bg-green-950/60 border border-green-900/50' : 'bg-red-950/60 border border-red-900/50'}`}
                >
                  {r.success
                    ? <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                    : <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  }
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
  if (status === 'geplant') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-950 text-green-400 border border-green-900" title={error}>
      <CheckCircle2 className="w-3 h-3" /> geplant
    </span>
  )
  if (status === 'fehlgeschlagen') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-950 text-red-400 border border-red-900" title={error}>
      <XCircle className="w-3 h-3" /> Fehler
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-800 text-gray-400" title={error}>
      <Clock className="w-3 h-3" /> ausstehend
    </span>
  )
}
