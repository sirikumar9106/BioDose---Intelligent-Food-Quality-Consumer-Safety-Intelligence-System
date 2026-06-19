"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ChevronRight, X, Edit, LogOut,
  ShieldCheck, ScanLine, Activity, Lock, Check,
  AlertTriangle, AlertCircle, CheckCircle, Clock,
  ChevronUp, ChevronDown, Search,

} from "lucide-react"
import { InteractiveBackground } from "@/components/interactive-background"


import { API_BASE_URL as API_URL } from "@/lib/api"


const CONDITION_LABELS: Record<string, string> = {
  MDC01: "Diabetes Type 2",
  MDC02: "Hypertension",
  MDC03: "Asthma",
  MDC04: "Celiac Disease",
  MDC05: "IBS",
  MDC06: "Chronic Kidney Disease",
  MDC07: "Liver Disease",
  MDC08: "Thyroid Disorders",
  MDC09: "Autoimmune Conditions",
  MDC10: "ADHD",
  MDC11: "Heart Disease",
  MDC12: "Pregnancy",
  MDC13: "Lactation",
  MDC14: "Infants (0–2 yrs)",
  MDC15: "Children (3–12 yrs)",
  MDC16: "Elderly (60+)",
  MDC17: "Peanut Allergy",
  MDC18: "Shellfish Allergy",
  MDC19: "Dairy Allergy",
  MDC20: "Gluten Sensitivity",
  MDC21: "Soy Allergy",
}

interface UserProfile {
  id: string
  full_name: string
  username: string
  email: string
  age: number
  date_of_birth: string
  health_conditions: string[]
  profile_complete: boolean
}

interface AnalysisResult {
  product?: {
    product_name: string
    brand: string
    nutrition_per_100g?: {
      energy_kcal?: number
      carbohydrates_g?: number
      sugars_g?: number
      fat_g?: number
      proteins_g?: number
      salt_g?: number
    }
  }
  analysis?: {
    final_risk_score: number
    risk_label: string
    final_scores?: Record<string, number>
    additives?: Array<{ name: string; e_number: string; tox_penalty: number; match_type: string }>
  }
}

interface ScanHistoryItem {
  id: string
  barcode: string
  product_name: string
  brand: string
  risk_label: string
  risk_score: number
  scanned_at: string
  result_payload: AnalysisResult
}

type EditMode = null | "username" | "conditions"

// Floating card wrapper with shadow + hover pop
function FloatingCard({ children, className = "", onClick }: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.035, y: -6, boxShadow: "0 24px 60px -10px rgba(0,0,0,0.45)" }}
      whileTap={onClick ? { scale: 0.97 } : {}}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      onClick={onClick}
      className={`h-full rounded-2xl border border-border bg-card shadow-[0_8px_30px_-4px_rgba(0,0,0,0.3)] ${onClick ? "cursor-pointer" : "cursor-default"} ${className}`}
    >
      {children}
    </motion.div>
  )
}


