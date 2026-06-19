"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft, Search, AlertTriangle, AlertCircle, CheckCircle,
  Flame, Zap, Beaker, ChevronUp, ChevronDown, RefreshCw, Sparkles, X
} from "lucide-react"

import { API_BASE_URL as API_URL } from "@/lib/api"

interface Product {
  barcode: string
  product_name: string
  brand: string
  quantity: string
  serving_size?: string
  image_url?: string
  categories?: string
  nutrition_per_100g?: {
    energy_kcal?: number
    carbohydrates_g?: number
    sugars_g?: number
    fat_g?: number
    proteins_g?: number
    salt_g?: number
  }
  ingredients_text?: string
  additives_tags?: string[]
  additives_count?: number
}

interface AnalysisResult {
  product: {
    product_name: string
    brand: string
    nutrition_per_100g: {
      energy_kcal?: number
      carbohydrates_g?: number
      sugars_g?: number
      fat_g?: number
      proteins_g?: number
      salt_g?: number
    }
  }
  analysis: {
    final_risk_score: number
    risk_label: string
    final_scores: Record<string, number>
    additives: Array<{ name: string; e_number: string; tox_penalty: number; match_type: string }>
    safe_additives?: Array<{ name: string; e_number: string }>
  }
}

function SearchContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const query = searchParams.get("q") || ""

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [expandedCard, setExpandedCard] = useState<string | null>(null) // barcode
  const [analyzingBarcode, setAnalyzingBarcode] = useState<string | null>(null)
  
  // Separate full screen analysis states
  const [activeAnalysisProduct, setActiveAnalysisProduct] = useState<Product | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [analysisError, setAnalysisError] = useState("")
  const [expandedSection, setExpandedSection] = useState<string | null>("conditions")

  // Additive Details Modal
  const [selectedAdditive, setSelectedAdditive] = useState<any | null>(null)
  const [wikiExtract, setWikiExtract] = useState<string | null>(null)
  const [wikiLoading, setWikiLoading] = useState(false)

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

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery) return
    setLoading(true)
    setError("")
    setProducts([])
    setAnalysisResult(null)
    setExpandedCard(null)
    setActiveAnalysisProduct(null)
    try {
      const res = await fetchWithAuth(`${API_URL}/products/search/?q=${encodeURIComponent(searchQuery)}`)
      if (!res.ok) {
        throw new Error("Failed to retrieve search results.")
      }
      const data = await res.json()
      setProducts(data.products || [])
    } catch (err: any) {
      setError(err.message || "An error occurred while searching.")
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth])

  useEffect(() => {
    if (query) {
      performSearch(query)
    }
  }, [query, performSearch])

  const handleAdditiveClick = async (additive: any) => {
    setSelectedAdditive(additive)
    setWikiExtract(null)
    setWikiLoading(true)
    try {
      let queryName = additive.name.trim()
      if (!queryName || queryName.toUpperCase() === "UNKNOWN") {
        queryName = additive.e_number
      }

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

      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(resolvedTitle)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.extract) {
          setWikiExtract(data.extract)
          setWikiLoading(false)
          return
        }
      }

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

  const startAnalysis = async (product: Product) => {
    setActiveAnalysisProduct(product)
    setAnalyzingBarcode(product.barcode)
    setAnalysisError("")
    setAnalysisResult(null)

    const startTime = Date.now()

    try {
      const res = await fetchWithAuth(`${API_URL}/products/analyze/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode: product.barcode })
      })

      const data = await res.json()

      const randomDelay = Math.floor(Math.random() * (8000 - 4000 + 1)) + 4000;
      const elapsedTime = Date.now() - startTime
      const remainingTime = Math.max(0, randomDelay - elapsedTime)
      await new Promise((resolve) => setTimeout(resolve, remainingTime))

      if (!res.ok) {
        setAnalysisError(data.error || "Analysis failed. Product could not be analyzed.")
      } else {
        setAnalysisResult(data)
      }
    } catch {
      setAnalysisError("Network error during analysis.")
    } finally {
      setAnalyzingBarcode(null)
    }
  }

  const getRiskConfig = (score: number) => {
    if (score >= 0.5) return { label: "High Risk", color: "text-red-500", bg: "bg-red-500/10 border-red-500/30", icon: <AlertTriangle className="w-6 h-6" />, ring: "ring-red-500/20" }
    if (score >= 0.25) return { label: "Moderate Risk", color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/30", icon: <AlertCircle className="w-6 h-6" />, ring: "ring-amber-500/20" }
    return { label: "Low Risk", color: "text-green-500", bg: "bg-green-500/10 border-green-500/30", icon: <CheckCircle className="w-6 h-6" />, ring: "ring-green-500/20" }
  }

  const checkNutritionAvailable = (nutr?: Product["nutrition_per_100g"]) => {
    if (!nutr) return false
    return Object.values(nutr).some(v => v !== null && v !== undefined)
  }

  // --- SEPARATE ANALYSIS RESULTS VIEW ---
  if (activeAnalysisProduct) {
    return (
      <div className="min-h-screen bg-background text-foreground py-8 px-4 md:px-8 max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")} className="rounded-full btn-3d bg-card border">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-syne">Analysis Results</h1>
            <p className="text-sm text-muted-foreground">{activeAnalysisProduct.product_name}</p>
          </div>
        </div>

        {/* Loading / Animating State */}
        {!analysisResult && !analysisError && (
          <div className="flex flex-col items-center justify-center py-20 gap-6">
            <div className="relative w-24 h-24 rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-green-500 dark:from-emerald-700 dark:via-teal-600 dark:to-green-600 animate-fluid-flow glow-effect flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-white animate-spin" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="font-bold text-lg font-syne text-emerald-400">Analyzing...</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Running rigorous safety calculations against your health profile...
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {analysisError && (
          <div className="space-y-4 py-8">
            <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-500 text-sm rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>{analysisError}</span>
            </div>
            <Button onClick={() => router.push("/dashboard")} className="w-full rounded-full btn-3d py-4">
              Back to Dashboard
            </Button>
          </div>
        )}

        {/* Success / Result State */}
        {analysisResult && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Product Header */}
            {(() => {
              const risk = getRiskConfig(analysisResult.analysis.final_risk_score)
              return (
                <div className={`p-6 rounded-2xl border ${risk.bg} ring-4 ${risk.ring}`}>
                  <h2 className="text-2xl font-bold font-syne mb-1">{analysisResult.product.product_name}</h2>
                  <p className="text-muted-foreground text-sm mb-4">Brand: {analysisResult.product.brand}</p>
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${risk.bg} ${risk.color} font-bold text-lg`}>
                    {risk.icon}
                    {risk.label} — Score: {analysisResult.analysis.final_risk_score.toFixed(2)}
                  </div>
                </div>
              )
            })()}

            {/* Nutrition per 100g */}
            <div className="p-6 rounded-2xl border border-border bg-card">
              <h3 className="font-bold font-syne mb-4 flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-400" /> Nutrition per 100g
              </h3>
              {checkNutritionAvailable(analysisResult.product.nutrition_per_100g) ? (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Energy", value: analysisResult.product.nutrition_per_100g.energy_kcal, unit: "kcal" },
                    { label: "Carbs", value: analysisResult.product.nutrition_per_100g.carbohydrates_g, unit: "g" },
                    { label: "Sugars", value: analysisResult.product.nutrition_per_100g.sugars_g, unit: "g" },
                    { label: "Fat", value: analysisResult.product.nutrition_per_100g.fat_g, unit: "g" },
                    { label: "Protein", value: analysisResult.product.nutrition_per_100g.proteins_g, unit: "g" },
                    { label: "Salt", value: analysisResult.product.nutrition_per_100g.salt_g, unit: "g" },
                  ].map(n => (
                    <div key={n.label} className="bg-muted/30 rounded-xl p-3 text-center">
                      <div className="text-xl font-bold">{n.value != null ? `${n.value}${n.unit}` : "N/A"}</div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mt-1">{n.label}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic bg-muted/10 p-4 rounded-xl border text-center">
                  Nutrition Split: Not Available
                </p>
              )}
            </div>

            {/* Condition Specific Risks */}
            {Object.keys(analysisResult.analysis.final_scores || {}).length > 0 && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <button
                  onClick={() => setExpandedSection(expandedSection === "conditions" ? null : "conditions")}
                  className="w-full p-5 flex items-center justify-between hover:bg-muted/20 transition-colors"
                >
                  <span className="font-bold font-syne flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-400" /> Condition-Specific Risks
                  </span>
                  {expandedSection === "conditions" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                <AnimatePresence>
                  {expandedSection === "conditions" && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 space-y-2">
                        {Object.entries(analysisResult.analysis.final_scores).map(([cond, score]) => {
                          const pct = Math.round(score * 100)
                          return (
                            <div key={cond} className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span>{cond}</span>
                                <span className="font-bold">{score.toFixed(2)}</span>
                              </div>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${pct}%` }}
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
                onClick={() => setExpandedSection(expandedSection === "additives" ? null : "additives")}
                className="w-full p-5 flex items-center justify-between hover:bg-muted/20 transition-colors"
              >
                <span className="font-bold font-syne flex items-center gap-2">
                  <Beaker className="w-5 h-5 text-purple-400" />
                  Additives Analysis ({(analysisResult.analysis.additives?.length ?? 0) + (analysisResult.analysis.safe_additives?.length ?? 0)})
                </span>
                {expandedSection === "additives" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <AnimatePresence>
                {expandedSection === "additives" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5 space-y-2">
                      {analysisResult.analysis.additives?.length > 0 && (
                        <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">
                          Risk-Flagged Additives ({analysisResult.analysis.additives.length})
                        </h4>
                      )}

                      {analysisResult.analysis.additives?.length > 0 ? analysisResult.analysis.additives.map(a => (
                        <button
                          key={a.e_number}
                          onClick={() => handleAdditiveClick(a)}
                          className="w-full text-left p-3 rounded-xl bg-muted/20 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/20 transition-all flex items-center gap-3 group cursor-pointer"
                        >
                          <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-mono group-hover:scale-105 transition-transform">{a.e_number}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium group-hover:text-purple-400 transition-colors flex items-center gap-1.5 truncate">
                              {a.name}
                              <span className="text-[10px] text-purple-500/60 font-normal opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">(Click to view)</span>
                            </p>
                            <p className="text-xs text-muted-foreground">Toxicological penalty: +{a.tox_penalty} · {a.match_type}</p>
                          </div>
                        </button>
                      )) : (
                        <p className="text-sm text-muted-foreground italic">No risky additives detected.</p>
                      )}

                      {analysisResult.analysis.safe_additives && analysisResult.analysis.safe_additives.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-border/60">
                           <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                            Other Additives (No Risk Flagged)
                          </h4>
                          <div className="flex flex-wrap gap-1.5">
                            {analysisResult.analysis.safe_additives.map((sa, idx) => (
                              <span 
                                key={idx} 
                                className="text-xs bg-muted/40 text-muted-foreground px-2.5 py-1 rounded-full border border-border/40 font-medium"
                              >
                                {sa.name} {sa.e_number && sa.e_number !== "UNKNOWN" ? `(${sa.e_number})` : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Button onClick={() => router.push("/dashboard")} className="w-full rounded-full btn-3d py-6 font-bold text-base" size="lg">
              Close & Go to Dashboard
            </Button>
          </motion.div>
        )}

        {/* Additive Details Modal */}
        <AnimatePresence>
          {selectedAdditive && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedAdditive(null)}
                className="absolute inset-0 bg-black/70 backdrop-blur-md"
              />

              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-black/60 backdrop-blur-xl p-6 shadow-2xl overflow-hidden text-foreground flex flex-col gap-4 max-h-[85vh] z-10"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

                <button
                  onClick={() => setSelectedAdditive(null)}
                  className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors z-10"
                >
                  <X className="w-5 h-5 text-muted-foreground hover:text-white" />
                </button>

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

                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
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

                    {selectedAdditive.allergic_reactions && selectedAdditive.allergic_reactions !== "NONE" && selectedAdditive.allergic_reactions !== "" && (
                      <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 space-y-1">
                        <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wide">Allergic Reactions</p>
                        <p className="text-xs text-gray-300 leading-relaxed font-normal">
                          {selectedAdditive.allergic_reactions} (Severity: <span className="font-semibold text-amber-300">{selectedAdditive.reaction_severity || "N/A"}</span>)
                        </p>
                      </div>
                    )}

                    {selectedAdditive.carcinogenic_risk && selectedAdditive.carcinogenic_risk !== "NONE" && selectedAdditive.carcinogenic_risk !== "" && (
                      <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/10 space-y-1">
                        <p className="text-[10px] text-rose-400 font-bold uppercase tracking-wide">Carcinogenic Risk Profile</p>
                        <p className="text-xs text-gray-300 leading-relaxed font-normal">
                          Risk Class: <span className="font-semibold text-rose-300 uppercase">{selectedAdditive.carcinogenic_risk}</span>
                        </p>
                      </div>
                    )}

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

  // --- STANDARD PRODUCTS LIST VIEW ---
  return (
    <div className="min-h-screen bg-background text-foreground py-8 px-4 md:px-8 max-w-4xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")} className="rounded-full btn-3d bg-card border">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-syne flex items-center gap-2">
            <Search className="w-6 h-6 text-primary" /> Search Results
          </h1>
          <p className="text-sm text-muted-foreground">Showing results for &ldquo;{query}&rdquo;</p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 flex items-center gap-2 mb-6">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 rounded-full border-4 border-border border-t-primary animate-spin" />
          <p className="text-muted-foreground font-medium">Searching Open Food Facts...</p>
        </div>
      ) : products.length === 0 && !error ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-border p-8">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-bold text-lg font-syne">No products found</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto mt-1">
            We couldn&apos;t find any products matching &ldquo;{query}&rdquo;. Check for typos or try searching a different name/barcode.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {products.map((product) => {
            const isExpanded = expandedCard === product.barcode
            const isAnalyzing = analyzingBarcode === product.barcode
            const hasNutrition = checkNutritionAvailable(product.nutrition_per_100g)

            return (
              <motion.div
                key={product.barcode}
                layout
                className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm transition-all"
              >
                {/* Compact Row */}
                <div
                  onClick={() => {
                    setExpandedCard(isExpanded ? null : product.barcode)
                  }}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-muted/30 transition-colors"
                >
                  <div>
                    <h3 className="font-bold font-syne text-lg text-foreground">{product.product_name}</h3>
                    <p className="text-sm text-muted-foreground">{product.brand || "Unknown Brand"}</p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <span className="text-xs font-medium px-3 py-1 bg-muted rounded-full border border-border">
                      {product.quantity || "Net Quantity N/A"}
                    </span>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                  </div>
                </div>

                {/* Expanded Details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-border bg-muted/10 overflow-hidden"
                    >
                      <div className="p-6 space-y-6">
                        {/* Nutrition Split */}
                        <div>
                          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Flame className="w-4 h-4 text-orange-400" /> Nutrition Split (per 100g)
                          </h4>
                          {hasNutrition && product.nutrition_per_100g ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {[
                                { label: "Energy", value: product.nutrition_per_100g.energy_kcal, unit: "kcal" },
                                { label: "Carbs", value: product.nutrition_per_100g.carbohydrates_g, unit: "g" },
                                { label: "Sugars", value: product.nutrition_per_100g.sugars_g, unit: "g" },
                                { label: "Fat", value: product.nutrition_per_100g.fat_g, unit: "g" },
                                { label: "Protein", value: product.nutrition_per_100g.proteins_g, unit: "g" },
                                { label: "Salt", value: product.nutrition_per_100g.salt_g, unit: "g" },
                              ].map((n) => (
                                <div key={n.label} className="bg-background rounded-xl p-3 text-center border border-border/60">
                                  <div className="text-base font-bold">{n.value != null ? `${n.value}${n.unit}` : "N/A"}</div>
                                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{n.label}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground italic bg-background p-4 rounded-xl border text-center">
                              Nutrition Split: Not Available
                            </p>
                          )}
                        </div>

                        {/* Analysis Trigger / Status */}
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border/60">
                          <div className="text-xs text-muted-foreground">
                            Barcode: <span className="font-mono">{product.barcode}</span>
                          </div>

                          {!isAnalyzing && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                startAnalysis(product)
                              }}
                              className="btn-3d w-full sm:w-auto px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-bold text-sm shadow-md flex items-center justify-center gap-2"
                            >
                              <Sparkles className="w-4 h-4" /> Start Analysis
                            </button>
                          )}

                          {isAnalyzing && (
                            <button
                              disabled
                              className="w-full sm:w-auto px-6 py-2.5 rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-green-500 dark:from-emerald-700 dark:via-teal-600 dark:to-green-600 animate-fluid-flow text-white font-bold text-sm glow-effect shadow-md flex items-center justify-center gap-2"
                            >
                              <RefreshCw className="w-4 h-4 animate-spin" /> Analyzing...
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading Search...</div>
      </div>
    }>
      <SearchContent />
    </Suspense>
  )
}
