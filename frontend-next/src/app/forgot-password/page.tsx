"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { InteractiveBackground } from "@/components/interactive-background"
import { API_BASE_URL } from "@/lib/api"
import { Eye, EyeOff, ArrowLeft, AlertCircle, CheckCircle } from "lucide-react"

export default function ForgotPasswordPage() {
  const router = useRouter()

  // UI states: "email" -> "otp" -> "reset"
  const [uiState, setUiState] = useState<"email" | "otp" | "reset">("email")

  const [email, setEmail] = useState("")
  const [otpValues, setOtpValues] = useState<string[]>(["", "", "", "", "", ""])
  const [tempToken, setTempToken] = useState("") // stored in React memory only

  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  // OTP Countdown & Resend State
  const [countdown, setCountdown] = useState(600) // 10 minutes (600 seconds)
  const [isTimerActive, setIsTimerActive] = useState(false)
  const [resendCount, setResendCount] = useState(0)

  const [error, setError] = useState("")
  const [infoMessage, setInfoMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Focus first OTP box when transitioning to OTP state
  useEffect(() => {
    if (uiState === "otp") {
      document.getElementById("otp-0")?.focus()
    }
  }, [uiState])

  // Countdown Timer Effect
  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isTimerActive && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1)
      }, 1000)
    } else if (countdown === 0) {
      setIsTimerActive(false)
    }
    return () => clearInterval(timer)
  }, [isTimerActive, countdown])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const validatePassword = (pwd: string) => {
    if (pwd.length < 8) return "Password must be at least 8 characters long."
    if (!/\d/.test(pwd)) return "Password must contain at least one number."
    if (!/[a-zA-Z]/.test(pwd)) return "Password must contain at least one alphabet character."
    if (!/[!@#$&*]/.test(pwd)) return "Password must contain at least one special character (!@#$&*)."
    return null
  }

  const handleOtpChange = (val: string, index: number) => {
    const cleanVal = val.replace(/\D/g, "")
    if (!cleanVal && val !== "") return

    const newValues = [...otpValues]

    if (cleanVal.length > 1) {
      const pasted = cleanVal.slice(0, 6).split("")
      for (let i = 0; i < 6; i++) {
        newValues[i] = pasted[i] || ""
      }
      setOtpValues(newValues)
      const nextIndex = Math.min(pasted.length, 5)
      document.getElementById(`otp-${nextIndex}`)?.focus()
      return
    }

    newValues[index] = cleanVal
    setOtpValues(newValues)

    if (cleanVal && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus()
    }
  }

  const handleOtpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace") {
      if (!otpValues[index] && index > 0) {
        const newValues = [...otpValues]
        newValues[index - 1] = ""
        setOtpValues(newValues)
        document.getElementById(`otp-${index - 1}`)?.focus()
      } else {
        const newValues = [...otpValues]
        newValues[index] = ""
        setOtpValues(newValues)
      }
    }
  }

  // STEP 1: Send OTP
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setInfoMessage("")

    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.")
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/send-otp/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), purpose: "reset" })
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to send OTP.")
      } else {
        setUiState("otp")
        setCountdown(600) // 10 minutes
        setOtpValues(["", "", "", "", "", ""])
        setIsTimerActive(true)
        setInfoMessage("OTP sent successfully. Please check your email.")
      }
    } catch (err) {
      setError("Connection error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // Resend OTP
  const handleResendOTP = async () => {
    setError("")
    setInfoMessage("")
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/send-otp/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), purpose: "reset" })
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to resend OTP.")
      } else {
        setCountdown(600)
        setOtpValues(["", "", "", "", "", ""])
        setIsTimerActive(true)
        setResendCount((prev) => prev + 1)
        setInfoMessage("A new OTP code has been sent.")
        setTimeout(() => {
          document.getElementById("otp-0")?.focus()
        }, 50)
      }
    } catch (err) {
      setError("Connection error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // STEP 2: Verify OTP
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setInfoMessage("")

    const combinedOtp = otpValues.join("")
    if (combinedOtp.length !== 6) {
      setError("Verification code must be exactly 6 digits.")
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/verify-otp/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: combinedOtp,
          purpose: "reset"
        })
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Wrong OTP or expired OTP.")
      } else if (data.verified) {
        setTempToken(data.token)
        setUiState("reset")
      }
    } catch (err) {
      setError("Connection error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // STEP 3: Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    const pwdError = validatePassword(newPassword)
    if (pwdError) {
      setError(pwdError)
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/reset-password/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: tempToken,
          new_password: newPassword
        })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Reset token expired or password update failed. Please try again.")
      } else {
        setInfoMessage("Password reset successful! Redirecting to login...")
        setTimeout(() => {
          router.push("/auth/login")
        }, 2000)
      }
    } catch (err) {
      setError("An unexpected error occurred.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-[100dvh] w-full flex items-center justify-center text-foreground p-4 sm:p-6 md:p-8">
      <InteractiveBackground />

      <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl border border-border bg-card shadow-2xl glass-panel relative overflow-hidden flex flex-col justify-center my-auto">

        <h2 className="text-3xl font-extrabold font-syne mb-1 text-center text-primary">Reset Password</h2>
        <p className="text-xs sm:text-sm text-muted-foreground text-center mb-6 font-inter font-normal">
          Restore access to your BioDose account.
        </p>

        {error && (
          <div className="mb-4 p-3.5 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl text-xs sm:text-sm flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {infoMessage && (
          <div className="mb-4 p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-2xl text-xs sm:text-sm flex items-start gap-2.5">
            <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{infoMessage}</span>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* STEP 1: ENTER EMAIL */}
          {uiState === "email" && (
            <motion.form
              key="email"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              onSubmit={handleSendOTP}
              className="space-y-4 font-inter"
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-background rounded-2xl h-11"
                />
              </div>

              <motion.div whileTap={{ scale: 0.97 }} className="pt-2">
                <Button type="submit" className="w-full rounded-full h-11 text-sm font-bold" disabled={loading}>
                  {loading ? "Sending OTP..." : "Send OTP"}
                </Button>
              </motion.div>
            </motion.form>
          )}

          {/* STEP 2: ENTER OTP */}
          {uiState === "otp" && (
            <motion.form
              key="otp"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              onSubmit={handleVerifyOTP}
              className="space-y-4 font-inter"
            >
              <div className="flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground mb-2 cursor-pointer hover:text-foreground transition-colors" onClick={() => setUiState("email")}>
                <ArrowLeft size={13} />
                <span>Change email ({email})</span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-xs sm:text-sm font-semibold">Enter Verification Code</Label>
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 ${countdown < 30 ? "text-red-500 animate-pulse bg-red-500/10 border-red-500/20" : "text-primary"}`}>
                    {formatTime(countdown)}
                  </span>
                </div>

                <div className="flex justify-center gap-2 sm:gap-3 my-5 w-full">
                  {otpValues.map((digit, idx) => (
                    <input
                      key={idx}
                      id={`otp-${idx}`}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(e.target.value, idx)}
                      onKeyDown={(e) => handleOtpKeyDown(e, idx)}
                      disabled={countdown === 0}
                      className="w-full max-w-[42px] sm:max-w-[48px] aspect-square text-center text-lg sm:text-xl font-extrabold bg-background border border-border rounded-xl focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all text-foreground shadow-sm"
                    />
                  ))}
                </div>
              </div>

              {countdown === 0 && (
                <p className="text-xs text-red-500 text-center font-medium">
                  The verification code has expired. Please request a new one.
                </p>
              )}

              {resendCount >= 3 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-2xl text-[11px] leading-relaxed">
                  <strong>Not receiving the code?</strong> There might be a typo in your email address. Feel free to click "Change email" above to correct it.
                </div>
              )}

              <div className="flex gap-3 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResendOTP}
                  disabled={loading || isTimerActive}
                  className="flex-1 rounded-full text-xs font-bold h-11"
                >
                  Resend Code
                </Button>
                <Button
                  type="submit"
                  disabled={loading || countdown === 0 || otpValues.join("").length !== 6}
                  className="flex-1 rounded-full text-xs font-bold h-11"
                >
                  {loading ? "Verifying..." : "Verify OTP"}
                </Button>
              </div>
            </motion.form>
          )}

          {/* STEP 3: RESET PASSWORD DETAILS */}
          {uiState === "reset" && (
            <motion.form
              key="reset"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              onSubmit={handleResetPassword}
              className="space-y-4 font-inter"
            >
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="bg-background rounded-2xl h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Min 8 chars, 1 number, 1 letter, 1 special character (!@#$&*)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm_password">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    id="confirm_password"
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-background rounded-2xl h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <motion.div whileTap={{ scale: 0.97 }} className="pt-2">
                <Button type="submit" className="w-full rounded-full h-11 font-bold text-sm" disabled={loading}>
                  {loading ? "Resetting Password..." : "Reset Password"}
                </Button>
              </motion.div>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="mt-6 text-center text-sm text-muted-foreground font-inter">
          Remembered your password?{" "}
          <Link href="/auth/login" className="text-primary hover:underline font-medium">
            Log In
          </Link>
        </div>
      </div>
    </div>
  )
}