export default function DashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [editMode, setEditMode] = useState<EditMode>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/dashboard/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  const [selectedAdditive, setSelectedAdditive] = useState<any | null>(null)
  const [wikiExtract, setWikiExtract] = useState<string | null>(null)
  const [wikiLoading, setWikiLoading] = useState(false)

  const handleAdditiveClick = async (additive: any) => {
    setSelectedAdditive(additive)
    setWikiExtract(null)
    setWikiLoading(true)
    try {
      let queryName = additive.name.trim()
      if (!queryName || queryName.toUpperCase() === "UNKNOWN") {
        queryName = additive.e_number
      }

      // Step 1: Use Wikipedia search API to resolve the exact page title
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(queryName)}&format=json&origin=*`
      const searchRes = await fetch(searchUrl)
      let resolvedTitle = queryName

      if (searchRes.ok) {
        const searchData = await searchRes.json()
        const results = searchData?.query?.search
        if (results && results.length > 0) {
          resolvedTitle = results[0].title
        }
      }

      // Step 2: Query summary for resolved title
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(resolvedTitle)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.extract) {
          setWikiExtract(data.extract)
          setWikiLoading(false)
          return
        }
      }

      // Step 3: Fallback to E-number search
      if (additive.e_number && additive.e_number !== "UNKNOWN") {
        const eSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(additive.e_number)}&format=json&origin=*`
        const eSearchRes = await fetch(eSearchUrl)
        let resolvedETitle = additive.e_number

        if (eSearchRes.ok) {
          const eSearchData = await eSearchRes.json()
          const eResults = eSearchData?.query?.search
          if (eResults && eResults.length > 0) {
            resolvedETitle = eResults[0].title
          }
        }

        const fallbackRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(resolvedETitle)}`)
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json()
          if (fallbackData.extract) {
            setWikiExtract(fallbackData.extract)
            setWikiLoading(false)
            return
          }
        }
      }

      setWikiExtract("No direct Wikipedia overview found for this substance.")
    } catch {
      setWikiExtract("Could not fetch information from Wikipedia. Showing local toxicological profile.")
    } finally {
      setWikiLoading(false)
    }
  }


  const [newUsername, setNewUsername] = useState("")
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [usernameChecking, setUsernameChecking] = useState(false)

  const [editConditions, setEditConditions] = useState<string[]>([])
  const [allConditions, setAllConditions] = useState<{ id: string; name: string }[]>([])
  const [condPassword, setCondPassword] = useState("")

  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const getToken = () => localStorage.getItem("access_token") ?? ""

  const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    let token = localStorage.getItem("access_token") ?? ""
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
    let res = await fetch(url, { ...options, headers })
    if (res.status === 401) {
      const refresh = localStorage.getItem("refresh_token")
      if (refresh) {
        try {
          const refreshRes = await fetch(`${API_URL}/api/v1/auth/token/refresh/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh })
          })
          if (refreshRes.ok) {
            const data = await refreshRes.json()
            localStorage.setItem("access_token", data.access)
            const retryHeaders = {
              ...(options.headers || {}),
              Authorization: `Bearer ${data.access}`
            }
            res = await fetch(url, { ...options, headers: retryHeaders })
          } else {
            localStorage.removeItem("access_token")
            localStorage.removeItem("refresh_token")
            router.push("/auth/login")
          }
        } catch {
          router.push("/auth/login")
        }
      } else {
        router.push("/auth/login")
      }
    }
    return res
  }, [router])

  const fetchProfile = useCallback(async () => {
    const token = getToken()
    if (!token) { router.push("/auth/login"); return }
    const res = await fetchWithAuth(`${API_URL}/api/v1/auth/profile/`)
    if (!res.ok) { router.push("/auth/login"); return }
    const data = await res.json()
    if (!data.profile_complete) { router.push("/profile-setup"); return }
    setProfile(data)
    setEditConditions(data.health_conditions ?? [])
  }, [router, fetchWithAuth])

  const fetchHistory = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setHistoryLoading(true)
    try {
      const res = await fetchWithAuth(`${API_URL}/api/v1/analysis/scan-history/`)
      if (res.ok) {
        const data = await res.json()
        setScanHistory(data.history ?? [])
      }
    } catch { /* silent */ } finally {
      setHistoryLoading(false)
    }
  }, [fetchWithAuth])

  useEffect(() => {
    fetchProfile()
    fetchHistory()
  }, [fetchProfile, fetchHistory])

  // Live username check
  useEffect(() => {
    if (!newUsername || newUsername.length < 3) { setUsernameAvailable(null); return }
    if (newUsername === profile?.username) { setUsernameAvailable(null); return }
    setUsernameChecking(true)
    const t = setTimeout(async () => {
      const res = await fetch(`${API_URL}/api/v1/auth/check-username/?username=${newUsername}`)
      const d = await res.json()
      setUsernameAvailable(d.available)
      setUsernameChecking(false)
    }, 500)
    return () => clearTimeout(t)
  }, [newUsername, profile?.username])

  const openEdit = async (mode: EditMode) => {
    setSaveMsg(null)
    setEditMode(mode)
    if (mode === "conditions") {
      const res = await fetchWithAuth(`${API_URL}/api/v1/auth/profile/setup/`)
      if (res.ok) {
        const data = await res.json()
        if (data.conditions) setAllConditions(data.conditions)
      }
    }
    if (mode === "username") setNewUsername(profile?.username ?? "")
  }

  const saveUsername = async () => {
    if (!newUsername || usernameAvailable === false) return
    setSaving(true); setSaveMsg(null)
    const res = await fetchWithAuth(`${API_URL}/api/v1/auth/update-username/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername })
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) {
      setSaveMsg({ type: "success", text: "Username updated!" })
      setProfile(p => p ? { ...p, username: data.username } : p)
      setEditMode(null)
    } else {
      setSaveMsg({ type: "error", text: data.error || "Failed to update username." })
    }
  }

  const saveConditions = async () => {
    if (!condPassword) { setSaveMsg({ type: "error", text: "Password is required." }); return }
    setSaving(true); setSaveMsg(null)
    const res = await fetchWithAuth(`${API_URL}/api/v1/auth/update-conditions/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: condPassword, health_conditions: editConditions })
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) {
      setSaveMsg({ type: "success", text: "Health conditions updated!" })
      setProfile(p => p ? { ...p, health_conditions: data.health_conditions } : p)
      setCondPassword(""); setEditMode(null)
    } else {
      setSaveMsg({ type: "error", text: data.error || "Update failed." })
    }
  }

  const handleLogout = async () => {
    const refresh = localStorage.getItem("refresh_token")
    await fetchWithAuth(`${API_URL}/api/v1/auth/logout/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh })
    }).catch(() => {})
    localStorage.removeItem("access_token")

    localStorage.removeItem("refresh_token")
    router.push("/")
  }

  const toggleCondition = (id: string) => {
    setEditConditions(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  const getRiskConfig = (score: number) => {
    if (score >= 0.5) return { color: "text-red-500", bg: "bg-red-500/10 border-red-500/30", icon: <AlertTriangle className="w-4 h-4" /> }
    if (score >= 0.25) return { color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/30", icon: <AlertCircle className="w-4 h-4" /> }
    return { color: "text-green-500", bg: "bg-green-500/10 border-green-500/30", icon: <CheckCircle className="w-4 h-4" /> }
  }

  if (!profile) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground">Loading your dashboard...</div>
    </div>
  )

  return (
    <div className="relative min-h-screen text-foreground overflow-hidden">
      <InteractiveBackground />

      {/* Profile Panel */}
      <AnimatePresence>
        {panelOpen && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setPanelOpen(false); setEditMode(null); setSaveMsg(null) }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              key="panel"
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 280, damping: 30 }}
              className="fixed left-0 top-0 bottom-0 w-80 z-50 bg-card/95 backdrop-blur-xl border-r border-border flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-border">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-bold font-syne text-lg text-primary">My Profile</span>
                  <button onClick={() => { setPanelOpen(false); setEditMode(null); setSaveMsg(null) }}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">
                    {profile.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold">{profile.full_name}</p>
                    <p className="text-sm text-muted-foreground">@{profile.username}</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {saveMsg && (
                  <div className={`p-3 rounded-lg text-sm ${saveMsg.type === "success" ? "bg-green-500/10 border border-green-500/30 text-green-500" : "bg-red-500/10 border border-red-500/30 text-red-500"}`}>
                    {saveMsg.text}
                  </div>
                )}

                {!editMode && (
                  <>
                    <div className="space-y-3">
                      <InfoRow label="Full Name" value={profile.full_name} locked />
                      <InfoRow label="Date of Birth" value={profile.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString() : "—"} locked />
                      <InfoRow label="Age" value={`${profile.age} years old`} locked />
                      <InfoRow label="Email" value={profile.email} locked />
                    </div>
                    <div className="pt-2 border-t border-border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">Username</span>
                        <button onClick={() => openEdit("username")} className="text-xs text-primary flex items-center gap-1 hover:underline">
                          <Edit className="w-3 h-3" /> Edit
                        </button>
                      </div>
                      <p className="font-medium">@{profile.username}</p>
                    </div>
                    <div className="pt-2 border-t border-border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">Health Conditions</span>
                        <button onClick={() => openEdit("conditions")} className="text-xs text-primary flex items-center gap-1 hover:underline">
                          <Lock className="w-3 h-3" /> Edit
                        </button>
                      </div>
                      {profile.health_conditions.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">None selected</p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {profile.health_conditions.map(c => (
                            <span key={c} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                              {CONDITION_LABELS[c] || c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {editMode === "username" && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                    <div className="flex items-center gap-2 mb-3">
                      <button onClick={() => setEditMode(null)} className="text-sm text-muted-foreground hover:text-foreground">← Back</button>
                      <span className="text-sm font-medium">Edit Username</span>
                    </div>
                    <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="New username" className="bg-background" />
                    {usernameChecking && <p className="text-xs text-muted-foreground">Checking...</p>}
                    {usernameAvailable === false && <p className="text-xs text-red-500">Username already exists</p>}
                    {usernameAvailable === true && <p className="text-xs text-green-500">Username is available ✓</p>}
                    <Button onClick={saveUsername} disabled={saving || usernameAvailable === false || !newUsername} size="sm" className="w-full rounded-full">
                      {saving ? "Saving..." : "Save Username"}
                    </Button>
                  </motion.div>
                )}

                {editMode === "conditions" && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                    <div className="flex items-center gap-2 mb-3">
                      <button onClick={() => setEditMode(null)} className="text-sm text-muted-foreground hover:text-foreground">← Back</button>
                      <span className="text-sm font-medium">Edit Conditions</span>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto">
                      {allConditions.map(c => (
                        <button key={c.id} onClick={() => toggleCondition(c.id)}
                          className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs text-left transition-all ${editConditions.includes(c.id) ? "bg-primary/10 text-primary" : "hover:bg-muted/40"}`}>
                          <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${editConditions.includes(c.id) ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                            {editConditions.includes(c.id) && <Check className="w-3 h-3 text-background" />}
                          </div>
                          {c.name}
                        </button>
                      ))}
                    </div>
                    <div className="pt-2 border-t border-border">
                      <Label className="text-xs text-muted-foreground mb-1 block">
                        <Lock className="w-3 h-3 inline mr-1" />Confirm with password
                      </Label>
                      <Input type="password" value={condPassword} onChange={e => setCondPassword(e.target.value)}
                        placeholder="Enter password to confirm" className="bg-background text-sm" />
                    </div>
                    <Button onClick={saveConditions} disabled={saving || !condPassword} size="sm" className="w-full rounded-full">
                      {saving ? "Saving..." : "Save Conditions"}
                    </Button>
                  </motion.div>
                )}
              </div>

              {!editMode && (
                <div className="p-6 border-t border-border">
                  <button onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl text-red-500 border border-red-500/20 hover:bg-red-500/10 transition-colors text-sm font-medium">
                    <LogOut className="w-4 h-4" /> Log Out
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="relative z-10 p-6 md:p-10 max-w-6xl mx-auto">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-12">
          <button
            onClick={() => setPanelOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-border bg-card hover:bg-muted/50 transition-colors text-sm font-medium group shadow-sm"
          >
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
              {profile.full_name.charAt(0)}
            </div>
            Profile
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* Greeting */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold font-syne mb-2">
            Hello, <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-emerald-500">{profile.full_name.split(" ")[0]}</span> 👋
          </h1>
          <p className="text-muted-foreground text-lg">
            Your health profile is active with {profile.health_conditions.length} condition{profile.health_conditions.length !== 1 ? "s" : ""}. Ready to scan?
          </p>
        </motion.div>

        {/* Google-like Search Bar */}
        <motion.form 
          onSubmit={handleSearchSubmit} 
          initial={{ opacity: 0, y: 15 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.15 }}
          className="mb-12 max-w-2xl"
        >
          <div className="relative group">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for product using name or barcode"
              className="w-full h-14 pl-12 pr-28 rounded-full border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent shadow-md transition-all duration-300 btn-3d"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5 group-focus-within:text-primary transition-colors" />
            <button
              type="submit"
              disabled={!searchQuery.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 px-5 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:scale-105 active:scale-95 transition-all duration-200 shadow-sm disabled:opacity-50 disabled:pointer-events-none"
            >
              Search
            </button>
          </div>
        </motion.form>

        {/* Action Cards — Floating with pop hover */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Scan card */}
          <motion.div className="h-full" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <FloatingCard
              className="p-5 bg-gradient-to-br from-teal-500/10 to-emerald-500/10 border-teal-500/20 text-left group flex flex-col justify-between h-full"
              onClick={() => router.push("/scan")}
            >
              <div>
                <ScanLine className="w-8 h-8 text-teal-400 mb-3 group-hover:scale-110 transition-transform" />
                <h3 className="font-bold text-lg font-syne mb-1">Scan a Product</h3>
                <p className="text-xs text-muted-foreground">Camera, gallery upload, or manual barcode entry.</p>
              </div>
              <div className="mt-4 flex items-center gap-1 text-teal-400 text-xs font-medium">
                Start scanning <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </FloatingCard>
          </motion.div>

          {/* History card */}
          <motion.div className="h-full" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <FloatingCard 
              className="p-5 text-left flex flex-col justify-between h-full"
              onClick={() => router.push("/dashboard/history")}
            >
              <div>
                <Activity className="w-8 h-8 text-blue-400 mb-3" />
                <h3 className="font-bold text-lg font-syne mb-1">Scan History</h3>
                <p className="text-xs text-muted-foreground">
                  {scanHistory.length === 0 ? "No scans yet. Start scanning to build your history." : `${scanHistory.length} recent scan${scanHistory.length > 1 ? "s" : ""} on file.`}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>Up to 5 recent scans</span>
                <span className="text-blue-400 font-medium">View all →</span>
              </div>
            </FloatingCard>
          </motion.div>

          {/* Risk profile card */}
          <motion.div className="h-full" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <FloatingCard className="p-5 text-left flex flex-col justify-between h-full" onClick={() => setPanelOpen(true)}>
              <div>
                <ShieldCheck className="w-8 h-8 text-purple-400 mb-3" />
                <h3 className="font-bold text-lg font-syne mb-1">Your Risk Profile</h3>
                <p className="text-xs text-muted-foreground truncate">
                  {profile.health_conditions.length === 0
                    ? "No conditions selected."
                    : profile.health_conditions.slice(0, 3).map(c => CONDITION_LABELS[c] || c).join(", ")
                      + (profile.health_conditions.length > 3 ? ` +${profile.health_conditions.length - 3} more` : "")}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground italic">
                <span>{profile.age} yrs old · Complete</span>
                <span className="text-purple-400 font-medium">Edit <ChevronRight className="w-3 h-3 inline" /></span>
              </div>
            </FloatingCard>
          </motion.div>
        </div>
      </div>

    </div>
  )
}

function InfoRow({ label, value, locked }: { label: string; value: string; locked?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-muted-foreground min-w-[80px]">{label}</span>
      <div className="flex items-center gap-1.5 flex-1 justify-end">
        <span className="text-sm font-medium text-right">{value}</span>
        {locked && <Lock className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" aria-label="Cannot be changed" />}
      </div>
    </div>
  )
}
