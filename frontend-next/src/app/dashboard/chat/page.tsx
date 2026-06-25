"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, Sparkles, Send, Lock, Check, Loader2, AlertCircle } from "lucide-react"
import { API_BASE_URL as API_URL } from "@/lib/api"

interface Message {
  role: "user" | "assistant"
  content: string
}

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

function NetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationFrameId: number
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }

    window.addEventListener("resize", handleResize)

    // Generate particles
    const particleCount = 45
    const particles: Array<{
      x: number
      y: number
      vx: number
      vy: number
      radius: number
    }> = []

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 3 + 2
      })
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height)
      
      // Draw and update particles
      particles.forEach((p, idx) => {
        p.x += p.vx
        p.y += p.vy

        // Bounce on boundaries
        if (p.x < 0 || p.x > width) p.vx *= -1
        if (p.y < 0 || p.y > height) p.vy *= -1

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = "rgba(16, 185, 129, 0.2)"
        ctx.fill()

        // Connect to nearby particles
        for (let j = idx + 1; j < particles.length; j++) {
          const p2 = particles[j]
          const dx = p.x - p2.x
          const dy = p.y - p2.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < 140) {
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.strokeStyle = `rgba(16, 185, 129, ${0.12 * (1 - dist / 140)})`
            ctx.lineWidth = 0.8
            ctx.stroke()
          }
        }
      })

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener("resize", handleResize)
      cancelAnimationFrame(animationFrameId)
    }
  }, [mounted])

  if (!mounted) return null

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 -z-10 w-full h-full pointer-events-none"
    />
  )
}

function ChatContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const barcode = searchParams.get("barcode") || ""
  
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  const [productName, setProductName] = useState<string>("")
  const [productLoading, setProductLoading] = useState(false)
  const [profileName, setProfileName] = useState<string>("")

  // Fetch user profile on load to greet them by name
  useEffect(() => {
    fetchWithAuth(`${API_URL}/api/v1/auth/profile/`)
      .then(res => res.json())
      .then(data => {
        if (data.full_name) {
          setProfileName(data.full_name)
        } else if (data.username) {
          setProfileName(data.username)
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cinematic State: "intro" (centered logo) -> "chat" (content top & chat box fades in)
  const [stage, setStage] = useState<"intro" | "chat">("intro")
  const [isIntroTyping, setIsIntroTyping] = useState(false)
  const initialMessageSent = useRef(false)

  // Password Suggest Condition State
  const [pendingCondition, setPendingCondition] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirmSuccess, setConfirmSuccess] = useState<string | null>(null)

  const [placeholder, setPlaceholder] = useState("Ask MedSensei...")
  useEffect(() => {
    const updatePlaceholder = () => {
      if (typeof window !== "undefined") {
        if (window.innerWidth < 640) {
          setPlaceholder("Ask MedSensei...")
        } else {
          setPlaceholder("Ask about medical safety, warnings, ingredients...")
        }
      }
    }
    updatePlaceholder()
    window.addEventListener("resize", updatePlaceholder)
    return () => window.removeEventListener("resize", updatePlaceholder)
  }, [])

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading, isIntroTyping])

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    let token = localStorage.getItem("access_token") ?? ""
    const headers = {
      ...(options.headers || {}),
      "Content-Type": "application/json",
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
              "Content-Type": "application/json",
              Authorization: `Bearer ${data.access}`
            }
            res = await fetch(url, { ...options, headers: retryHeaders })
          } else {
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
  }

  // Clear backend chat history whenever a barcode context is loaded.
  // This prevents stale history from a previously viewed product (e.g. from Scan History)
  // leaking into a fresh chat session about a completely different product.
  useEffect(() => {
    fetchWithAuth(`${API_URL}/api/v1/analysis/chatbot/chat/`, {
      method: "POST",
      body: JSON.stringify({
        clear_history: true,
        barcode: barcode || "",
        message: "" // not used when clear_history is true
      })
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcode])

  // Fetch product name if barcode is active
  useEffect(() => {
    if (barcode) {
      setProductLoading(true)
      fetchWithAuth(`${API_URL}/api/v1/products/analyze/`, {
        method: "POST",
        body: JSON.stringify({ barcode })
      })
        .then(res => res.json())
        .then(data => {
          if (data.product) {
            setProductName(data.product.product_name || "Analyzed Product")
          }
        })
        .catch(() => {})
        .finally(() => setProductLoading(false))
    }
  }, [barcode])

  // Intro Cinematic Timeline Control
  useEffect(() => {
    const introTimer = setTimeout(() => {
      setStage("chat")
    }, 2800) // Slower cinematic timing: 2.8s center logo show

    return () => clearTimeout(introTimer)
  }, [])

  // Start typing indicator, then set initial message
  useEffect(() => {
    if (stage === "chat" && !initialMessageSent.current) {
      setIsIntroTyping(true)
      
      const timer = setTimeout(() => {
        setIsIntroTyping(false)
        initialMessageSent.current = true
        
        const pName = productName || "the selected product"
        if (barcode) {
          setMessages([
            {
              role: "assistant",
              content: `Hello! I am MedSensei AI. I am initialized in Product Context mode for **${pName}** (Barcode: ${barcode}). I will answer questions specifically regarding this product, its additives, and any health safety warnings linked to your profile. What would you like to know?`
            }
          ])
        } else {
          setMessages([
            {
              role: "assistant",
              content: `Hello ${profileName || "there"}! How may I help you today?`
            }
          ])
        }
      }, 2500) // Realistic typing simulation duration: 2.5 seconds

      return () => clearTimeout(timer)
    }
  }, [stage, barcode, productName, profileName])

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim()
    if (!text) return

    if (!textToSend) {
      setInputValue("")
    }

    const newMessages: Message[] = [...messages, { role: "user", content: text }]
    setMessages(newMessages)
    setIsLoading(true)
    setErrorMsg(null)

    try {
      const res = await fetchWithAuth(`${API_URL}/api/v1/analysis/chatbot/chat/`, {
        method: "POST",
        body: JSON.stringify({
          message: text,
          barcode: barcode || ""
        })
      })

      if (res.ok) {
        const data = await res.json()
        if (data.message) {
          const suggestMatch = data.message.match(/\[SUGGEST_CONDITION:\s*(MDC\d+)\]/)
          if (suggestMatch) {
            setPendingCondition(suggestMatch[1])
          }
          setMessages([...newMessages, { role: "assistant", content: data.message }])
        }
      } else {
        const errorData = await res.json()
        setErrorMsg(errorData.error || "Failed to get reply from MedSensei.")
      }
    } catch (e) {
      setErrorMsg("Network error. Please check your connection and try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirmCondition = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || !pendingCondition) return

    setIsConfirming(true)
    setConfirmError(null)
    setConfirmSuccess(null)

    try {
      const res = await fetchWithAuth(`${API_URL}/api/v1/analysis/chatbot/confirm-condition/`, {
        method: "POST",
        body: JSON.stringify({
          password,
          condition_id: pendingCondition
        })
      })

      if (res.ok) {
        const condName = CONDITION_LABELS[pendingCondition] || pendingCondition
        setConfirmSuccess(`Successfully added ${condName} to your profile!`)
        setPassword("")
        setTimeout(() => {
          setPendingCondition(null)
          setConfirmSuccess(null)
        }, 2000)
      } else {
        const errorData = await res.json()
        setConfirmError(errorData.error || "Password verification failed.")
      }
    } catch (e) {
      setConfirmError("Network error. Failed to update profile.")
    } finally {
      setIsConfirming(false)
    }
  }

  const parseOptions = (content: string) => {
    const optionsMatch = content.match(/\[OPTIONS:\s*([^\]]+)\]/)
    if (optionsMatch) {
      const optionsList = optionsMatch[1].split(",").map(o => o.trim())
      const cleanContent = content.replace(/\[OPTIONS:\s*[^\]]+\]/, "").trim()
      return { cleanContent, options: optionsList }
    }
    return { cleanContent: content, options: [] }
  }

  const cleanSuggestTag = (content: string) => {
    return content.replace(/\[SUGGEST_CONDITION:\s*[^\]]+\]/, "").trim()
  }

  // Animation variants for smooth slow entrance
  const headerContainerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.25,
        delayChildren: 0.2
      }
    }
  }

  const headerItemVariants = {
    hidden: { y: -40, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring" as const, stiffness: 60, damping: 20 }
    }
  }

  const taglineVariants = {
    hidden: { y: 30, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring" as const, stiffness: 50, damping: 20, delay: 0.6 }
    }
  }

  return (
    <div className="relative h-[100dvh] text-foreground overflow-hidden flex flex-col font-sans">
      
      {/* Background Matrix/Glowing Grid Animation */}
      <div className="absolute inset-0 bg-background transition-colors duration-300 -z-20" />
      <NetworkBackground />
      <div 
        className="absolute inset-0 -z-10 opacity-30 bg-[linear-gradient(to_right,rgba(16,185,129,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(16,185,129,0.08)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] animate-[pulse_8s_infinite_ease-in-out]" 
      />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] -z-10 animate-[pulse_6s_infinite_ease-in-out]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-[120px] -z-10 animate-[pulse_9s_infinite_ease-in-out]" />

      <div className={`max-w-4xl mx-auto w-full flex-1 flex flex-col p-3 sm:p-4 md:p-8 z-10 min-h-0 transition-all duration-1000 ease-in-out ${
        stage === "intro" ? "justify-center" : "justify-start h-0"
      }`}>
        
        {/* Navigation Bar - invisible during intro */}
        <AnimatePresence>
          {stage === "chat" && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="flex items-center justify-between mb-4 sm:mb-6"
            >
              <button
                onClick={() => router.push("/dashboard")}
                className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full border border-border bg-card/90 text-xs sm:text-sm font-semibold hover:bg-accent text-foreground transition-colors shadow-lg cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Back to Dashboard
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Brand Header with smooth layout morphing */}
        <motion.div 
          layout
          variants={headerContainerVariants}
          initial="hidden"
          animate="visible"
          transition={{ type: "spring", stiffness: 40, damping: 15 }}
          className={`text-center space-y-1 sm:space-y-2 flex flex-col items-center justify-center ${
            stage === "intro" ? "py-24" : "mb-3 sm:mb-6"
          }`}
        >
          <motion.div 
            layout
            variants={headerItemVariants}
            transition={{ type: "spring", stiffness: 40, damping: 15 }}
            className={`inline-flex items-center justify-center rounded-3xl bg-emerald-500/10 border border-emerald-500/20 shadow-inner animate-[pulse_4s_infinite] ${
              stage === "intro" ? "w-20 h-20 sm:w-24 h-24 mb-4 sm:mb-6" : "w-10 h-10 sm:w-16 h-16 mb-1 sm:mb-2"
            }`}
          >
            <Sparkles className={`text-emerald-500 transition-all duration-700 ${stage === "intro" ? "w-10 h-10 sm:w-12 h-12" : "w-5 h-5 sm:w-8 h-8"}`} />
          </motion.div>
          
          <motion.h1 
            layout
            variants={headerItemVariants}
            transition={{ type: "spring", stiffness: 40, damping: 15 }}
            className={`font-extrabold tracking-tight font-syne text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 dark:from-emerald-400 dark:via-teal-300 dark:to-emerald-500 transition-all duration-700 ${
              stage === "intro" ? "text-3xl sm:text-5xl md:text-7xl" : "text-xl sm:text-3xl md:text-4xl"
            }`}
          >
            MedSensei AI
          </motion.h1>
          
          <motion.p 
            layout
            variants={taglineVariants}
            transition={{ type: "spring", stiffness: 40, damping: 15 }}
            className={`text-emerald-600 dark:text-emerald-500/70 uppercase tracking-widest font-mono font-bold transition-all duration-700 ${
              stage === "intro" ? "text-[10px] sm:text-xs md:text-sm mt-2 sm:mt-3 px-4" : "text-[9px] sm:text-xs px-2"
            }`}
          >
            Your Specialized Medical & Food Safety Guardian™
          </motion.p>
        </motion.div>

        {/* Main Chat Area - fades in and slides up once intro layout morph completes */}
        <AnimatePresence>
          {stage === "chat" && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
              className="flex-1 flex flex-col rounded-3xl border border-border bg-card/90 backdrop-blur-md shadow-2xl overflow-hidden min-h-0"
            >
              {/* Active Product Bar if barcode exists */}
              {barcode && (
                <div className="px-4 py-2 sm:px-6 sm:py-3 border-b border-border bg-emerald-500/5 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Context Product: <strong className="text-emerald-600 dark:text-emerald-400 font-syne">{productLoading ? "Loading..." : (productName || barcode)}</strong>
                  </span>
                  <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    {barcode}
                  </span>
                </div>
              )}

              {/* Messages Log */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
                {messages.map((msg, idx) => {
                  const isAssistant = msg.role === "assistant"
                  const cleanedText = cleanSuggestTag(msg.content)
                  const { cleanContent, options } = parseOptions(cleanedText)

                  return (
                    <div key={idx} className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
                      <div className="max-w-[85%] sm:max-w-[80%] space-y-2">
                        {/* Chat bubbles with 10% transparency (90% opaque) */}
                        <div
                          className={`p-3.5 sm:p-4 rounded-3xl text-xs sm:text-sm leading-relaxed border shadow-sm font-sans ${
                            isAssistant
                              ? "bg-muted/90 border-border text-foreground rounded-tl-sm"
                              : "bg-emerald-500/90 dark:bg-emerald-500/90 border-emerald-400 text-neutral-950 font-bold rounded-tr-sm"
                          }`}
                          dangerouslySetInnerHTML={{
                            __html: cleanContent
                              .replace(/\*\*(.*?)\*\*/g, "<strong class='font-extrabold'>$1</strong>")
                              .replace(/\n/g, "<br />")
                          }}
                        />

                        {/* Quick Reply Options */}
                        {isAssistant && options.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 sm:gap-2 pt-1 sm:pt-2">
                            {options.map((opt, oIdx) => (
                              <button
                                key={oIdx}
                                onClick={() => handleSendMessage(opt)}
                                className="text-[10px] sm:text-xs px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500 hover:text-black font-semibold text-emerald-600 dark:text-emerald-400 transition-all cursor-pointer shadow-md"
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Bouncing three-dots typing indicator for MedSensei welcome message */}
                {isIntroTyping && (
                  <div className="flex justify-start">
                    <div className="bg-muted/90 border border-border text-muted-foreground p-4 rounded-3xl rounded-tl-sm text-sm flex items-center gap-3">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">MedSensei AI</span>
                      <div className="flex gap-1.5 items-center py-1">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Waiting for response (general queries) */}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted/90 border border-border text-muted-foreground p-3.5 sm:p-4 rounded-3xl rounded-tl-sm text-xs sm:text-sm flex items-center gap-2.5">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                      MedSensei AI is analyzing...
                    </div>
                  </div>
                )}

                {/* Error notifications */}
                {errorMsg && (
                  <div className="flex justify-center">
                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-2xl text-xs flex items-center gap-2 max-w-[85%]">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Secure Confirm Profile Conditions Modal */}
              <AnimatePresence>
                {pendingCondition && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-background/95 backdrop-blur-md p-6 flex flex-col justify-center items-center text-center z-20"
                  >
                    <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                      <Lock className="w-6 h-6 text-emerald-500" />
                    </div>
                    <h3 className="font-bold text-lg font-syne text-emerald-600 dark:text-emerald-400 mb-1">Confirm Profile Modification</h3>
                    <p className="text-sm text-muted-foreground max-w-[320px] mb-6 leading-relaxed">
                      MedSensei suggests locking <strong>{CONDITION_LABELS[pendingCondition] || pendingCondition}</strong> into your profile. Provide password to authorize.
                    </p>

                    <form onSubmit={handleConfirmCondition} className="w-full max-w-[300px] space-y-4">
                      <input
                        type="password"
                        placeholder="Enter account password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isConfirming}
                        className="w-full bg-muted border border-border rounded-2xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors shadow-inner"
                      />

                      {confirmError && (
                        <p className="text-xs text-red-500 flex items-center gap-1 justify-center">
                          <AlertCircle className="w-4 h-4" />
                          {confirmError}
                        </p>
                      )}

                      {confirmSuccess && (
                        <p className="text-xs text-emerald-500 flex items-center gap-1 justify-center">
                          <Check className="w-4 h-4" />
                          {confirmSuccess}
                        </p>
                      )}

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setPendingCondition(null)}
                          disabled={isConfirming}
                          className="flex-1 border border-border hover:bg-muted text-muted-foreground rounded-2xl py-3 text-xs font-bold transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isConfirming || !password}
                          className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-neutral-950 font-bold rounded-2xl py-3 text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        >
                          {isConfirming ? (
                            <Loader2 className="w-4.5 h-4.5 animate-spin" />
                          ) : (
                            "Lock Profile"
                          )}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Typing Bar */}
              <div className="p-3 sm:p-4 border-t border-border bg-card/90 flex gap-2 sm:gap-3">
                <input
                  type="text"
                  placeholder={placeholder}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  disabled={isLoading}
                  className="flex-1 bg-muted border border-border rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3.5 text-xs sm:text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors shadow-inner"
                />
                <button
                  onClick={() => handleSendMessage()}
                  disabled={isLoading || !inputValue.trim()}
                  className="p-2.5 sm:p-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-muted text-black disabled:text-muted-foreground transition-all cursor-pointer flex items-center justify-center"
                >
                  <Send className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
                </button>
              </div>

            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <div className="animate-pulse text-emerald-400 flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading MedSensei AI Chat...
        </div>
      </div>
    }>
      <ChatContent />
    </Suspense>
  )
}
