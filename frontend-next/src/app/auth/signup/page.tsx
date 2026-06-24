"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { InteractiveBackground } from "@/components/interactive-background"
import { API_BASE_URL } from "@/lib/api"
import { Eye, EyeOff, ArrowLeft, AlertCircle, CheckCircle } from "lucide-react"

export default function SignupPage() {
  const router = useRouter()
  
  // Wizard state: 1 = Email Input, 2 = OTP verification, 3 = Final Form
  const [step, setStep] = useState<1 | 2 | 3>(1)
  
  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState("")
  
  const [formData, setFormData] = useState({
    full_name: "",
    username: "",
    password: "",
    confirm_password: "",
  })
  
  // OTP Countdown & Resend State
  const [countdown, setCountdown] = useState(150) // 2.5 minutes
  const [isTimerActive, setIsTimerActive] = useState(false)
  const [resendCount, setResendCount] = useState(0)
  
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [usernameChecking, setUsernameChecking] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [error, setError] = useState("")
  const [infoMessage, setInfoMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Live Username Check (only triggers in step 3)
  useEffect(() => {
    if (step !== 3 || formData.username.length < 3) {
      setUsernameAvailable(null)
      return
    }
    setUsernameChecking(true)
    const checkUsername = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/auth/check-username/?username=${formData.username}`)
        const data = await res.json()
        setUsernameAvailable(data.available)
      } catch (err) {
        console.error("Failed to check username")
      } finally {
        setUsernameChecking(false)
      }
    }
    
    const timeoutId = setTimeout(() => checkUsername(), 500)
    return () => clearTimeout(timeoutId)
  }, [formData.username, step])

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
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/signup-otp/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      })
      const data = await res.json()
      
      if (!res.ok) {
        setError(data.error || "Failed to send verification code.")
      } else {
        setStep(2)
        setCountdown(150) // 2.5 minutes
        setIsTimerActive(true)
        setInfoMessage(`Verification code sent to ${email}`)
      }
    } catch (err) {
      setError("An unexpected connection error occurred.")
    } finally {
      setLoading(false)
    }
  }

  // STEP 1.5: Resend OTP
  const handleResendOTP = async () => {
    setError("")
    setInfoMessage("")
    setLoading(true)
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/signup-otp/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      })
      const data = await res.json()
      
      if (!res.ok) {
        setError(data.error || "Failed to send verification code.")
      } else {
        setCountdown(150)
        setIsTimerActive(true)
        setResendCount((prev) => prev + 1)
        setInfoMessage("A new verification code has been sent.")
      }
    } catch (err) {
      setError("An unexpected connection error occurred.")
    } finally {
      setLoading(false)
    }
  }

  // STEP 2: Verify OTP
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setInfoMessage("")
    
    if (otp.length !== 6) {
      setError("Verification code must be exactly 6 digits.")
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/verify-signup-otp/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp: otp.trim() })
      })
      const data = await res.json()
      
      if (!res.ok) {
        setError(data.error || "Verification failed.")
      } else {
        setStep(3)
      }
    } catch (err) {
      setError("An unexpected connection error occurred.")
    } finally {
      setLoading(false)
    }
  }

  // STEP 3: Complete Sign Up
  const handleFinalSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!termsAccepted) {
      setError("You must agree to the Terms and Conditions.")
      return
    }

    if (formData.password !== formData.confirm_password) {
      setError("Passwords do not match.")
      return
    }

    const pwdError = validatePassword(formData.password)
    if (pwdError) {
      setError(pwdError)
      return
    }

    if (usernameAvailable === false) {
      setError("Username already exists. Please choose another one.")
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/register/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: otp.trim(),
          full_name: formData.full_name.trim(),
          username: formData.username.trim(),
          password: formData.password
        })
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        setError(data.error || "Failed to register. Please try again.")
      } else {
        // Direct Login Success -> Store tokens
        localStorage.setItem("access_token", data.access)
        localStorage.setItem("refresh_token", data.refresh)
        localStorage.setItem("session_start_time", Date.now().toString())
        
        // Push user directly to profile setup or dashboard
        router.push("/profile-setup")
      }
    } catch (err) {
      setError("An unexpected error occurred.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center text-foreground p-4 py-8 sm:py-12">
      <InteractiveBackground />
      <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl border border-border bg-card shadow-xl glass-panel mx-auto my-auto relative overflow-hidden">
        
        <h2 className="text-3xl font-bold font-syne mb-1 text-center text-primary">Create Account</h2>
        <p className="text-sm text-muted-foreground text-center mb-6 font-inter">
          Join BioDose and take control of your food safety.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 text-red-500 rounded-md text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {infoMessage && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/50 text-emerald-500 rounded-md text-sm flex items-start gap-2">
            <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{infoMessage}</span>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* STEP 1: ENTER EMAIL */}
          {step === 1 && (
            <motion.form
              key="step1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
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
                  className="bg-background"
                />
              </div>

              <motion.div whileTap={{ scale: 0.98 }} className="pt-4">
                <Button type="submit" className="w-full rounded-full" disabled={loading}>
                  {loading ? "Sending Code..." : "Verify Email"}
                </Button>
              </motion.div>
            </motion.form>
          )}

          {/* STEP 2: ENTER OTP */}
          {step === 2 && (
            <motion.form
              key="step2"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              onSubmit={handleVerifyOTP}
              className="space-y-4 font-inter"
            >
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 cursor-pointer hover:text-foreground" onClick={() => setStep(1)}>
                <ArrowLeft size={14} />
                <span>Change email ({email})</span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="otp">Enter Verification Code</Label>
                  <span className={`text-xs font-mono font-bold ${countdown < 30 ? "text-red-500 animate-pulse" : "text-primary"}`}>
                    {formatTime(countdown)}
                  </span>
                </div>
                <Input 
                  id="otp" 
                  type="text" 
                  maxLength={6}
                  required
                  placeholder="6-digit code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  disabled={countdown === 0}
                  className="bg-background tracking-widest text-center text-lg font-bold"
                />
              </div>

              {countdown === 0 && (
                <p className="text-xs text-red-500 text-center">
                  The verification code has expired. Please request a new one.
                </p>
              )}

              {resendCount >= 3 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg text-xs leading-relaxed">
                  <strong>Not receiving the code?</strong> There might be a typo in your email address. Feel free to click "Change email" above to correct it.
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleResendOTP} 
                  disabled={loading || isTimerActive}
                  className="flex-1 rounded-full text-xs"
                >
                  Resend Code
                </Button>
                <Button 
                  type="submit" 
                  disabled={loading || countdown === 0 || otp.length !== 6}
                  className="flex-1 rounded-full text-xs"
                >
                  {loading ? "Verifying..." : "Verify Code"}
                </Button>
              </div>
            </motion.form>
          )}

          {/* STEP 3: ACCOUNT DETAILS */}
          {step === 3 && (
            <motion.form
              key="step3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              onSubmit={handleFinalSignup}
              className="space-y-4 font-inter"
            >
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input 
                  id="full_name" 
                  required
                  placeholder="John Doe"
                  value={formData.full_name}
                  onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                  className="bg-background"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input 
                  id="username" 
                  required
                  placeholder="johndoe"
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value.toLowerCase().replace(/\s/g, "")})}
                  className={`bg-background ${usernameAvailable === false ? 'border-red-500 focus-visible:ring-red-500' : ''} ${usernameAvailable === true ? 'border-green-500 focus-visible:ring-green-500' : ''}`}
                />
                {usernameChecking && <p className="text-[10px] text-muted-foreground">Checking availability...</p>}
                {usernameAvailable === false && <p className="text-[10px] text-red-500">Username already exists</p>}
                {usernameAvailable === true && <p className="text-[10px] text-green-500">Username is available</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input 
                    id="password" 
                    type={showPassword ? "text" : "password"} 
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    className="bg-background pr-10"
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
                <Label htmlFor="confirm_password">Confirm Password</Label>
                <div className="relative">
                  <Input 
                    id="confirm_password" 
                    type={showConfirmPassword ? "text" : "password"} 
                    required
                    value={formData.confirm_password}
                    onChange={(e) => setFormData({...formData, confirm_password: e.target.value})}
                    className="bg-background pr-10"
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

              <div className="flex items-center space-x-2 pt-2">
                <Checkbox 
                  id="terms" 
                  checked={termsAccepted}
                  onCheckedChange={(checked) => setTermsAccepted(checked as boolean)}
                />
                <Label htmlFor="terms" className="text-xs text-muted-foreground font-normal leading-tight">
                  I agree to the <Link href="/terms" className="text-primary hover:underline" target="_blank">Terms and Conditions</Link>
                </Label>
              </div>

              <motion.div whileTap={{ scale: 0.98 }} className="pt-4">
                <Button type="submit" className="w-full rounded-full" disabled={loading || usernameAvailable === false}>
                  {loading ? "Creating Account..." : "Sign Up"}
                </Button>
              </motion.div>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-primary hover:underline font-medium">
            Log In
          </Link>
        </div>
      </div>
    </div>
  )
}
