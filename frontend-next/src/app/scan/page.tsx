"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Camera, ImageIcon, Hash, ArrowLeft, RefreshCw,
  AlertTriangle, CheckCircle, AlertCircle,
  Beaker, Zap, Droplets, Flame, ChevronDown, ChevronUp, X
} from "lucide-react"

import { API_BASE_URL as API_URL } from "@/lib/api"


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
  }
}

type ScanMode = "menu" | "camera" | "manual" | "results"

export default function ScanPage() {
  const router = useRouter()
  const [mode, setMode] = useState<ScanMode>("menu")
  const [manualCode, setManualCode] = useState("")
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [expandedSection, setExpandedSection] = useState<string | null>("conditions")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const html5QrCodeRef = useRef<InstanceType<typeof import("html5-qrcode").Html5Qrcode> | null>(null)

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


  useEffect(() => {
    const token = getToken()
    if (!token) { router.push("/auth/login") }
  }, [router])

  // Camera mode: start scanner
  useEffect(() => {
    if (mode !== "camera") return
    let mounted = true
    let qrScanner: any = null

    const startCamera = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode")
        
        // Wait up to 2 seconds (polling every 100ms) for the qr-reader element to be mounted in DOM
        let attempts = 0
        while (mounted && !document.getElementById("qr-reader") && attempts < 20) {
          await new Promise((resolve) => setTimeout(resolve, 100))
          attempts++
        }

        if (!mounted) return
        if (!document.getElementById("qr-reader")) {
          setError("Camera scanner element could not be found.")
          return
        }

        qrScanner = new Html5Qrcode("qr-reader")
        html5QrCodeRef.current = qrScanner

        await qrScanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decoded: string) => {
            if (mounted) {
              if (qrScanner && qrScanner.isScanning) {
                qrScanner.stop()
                  .then(() => {
                    analyzeBarcode(decoded)
                  })
                  .catch((err: any) => {
                    console.error("Failed to stop scanner on decode:", err)
                    analyzeBarcode(decoded)
                  })
              } else {
                analyzeBarcode(decoded)
              }
            }
          },
          () => {} // silent scan fail callback
        )
      } catch (err) {
        console.error("Camera start failed:", err)
        if (mounted) {
          setError("Camera access denied or device has no camera available.")
          setMode("menu")
        }
      }
    }

    startCamera()
    return () => {
      mounted = false
      if (qrScanner) {
        if (qrScanner.isScanning) {
          qrScanner.stop().catch((err: any) => console.warn("Error stopping scanner on unmount:", err))
        }
      }
      html5QrCodeRef.current = null
    }
  }, [mode])

  const analyzeBarcode = async (barcode: string) => {
    setLoading(true)
    setError("")
    setMode("menu")
    try {
      const res = await fetchWithAuth(`${API_URL}/products/analyze/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Analysis failed. Product may not be in our database.")
      } else {
        setResult(data)
        setMode("results")
      }
    } catch {
      setError("Network error during analysis.")
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError("")
    try {
      // Compress & resize image to max 1600px to prevent high bandwidth/RAM usage
      const resizedFile = await new Promise<File | Blob>((resolve) => {
        const objectUrl = URL.createObjectURL(file)
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement("canvas")
          const MAX_WIDTH = 1600
          const MAX_HEIGHT = 1600
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width)
              width = MAX_WIDTH
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height)
              height = MAX_HEIGHT
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext("2d")
          if (!ctx) {
            URL.revokeObjectURL(objectUrl)
            resolve(file)
            return
          }
          
          // Use high quality image smoothing to prevent barcode line blurring
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = "high"
          
          ctx.drawImage(img, 0, 0, width, height)
          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(objectUrl)
              if (blob) {
                resolve(blob)
              } else {
                resolve(file)
              }
            },
            "image/jpeg",
            0.95
          )
        }
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl)
          resolve(file)
        }
        img.src = objectUrl
      })

      const formData = new FormData()
      formData.append("image", resizedFile, "barcode.jpg")

      const res = await fetchWithAuth(`${API_URL}/products/scan-image/`, {
        method: "POST",
        body: formData
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Could not detect barcode in this image.")
      }
      if (data.barcode) {
        analyzeBarcode(data.barcode)
      } else {
        throw new Error("Could not decode barcode in this image.")
      }
    } catch (err: any) {
      setLoading(false)
      setError(err.message || "Could not detect barcode in this image. Try another image or use manual entry.")
    }
    if (e.target) e.target.value = ""
  }


  const getRiskConfig = (score: number) => {
    if (score >= 0.5) return { label: "High Risk", color: "text-red-500", bg: "bg-red-500/10 border-red-500/30", icon: <AlertTriangle className="w-6 h-6" />, ring: "ring-red-500/20" }
    if (score >= 0.25) return { label: "Moderate Risk", color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/30", icon: <AlertCircle className="w-6 h-6" />, ring: "ring-amber-500/20" }
    return { label: "Low Risk", color: "text-green-500", bg: "bg-green-500/10 border-green-500/30", icon: <CheckCircle className="w-6 h-6" />, ring: "ring-green-500/20" }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hidden div for file scan */}
      <div id="file-reader-dummy" style={{ display: "none" }} />
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

      {/* Loading overlay */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex flex-col items-center justify-center gap-4"
          >
            <div className="w-12 h-12 rounded-full border-4 border-border border-t-primary animate-spin" />
            <p className="text-muted-foreground font-medium">Analysing product...</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-2xl mx-auto p-4 md:p-8">
        {/* Top bar */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")} className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold font-syne">Scan Product</h1>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-500/10 border border-red-500/30 text-red-500 rounded-xl text-sm flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </motion.div>
        )}

        {/* Menu Mode */}
        {mode === "menu" && !result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setMode("camera")}
                className="p-8 rounded-2xl border border-teal-500/20 bg-gradient-to-br from-teal-500/10 to-transparent hover:from-teal-500/20 transition-all text-left group"
              >
                <Camera className="w-10 h-10 text-teal-400 mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="font-bold font-syne text-lg">Camera</h3>
                <p className="text-sm text-muted-foreground mt-1">Point your camera at a barcode to scan it live.</p>
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => fileInputRef.current?.click()}
                className="p-8 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-transparent hover:from-blue-500/20 transition-all text-left group"
              >
                <ImageIcon className="w-10 h-10 text-blue-400 mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="font-bold font-syne text-lg">From Gallery</h3>
                <p className="text-sm text-muted-foreground mt-1">Upload a photo of a product barcode from your device.</p>
              </motion.button>
            </div>

            {/* Manual Barcode Entry */}
            <div className="p-6 rounded-2xl border border-border bg-card">
              <div className="flex items-center gap-2 mb-4">
                <Hash className="w-5 h-5 text-muted-foreground" />
                <h3 className="font-semibold">Enter Barcode Manually</h3>
              </div>
              <div className="flex gap-3">
                <Input
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value)}
                  placeholder="e.g. 8901030838616"
                  className="bg-background flex-1"
                  onKeyDown={e => e.key === "Enter" && manualCode && analyzeBarcode(manualCode)}
                />
                <motion.div whileTap={{ scale: 0.95 }}>
                  <Button
                    onClick={() => manualCode && analyzeBarcode(manualCode)}
                    disabled={!manualCode}
                    className="rounded-full px-6"
                  >
                    Analyse
                  </Button>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Camera Mode */}
        {mode === "camera" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <p className="text-sm text-muted-foreground text-center">Point camera at a barcode — it scans automatically</p>
            <div id="qr-reader" className="rounded-2xl overflow-hidden border border-border" />
            <Button
              variant="outline"
              onClick={() => { html5QrCodeRef.current?.stop().catch(() => {}); setMode("menu") }}
              className="w-full rounded-full"
            >
              Cancel
            </Button>
          </motion.div>
        )}

        {/* Results Mode */}
        {mode === "results" && result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Product Header */}
            {(() => {
              const risk = getRiskConfig(result.analysis.final_risk_score)
              return (
                <div className={`p-6 rounded-2xl border ${risk.bg} ring-4 ${risk.ring}`}>
                  <h2 className="text-2xl font-bold font-syne mb-1">{result.product.product_name}</h2>
                  <p className="text-muted-foreground text-sm mb-4">Brand: {result.product.brand}</p>
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${risk.bg} ${risk.color} font-bold text-lg`}>
                    {risk.icon}
                    {risk.label} — Score: {result.analysis.final_risk_score.toFixed(2)}
                  </div>
                </div>
              )
            })()}

            {/* Nutrition */}
            <div className="p-6 rounded-2xl border border-border bg-card">
              <h3 className="font-bold font-syne mb-4 flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-400" /> Nutrition per 100g
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Energy", value: result.product.nutrition_per_100g.energy_kcal, unit: "kcal" },
                  { label: "Carbs", value: result.product.nutrition_per_100g.carbohydrates_g, unit: "g" },
                  { label: "Sugars", value: result.product.nutrition_per_100g.sugars_g, unit: "g" },
                  { label: "Fat", value: result.product.nutrition_per_100g.fat_g, unit: "g" },
                  { label: "Protein", value: result.product.nutrition_per_100g.proteins_g, unit: "g" },
                  { label: "Salt", value: result.product.nutrition_per_100g.salt_g, unit: "g" },
                ].map(n => (
                  <div key={n.label} className="bg-muted/30 rounded-xl p-3 text-center">
                    <div className="text-xl font-bold">{n.value != null ? `${n.value}${n.unit}` : "N/A"}</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide mt-1">{n.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Condition Risks */}
            {Object.keys(result.analysis.final_scores || {}).length > 0 && (
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
                        {Object.entries(result.analysis.final_scores).map(([cond, score]) => {
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
                  Detected Additives ({result.analysis.additives?.length ?? 0})
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
                      {result.analysis.additives?.length > 0 ? result.analysis.additives.map(a => (
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
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Scan Another */}
            <motion.div whileTap={{ scale: 0.95 }}>
              <Button
                onClick={() => { setResult(null); setMode("menu"); setManualCode(""); setError("") }}
                variant="outline"
                className="w-full rounded-full"
                size="lg"
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Scan Another Product
              </Button>
            </motion.div>
          </motion.div>
        )}
      </div>

      {/* Additive Details Glassmorphic Popup Modal */}
      <AnimatePresence>
        {selectedAdditive && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
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
