"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { InteractiveBackground } from "@/components/interactive-background"
import { API_BASE_URL } from "@/lib/api"
import { Eye, EyeOff } from "lucide-react"


export default function SignupPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    username: "",
    password: "",
    confirm_password: "",
  })
  
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [usernameChecking, setUsernameChecking] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Live Username Check
  useEffect(() => {
    const checkUsername = async () => {
      if (formData.username.length < 3) {
        setUsernameAvailable(null)
        return
      }
      setUsernameChecking(true)
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
  }, [formData.username])

  const validatePassword = (pwd: string) => {
    if (pwd.length < 8) return "Password must be at least 8 characters long."
    if (!/\d/.test(pwd)) return "Password must contain at least one number."
    if (!/[a-zA-Z]/.test(pwd)) return "Password must contain at least one alphabet character."
    if (!/[!@#$&*]/.test(pwd)) return "Password must contain at least one special character (!@#$&*)."
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
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
        body: JSON.stringify(formData)
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        if (data.email) setError(data.email[0])
        else if (data.username) setError(data.username[0])
        else setError(data.error || "Failed to register. Please try again.")
      } else {
        // Success
        router.push("/auth/login?registered=true")
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
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md p-6 sm:p-8 rounded-2xl border border-border bg-card shadow-xl glass-panel mx-auto my-auto"
      >
        <h2 className="text-3xl font-bold font-syne mb-1 text-center text-primary">Create Account</h2>
        <p className="text-sm text-muted-foreground text-center mb-6 font-inter">
          Join BioDose and take control of your food safety.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 text-red-500 rounded-md text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 font-inter">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name</Label>
            <Input 
              id="full_name" 
              required
              value={formData.full_name}
              onChange={(e) => setFormData({...formData, full_name: e.target.value})}
              className="bg-background"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input 
              id="email" 
              type="email" 
              required
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              className="bg-background"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input 
              id="username" 
              required
              value={formData.username}
              onChange={(e) => setFormData({...formData, username: e.target.value})}
              className={`bg-background ${usernameAvailable === false ? 'border-red-500 focus-visible:ring-red-500' : ''} ${usernameAvailable === true ? 'border-green-500 focus-visible:ring-green-500' : ''}`}
            />
            {usernameChecking && <p className="text-xs text-muted-foreground">Checking availability...</p>}
            {usernameAvailable === false && <p className="text-xs text-red-500">Username already exists</p>}
            {usernameAvailable === true && <p className="text-xs text-green-500">Username is available</p>}
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
            <p className="text-xs text-muted-foreground">
              Min 8 chars, 1 number, 1 letter, 1 special (!@#$&*)
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
            <Label htmlFor="terms" className="text-sm text-muted-foreground font-normal leading-tight">
              I agree to the <Link href="/terms" className="text-primary hover:underline" target="_blank">Terms and Conditions</Link>
            </Label>
          </div>

          <motion.div whileTap={{ scale: 0.95 }} className="pt-4">
            <Button type="submit" className="w-full rounded-full" disabled={loading || usernameAvailable === false}>
              {loading ? "Creating account..." : "Sign Up"}
            </Button>
          </motion.div>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-primary hover:underline font-medium">
            Log In
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
