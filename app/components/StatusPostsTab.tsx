'use client'

import { useState } from 'react'
import {
  Sparkles, Play, Trash2, CheckCircle2, XCircle,
  Clock, ChevronDown, Calendar, Loader2, LayoutList, RefreshCw, Check
} from 'lucide-react'

interface GeneratedPost {
  id: string
  text: string
  selected: boolean
  scheduledAt: string
  status: 'ausstehend' | 'geplant' | 'fehlgeschlagen'
  loading?: boolean
  error?: string
}

interface StatusPostsTabProps {
  selectedWorkspace: string
  selectedAccount: string
  labels: string[]
}

export default function StatusPostsTab({ selectedWorkspace, selectedAccount, labels }: StatusPostsTabProps) {
  const [niche, setNiche] = useState('')
  const [additionalInfo, setAdditionalInfo] = useState('')
  const [postCount, setPostCount] = useState(10)
  const [posts, setPosts] = useState<GeneratedPost[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [postMode, setPostMode] = useState<'scheduled' | 'now' | 'draft' | 'auto'>('auto')
  const [autoSchedule, setAutoSchedule] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [intervalValue, setIntervalValue] = useState(1)
  const [intervalUnit, setIntervalUnit] = useState<'days' | 'hours'>('days')
  const [isScheduling, setIsScheduling] = useState(false)
  const [schedulingProgress, setSchedulingProgress] = useState(0)
  const [results, setResults] = useState<{ success: boolean; text: string; scheduledAt: string; error?: string | null }[]>([])

  const selectedPosts = posts.filter(p => p.selected && p.status === 'ausstehend')
  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length

  async function handleGenerate() {
    if (!niche.trim()) return
    setIsGenerating(true)
    try {
      const res = await fetch('/api/generate-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: niche.trim(),
          additionalInfo: additionalInfo.trim(),
          count: postCount,
          existingPosts: posts.map(p => p.text),
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const newPosts: GeneratedPost[] = (data.posts || []).map((text: string) => ({
        id: crypto.randomUUID(),
        text,
        selected: true,
        scheduledAt: '',
        status: 'ausstehend' as const,
      }))
      setPosts(prev => [...prev, ...newPosts])
    } catch (err) {
      console.error('Generate error:', err)
      alert(`Fehler bei der Generierung: ${err}`)
    } finally {
      setIsGenerating(false)
    }
  }

  function toggleAll(selected: boolean) {
    setPosts(prev => prev.map(p => p.status === 'ausstehend' ? { ...p, selected } : p))
  }

  function togglePost(id: string) {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, selected: !p.selected } : p))
  }

  function deletePost(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id))
  }

  function updatePostText(id: string, text: string) {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, text } : p))
  }

  function applyAutoSchedule() {
    if (!startDate) return
    const start = new Date(startDate)
    const intervalMs = intervalUnit === 'days'
      ? intervalValue * 24 * 60 * 60 * 1000
      : intervalValue * 60 * 60 * 1000

    let idx = 0
    setPosts(prev => prev.map(post => {
      if (!post.selected || post.status !== 'ausstehend') return post
      if (post.scheduledAt) { idx++; return post }
      const scheduled = new Date(start.getTime() + idx * intervalMs)
      idx++
      return { ...post, scheduledAt: scheduled.toISOString() }
    }))
  }

  async function handleScheduleSelected() {
    if (!selectedWorkspace || !selectedAccount || selectedPosts.length === 0) return
    setIsScheduling(true)
    setSchedulingProgress(0)
    setResults([])

    const batchSize = 5
    const allResults: typeof results = []
    const toSchedule = selectedPosts

    for (let i = 0; i < toSchedule.length; i += batchSize) {
      const batch = toSchedule.slice(i, i + batchSize)
      const payload = batch.map(p => ({
        text: p.text,
        imageUrl: null,
        firstComment: null,
        commentDelay: null,
        scheduledAt: postMode === 'now' ? '' : p.scheduledAt,
        postMode,
        labels: labels.length > 0 ? labels : null,
        accountId: selectedAccount,
      }))

      try {
        const res = await fetch('/api/publer/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: selectedWorkspace, posts: payload }),
        })
        const data = await res.json()
        const batchResults = (data.results || []) as typeof results
        allResults.push(...batchResults)
      } catch (err) {
        batch.forEach(p => allResults.push({ success: false, text: p.text.substring(0, 50), scheduledAt: p.scheduledAt, error: String(err) }))
      }
      setSchedulingProgress(Math.min(i + batchSize, toSchedule.length))
      setResults([...allResults])
    }

    // Update post statuses
    let resultIdx = 0
    setPosts(prev => prev.map(p => {
      if (!p.selected || p.status !== 'ausstehend') return p
      const result = allResults[resultIdx++]
      if (!result) return p
      return {
        ...p,
        status: result.success ? 'geplant' as const : 'fehlgeschlagen' as const,
        error: result.error || undefined,
      }
    }))

    setIsScheduling(false)
  }

  return (
    <div className="space-y-5">
      {/* Generation Input */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <h2 className="text-base font-semibold text-white">Status Posts generieren</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Nische / Thema</label>
            <input
              value={niche}
              onChange={e => setNiche(e.target.value)}
              placeholder="z.B. Gemüsegarten, Selbstversorgung"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 placeholder-gray-600"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Weitere Infos</label>
            <input
              value={additionalInfo}
              onChange={e => setAdditionalInfo(e.target.value)}
              placeholder="z.B. Zielgruppe, Tonalität, Saison..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 placeholder-gray-600"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Anzahl</label>
            <input
              type="number"
              min={1}
              max={50}
              value={postCount}
              onChange={e => setPostCount(Number(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={!niche.trim() || isGenerating}
            className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm text-white font-medium transition-colors"
          >
            {isGenerating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generiere...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Generieren</>
            )}
          </button>
          {posts.length > 0 && (
            <button
              onClick={handleGenerate}
              disabled={!niche.trim() || isGenerating}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-700 disabled:text-gray-500 border border-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Weitere generieren
            </button>
          )}
          {posts.length > 0 && (
            <span className="text-sm text-gray-400">
              {posts.length} Posts generiert, {selectedPosts.length} ausgewählt
            </span>
          )}
        </div>
      </section>

      {/* Generated Posts */}
      {posts.length > 0 && (
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <LayoutList className="w-4 h-4 text-gray-400" />
              <h2 className="text-base font-semibold text-white">
                Generierte Posts <span className="text-gray-500 font-normal text-sm">({posts.length})</span>
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleAll(true)}
                className="px-3 py-1 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-md border border-gray-700 transition-colors"
              >
                Alle
              </button>
              <button
                onClick={() => toggleAll(false)}
                className="px-3 py-1 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-md border border-gray-700 transition-colors"
              >
                Keine
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {posts.map(post => (
              <div
                key={post.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  post.status === 'geplant' ? 'bg-green-950/40 border-green-900/50' :
                  post.status === 'fehlgeschlagen' ? 'bg-red-950/40 border-red-900/50' :
                  post.selected ? 'bg-gray-800/80 border-purple-800/50' : 'bg-gray-800/40 border-gray-800'
                }`}
              >
                {post.status === 'ausstehend' ? (
                  <button
                    onClick={() => togglePost(post.id)}
                    className={`mt-1 shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      post.selected ? 'bg-purple-600 border-purple-600' : 'border-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {post.selected && <Check className="w-3 h-3 text-white" />}
                  </button>
                ) : post.status === 'geplant' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-400 mt-1 shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400 mt-1 shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  {post.status === 'ausstehend' ? (
                    <textarea
                      value={post.text}
                      onChange={e => updatePostText(post.id, e.target.value)}
                      className="w-full bg-transparent hover:bg-gray-700/50 focus:bg-gray-700/50 rounded px-2 py-1 text-gray-200 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                      rows={2}
                    />
                  ) : (
                    <p className="text-gray-200 text-sm px-2 py-1">{post.text}</p>
                  )}
                  {post.error && (
                    <p className="text-red-400 text-xs mt-1 px-2 font-mono">{post.error}</p>
                  )}
                </div>

                {post.status === 'ausstehend' && (
                  <button
                    onClick={() => deletePost(post.id)}
                    className="mt-1 p-1.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-900/20 transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Scheduling Controls */}
      {posts.length > 0 && (
        <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <h2 className="text-base font-semibold text-white">Planen</h2>
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
            </div>
          </div>

          {/* Auto-Schedule for scheduled mode */}
          {postMode === 'scheduled' && (
            <div className="mb-4 p-4 bg-gray-800/60 rounded-lg border border-gray-700/50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-300">Auto-Zeitplan für ausgewählte Posts</span>
                <button
                  onClick={() => setAutoSchedule(!autoSchedule)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoSchedule ? 'bg-purple-600' : 'bg-gray-700'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoSchedule ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {autoSchedule && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Startdatum & -Zeit</label>
                    <input
                      type="datetime-local"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Intervall</label>
                    <input
                      type="number"
                      min={1}
                      value={intervalValue}
                      onChange={e => setIntervalValue(Number(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-400 mb-1">Einheit</label>
                      <div className="relative">
                        <select
                          value={intervalUnit}
                          onChange={e => setIntervalUnit(e.target.value as 'days' | 'hours')}
                          className="w-full appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-8 text-white text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                        >
                          <option value="days">Tage</option>
                          <option value="hours">Stunden</option>
                        </select>
                        <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-500 pointer-events-none" />
                      </div>
                    </div>
                    <button
                      onClick={applyAutoSchedule}
                      disabled={!startDate}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm text-white font-medium transition-colors"
                    >
                      Anwenden
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleScheduleSelected}
            disabled={isScheduling || !selectedAccount || selectedPosts.length === 0}
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
                {postMode === 'draft' ? 'Drafts...' : postMode === 'now' ? 'Veröffentliche...' : postMode === 'auto' ? 'Auto-Schedule...' : 'Planend...'}
                ({schedulingProgress}/{selectedPosts.length})
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                {selectedPosts.length} ausgewählte {postMode === 'draft' ? 'als Draft' : postMode === 'now' ? 'sofort posten' : postMode === 'auto' ? 'auto-schedulen' : 'planen'}
              </>
            )}
          </button>
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
                  {r.error && (
                    <p className="text-red-400 text-xs mt-1 font-mono break-all">{r.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
