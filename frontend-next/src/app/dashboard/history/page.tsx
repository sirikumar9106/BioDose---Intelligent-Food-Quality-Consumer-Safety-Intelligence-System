"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import {
  ChevronRight, X, ArrowLeft, Clock, ScanLine, AlertTriangle,
  AlertCircle, CheckCircle, ChevronUp, ChevronDown, Flame, Beaker,
  Lock
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

export default function HistoryPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [activeHistoryDetail, setActiveHistoryDetail] = useState<ScanHistoryItem | null>(null)
  const [modalExpandedSection, setModalExpandedSection] = useState<string | null>("conditions")

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

  const getRiskConfig = (score: number) => {
    if (score >= 0.5) return { color: "text-red-500", bg: "bg-red-500/10 border-red-500/30", icon: <AlertTriangle className="w-4 h-4" /> }
    if (score >= 0.25) return { color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/30", icon: <AlertCircle className="w-4 h-4" /> }
    return { color: "text-green-500", bg: "bg-green-500/10 border-green-500/30", icon: <CheckCircle className="w-4 h-4" /> }
  }

  if (historyLoading || !profile) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground">Loading your scan history...</div>
    </div>
  )

  return (
    <div className="relative min-h-screen text-foreground overflow-hidden">
      <InteractiveBackground />

      {/* Main Content */}
      <div className="relative z-10 p-6 md:p-10 max-w-6xl mx-auto">
        {/* Top Navigation */}
        <div className="flex items-center justify-between mb-8">
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card hover:bg-muted/50 transition-colors text-sm font-medium shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            Back to Dashboard
          </Button>
        </div>

        {/* Title Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <h1 className="text-3xl md:text-4xl font-bold font-syne mb-2 flex items-center gap-3">
            <Clock className="w-8 h-8 text-blue-400" />
            Scan History
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            Review analysis reports and risk factors of your {scanHistory.length} most recent product scans.
          </p>
        </motion.div>

        {/* History Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {scanHistory.length === 0 ? (
            <div className="p-12 rounded-2xl border border-dashed border-border text-center text-muted-foreground max-w-md mx-auto mt-8">
              <ScanLine className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-sm">No scans yet. Scan your first product to see results here.</p>
              <Button
                onClick={() => router.push("/scan")}
                className="mt-6 rounded-full px-6 bg-blue-500 hover:bg-blue-600 text-white"
              >
                Go to Scanner →
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {scanHistory.map((item, i) => {
                const risk = getRiskConfig(item.risk_score)
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i }}
                  >
                    <FloatingCard
                      className="p-5 cursor-pointer flex flex-col justify-between h-full"
                      onClick={() => setActiveHistoryDetail(item)}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{item.product_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{item.brand || "Unknown brand"}</p>
                          </div>
                          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold ${risk.bg} ${risk.color} flex-shrink-0`}>
                            {risk.icon}
                            {item.risk_score.toFixed(2)}
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-semibold ${risk.color}`}>{item.risk_label}</span>
                          <span className="text-muted-foreground text-[10px]">
                            {new Date(item.scanned_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 pt-2 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                        <span>{item.barcode}</span>
                        <span className="text-primary hover:underline font-sans font-medium text-[11px]">View details →</span>
                      </div>
                    </FloatingCard>
                  </motion.div>
                )
              })}
            </div>
          )}
        </motion.div>
      </div>

      {/* History Detail Sliding Sheet */}
      <AnimatePresence>
        {activeHistoryDetail && (
          <>
            {/* Backdrop */}
            <motion.div
              key="detail-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveHistoryDetail(null)}
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md"
            />
            {/* Sliding Drawer */}
            <motion.div
              key="detail-modal"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 220 }}
              className="fixed right-0 top-0 bottom-0 w-full sm:w-[500px] md:w-[600px] z-50 bg-background border-l border-border shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="p-6 border-b border-border flex items-center justify-between bg-card">
                <div>
                  <h2 className="text-xl font-bold font-syne">Scan Details</h2>
                  <p className="text-xs text-muted-foreground font-mono">Barcode: {activeHistoryDetail.barcode}</p>
                </div>
                <button
                  onClick={() => setActiveHistoryDetail(null)}
                  className="p-2 rounded-xl hover:bg-muted transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Details list */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-20">
                {(() => {
                  const payload = activeHistoryDetail.result_payload
                  const risk = getRiskConfig(activeHistoryDetail.risk_score)
                  const product = payload?.product || { product_name: activeHistoryDetail.product_name, brand: activeHistoryDetail.brand }
                  const analysis = payload?.analysis || { final_risk_score: activeHistoryDetail.risk_score, risk_label: activeHistoryDetail.risk_label, final_scores: {}, additives: [] }

                  return (
                    <>
                      {/* Summary Card */}
                      <div className={`p-6 rounded-2xl border ${risk.bg} ring-4 ring-offset-0 ring-primary/5`}>
                        <h3 className="text-2xl font-bold font-syne mb-1">{product.product_name}</h3>
                        <p className="text-muted-foreground text-sm mb-4">Brand: {product.brand || "Unknown Brand"}</p>
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border bg-card font-bold text-sm">
                          {risk.icon}
                          <span className={risk.color}>{activeHistoryDetail.risk_label} — Score: {activeHistoryDetail.risk_score.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Nutrition Grid */}
                      {product.nutrition_per_100g && (
                        <div className="p-6 rounded-2xl border border-border bg-card">
                          <h4 className="font-bold font-syne mb-4 flex items-center gap-2 text-sm text-muted-foreground uppercase tracking-wider">
                            Nutrition per 100g
                          </h4>
                          <div className="grid grid-cols-3 gap-3">
                            {[
                              { label: "Energy", value: product.nutrition_per_100g.energy_kcal, unit: "kcal" },
                              { label: "Carbs", value: product.nutrition_per_100g.carbohydrates_g, unit: "g" },
                              { label: "Sugars", value: product.nutrition_per_100g.sugars_g, unit: "g" },
                              { label: "Fat", value: product.nutrition_per_100g.fat_g, unit: "g" },
                              { label: "Protein", value: product.nutrition_per_100g.proteins_g, unit: "g" },
                              { label: "Salt", value: product.nutrition_per_100g.salt_g, unit: "g" },
                            ].map(n => (
                              <div key={n.label} className="bg-muted/30 rounded-xl p-3 text-center">
                                <div className="text-lg font-bold">{n.value != null ? `${n.value}${n.unit}` : "N/A"}</div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">{n.label}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Condition-specific Risks */}
                      {analysis.final_scores && Object.keys(analysis.final_scores).length > 0 && (
                        <div className="rounded-2xl border border-border bg-card overflow-hidden">
                          <button
                            onClick={() => setModalExpandedSection(modalExpandedSection === "conditions" ? null : "conditions")}
                            className="w-full p-5 flex items-center justify-between hover:bg-muted/20 transition-colors"
                          >
                            <span className="font-bold font-syne text-sm flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                              Condition-Specific Risks
                            </span>
                            {modalExpandedSection === "conditions" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                          <AnimatePresence>
                            {modalExpandedSection === "conditions" && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="px-5 pb-5 space-y-2">
                                  {Object.entries(analysis.final_scores).map(([cond, score]) => {
                                    const pct = Math.round(score * 100)
                                    return (
                                      <div key={cond} className="space-y-1">
                                        <div className="flex justify-between text-xs">
                                          <span>{cond}</span>
                                          <span className="font-bold">{score.toFixed(2)}</span>
                                        </div>
                                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                          <div
                                            style={{ width: `${pct}%` }}
                                            className={`h-full rounded-full ${pct >= 50 ? "bg-red-500" : pct >= 25 ? "bg-amber-500" : "bg-green-500"}`}
                                          />
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Additives */}
                      <div className="rounded-2xl border border-border bg-card overflow-hidden">
                        <button
                          onClick={() => setModalExpandedSection(modalExpandedSection === "additives" ? null : "additives")}
                          className="w-full p-5 flex items-center justify-between hover:bg-muted/20 transition-colors"
                        >
                          <span className="font-bold font-syne text-sm flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                            Detected Additives ({analysis.additives?.length ?? 0})
                          </span>
                          {modalExpandedSection === "additives" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <AnimatePresence>
                          {modalExpandedSection === "additives" && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-5 pb-5 space-y-2">
                                {analysis.additives && analysis.additives.length > 0 ? (
                                  analysis.additives.map((a, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => handleAdditiveClick(a)}
                                      className="w-full text-left p-3 rounded-xl bg-muted/20 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/20 transition-all flex items-center gap-3 group cursor-pointer"
                                    >
                                      <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-mono group-hover:scale-105 transition-transform">{a.e_number}</span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold group-hover:text-purple-400 transition-colors flex items-center gap-1.5 truncate">
                                          {a.name}
                                          <span className="text-[10px] text-purple-500/60 font-normal opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">(Click to view)</span>
                                        </p>
                                        <p className="text-[10px] text-muted-foreground font-medium">Tox penalty: +{a.tox_penalty} · {a.match_type}</p>
                                      </div>
                                    </button>
                                  ))
                                ) : (
                                  <p className="text-xs text-muted-foreground italic">No risky additives detected.</p>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </>
                  )
                })()}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Additive Details Glassmorphic Popup Modal */}
      <AnimatePresence>
        {selectedAdditive && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedAdditive(null)}
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-black/60 backdrop-blur-xl p-6 shadow-2xl overflow-hidden text-foreground flex flex-col gap-4 max-h-[85vh] z-10"
            >
              {/* Background gradient glow */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

              {/* Close Button */}
              <button
                onClick={() => setSelectedAdditive(null)}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors z-10"
              >
                <X className="w-5 h-5 text-muted-foreground hover:text-white" />
              </button>

              {/* Header */}
              <div className="space-y-1 pr-8">
                <span className="text-[10px] font-bold tracking-wider text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2.5 py-0.5 rounded-full uppercase">
                  Additive Profile
                </span>
                <h3 className="text-xl font-bold font-syne text-white mt-2 leading-tight">
                  {selectedAdditive.name}
                </h3>
                <p className="text-xs font-mono text-muted-foreground">
                  {selectedAdditive.e_number} {selectedAdditive.scientific_name ? `· ${selectedAdditive.scientific_name}` : ""}
                </p>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {/* Wikipedia Overview */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Wikipedia Overview
                  </h4>
                  {wikiLoading ? (
                    <div className="space-y-2 py-1 animate-pulse">
                      <div className="h-3.5 bg-white/10 rounded w-full" />
                      <div className="h-3.5 bg-white/10 rounded w-5/6" />
                      <div className="h-3.5 bg-white/10 rounded w-4/5" />
                    </div>
                  ) : (
                    <p className="text-sm text-gray-200 leading-relaxed font-normal">
                      {wikiExtract}
                    </p>
                  )}
                </div>

                {/* Local Toxicological & Risk Details */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">
                    Toxicological Database Findings
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                      <p className="text-[10px] text-muted-foreground uppercase">Tox Penalty</p>
                      <p className="text-lg font-bold text-purple-400 font-mono">+{selectedAdditive.tox_penalty}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                      <p className="text-[10px] text-muted-foreground uppercase">Daily Intake (ADI)</p>
                      <p className="text-sm font-bold text-white truncate font-mono">
                        {selectedAdditive.adi && selectedAdditive.adi !== "nan" && selectedAdditive.adi !== "0" && selectedAdditive.adi !== "" ? `${selectedAdditive.adi} mg/kg bw` : "Not Established"}
                      </p>
                    </div>
                  </div>

                  {selectedAdditive.condition_scores && Object.keys(selectedAdditive.condition_scores).length > 0 && (
                    <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/10 space-y-2">
                      <p className="text-[10px] text-red-400 font-bold uppercase tracking-wide">Condition Flags</p>
                      <div className="space-y-1">
                        {Object.entries(selectedAdditive.condition_scores).map(([cond, score]: any) => (
                          <div key={cond} className="flex justify-between text-xs font-medium">
                            <span className="text-gray-300">{cond}</span>
                            <span className="text-red-400 font-bold">Score: {score}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Allergic Reactions */}
                  {selectedAdditive.allergic_reactions && selectedAdditive.allergic_reactions !== "NONE" && selectedAdditive.allergic_reactions !== "" && (
                    <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 space-y-1">
                      <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wide">Allergic Reactions</p>
                      <p className="text-xs text-gray-300 leading-relaxed font-normal">
                        {selectedAdditive.allergic_reactions} (Severity: <span className="font-semibold text-amber-300">{selectedAdditive.reaction_severity || "N/A"}</span>)
                      </p>
                    </div>
                  )}

                  {/* Carcinogenic Risk */}
                  {selectedAdditive.carcinogenic_risk && selectedAdditive.carcinogenic_risk !== "NONE" && selectedAdditive.carcinogenic_risk !== "" && (
                    <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/10 space-y-1">
                      <p className="text-[10px] text-rose-400 font-bold uppercase tracking-wide">Carcinogenic Risk Profile</p>
                      <p className="text-xs text-gray-300 leading-relaxed font-normal">
                        Risk Class: <span className="font-semibold text-rose-300 uppercase">{selectedAdditive.carcinogenic_risk}</span>
                      </p>
                    </div>
                  )}

                  {/* Medication Interactions */}
                  {selectedAdditive.medication_interactions && selectedAdditive.medication_interactions !== "NO" && selectedAdditive.medication_interactions !== "" && (
                    <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 space-y-1">
                      <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wide">Medication Interactions</p>
                      <p className="text-xs text-gray-300 leading-relaxed font-normal">
                        {selectedAdditive.medication_interactions}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
