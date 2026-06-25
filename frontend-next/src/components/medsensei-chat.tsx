"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MessageSquare, X, Send, Lock, Check, Loader2, AlertCircle, Sparkles } from "lucide-react"
import { API_BASE_URL as API_URL } from "@/lib/api"

interface Message {
  role: "user" | "assistant"
  content: string
}

interface MedSenseiChatProps {
  barcode?: string
  productName?: string
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

export function MedSenseiChat({ barcode, productName }: MedSenseiChatProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [profileName, setProfileName] = useState<string>("")
  
  // Password Suggest Condition State
  const [pendingCondition, setPendingCondition] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirmSuccess, setConfirmSuccess] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

  // Open chatbot when barcode is passed or changes
  useEffect(() => {
    if (barcode) {
      setIsOpen(true)
      setMessages([
        {
          role: "assistant",
          content: `Hello! I am MedSensei. I see you are analyzing **${productName || "this product"}** (Barcode: ${barcode}). I can help you evaluate if it is safe given your medical profile or explain its ingredients and additives. What would you like to know?`
        }
      ])
    }
  }, [barcode, productName])

  // Reset or load greeting when chatbot opens
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      if (barcode) {
        setMessages([
          {
            role: "assistant",
            content: `Hello! I am MedSensei. I see you are analyzing **${productName || "this product"}** (Barcode: ${barcode}). I can help you evaluate if it is safe given your medical profile or explain its ingredients and additives. What would you like to know?`
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
    }
  }, [isOpen, barcode, productName, profileName])

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
          }
        } catch (e) {
          console.error(e)
        }
      }
    }
    return res
  }

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

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim()
    if (!text) return

    if (!textToSend) {
      setInputValue("")
    }

    // Add user message
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
          // Parse potential SUGGEST_CONDITION tag in message
          // Format e.g.: "Dairy Allergy suggested. [SUGGEST_CONDITION: MDC19]"
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
      setErrorMsg("Network error. Please try again.")
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
        const data = await res.json()
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

  // Parse options tag e.g. [OPTIONS: Yes, No, Maybe]
  const parseOptions = (content: string) => {
    const optionsMatch = content.match(/\[OPTIONS:\s*([^\]]+)\]/)
    if (optionsMatch) {
      const optionsList = optionsMatch[1].split(",").map(o => o.trim())
      const cleanContent = content.replace(/\[OPTIONS:\s*[^\]]+\]/, "").trim()
      return { cleanContent, options: optionsList }
    }
    return { cleanContent: content, options: [] }
  }

  // Parse suggest condition tag to clean it up for rendering
  const cleanSuggestTag = (content: string) => {
    return content.replace(/\[SUGGEST_CONDITION:\s*[^\]]+\]/, "").trim()
  }

  return (
    <>
      {/* Floating Chat Button */}
      <motion.button
        whileHover={{ scale: 1.1, rotate: 5 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-40 flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 text-black shadow-lg shadow-emerald-500/20 cursor-pointer border border-emerald-400/30"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
      </motion.button>

      {/* Chat Window Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed bottom-24 right-6 z-40 w-[90vw] sm:w-[420px] h-[550px] rounded-3xl border border-emerald-500/20 bg-neutral-950/80 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden text-neutral-200"
          >
            {/* Header */}
            <div className="p-4 border-b border-emerald-500/10 bg-neutral-950/90 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/35 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm font-syne text-emerald-400">MedSensei</h3>
                  <p className="text-[10px] text-neutral-400 flex items-center gap-1">
                    {barcode ? `Product Focus: ${productName || barcode}` : "Medical & Food Safety AI"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg hover:bg-neutral-800 transition-colors text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Message Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, idx) => {
                const isAssistant = msg.role === "assistant"
                const cleanedText = cleanSuggestTag(msg.content)
                const { cleanContent, options } = parseOptions(cleanedText)

                return (
                  <div key={idx} className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
                    <div className="max-w-[85%] space-y-2">
                      <div
                        className={`p-3 rounded-2xl text-xs leading-relaxed ${
                          isAssistant
                            ? "bg-neutral-900/60 border border-neutral-800/80 text-neutral-200 rounded-tl-sm"
                            : "bg-emerald-500 text-neutral-950 font-medium rounded-tr-sm"
                        }`}
                        dangerouslySetInnerHTML={{
                          __html: cleanContent
                            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                            .replace(/\n/g, "<br />")
                        }}
                      />

                      {/* Quick options buttons */}
                      {isAssistant && options.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {options.map((opt, oIdx) => (
                            <button
                              key={oIdx}
                              onClick={() => handleSendMessage(opt)}
                              className="text-[11px] px-3 py-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/5 hover:bg-emerald-500 hover:text-black transition-all font-medium text-emerald-400 cursor-pointer"
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

              {/* Bot loading state */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-neutral-900/60 border border-neutral-800/80 text-neutral-400 p-3 rounded-2xl rounded-tl-sm text-xs flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    MedSensei is thinking...
                  </div>
                </div>
              )}

              {/* General error message */}
              {errorMsg && (
                <div className="flex justify-center">
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-2.5 rounded-xl text-xs flex items-center gap-1.5 max-w-[90%]">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Password Confirm Overlay */}
            <AnimatePresence>
              {pendingCondition && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute inset-0 bg-neutral-950/95 backdrop-blur-md p-6 flex flex-col justify-center items-center text-center z-10"
                >
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                    <Lock className="w-5 h-5 text-emerald-400" />
                  </div>
                  <h4 className="font-bold text-sm font-syne text-emerald-400 mb-1">Confirm Profile Update</h4>
                  <p className="text-xs text-neutral-400 max-w-[280px] mb-4">
                    MedSensei suggests adding <strong>{CONDITION_LABELS[pendingCondition] || pendingCondition}</strong> to your health profile. Enter your password to authorize.
                  </p>

                  <form onSubmit={handleConfirmCondition} className="w-full max-w-[280px] space-y-3">
                    <input
                      type="password"
                      placeholder="Enter account password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isConfirming}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-emerald-500 transition-colors"
                    />

                    {confirmError && (
                      <p className="text-[11px] text-red-400 flex items-center gap-1 justify-center">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {confirmError}
                      </p>
                    )}

                    {confirmSuccess && (
                      <p className="text-[11px] text-emerald-400 flex items-center gap-1 justify-center">
                        <Check className="w-3.5 h-3.5" />
                        {confirmSuccess}
                      </p>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPendingCondition(null)}
                        disabled={isConfirming}
                        className="flex-1 border border-neutral-800 hover:bg-neutral-900 text-neutral-400 rounded-xl py-2 text-xs transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isConfirming || !password}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-neutral-950 font-bold rounded-xl py-2 text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        {isConfirming ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          "Confirm"
                        )}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input Bar */}
            <div className="p-3 border-t border-emerald-500/10 bg-neutral-950/90 flex gap-2">
              <input
                type="text"
                placeholder="Ask about ingredients, warnings..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                disabled={isLoading}
                className="flex-1 bg-neutral-900 border border-neutral-800/80 rounded-xl px-3 py-2 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={isLoading || !inputValue.trim()}
                className="p-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-800 text-black disabled:text-neutral-500 transition-all cursor-pointer flex items-center justify-center"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
