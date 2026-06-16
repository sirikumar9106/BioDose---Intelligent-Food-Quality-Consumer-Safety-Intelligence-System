"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { InteractiveBackground } from "@/components/interactive-background"
import { API_BASE_URL } from "@/lib/api"
import { Eye, EyeOff } from "lucide-react"


function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isRegistered = searchParams.get("registered") === "true"
  const [loginMethod, setLoginMethod] = useState<"email" | "username">("email")
  const [formData, setFormData] = useState({
    identifier: "",
    password: "",
  })
  
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const payload = {
        [loginMethod]: formData.identifier,
        password: formData.password
      }

      const res = await fetch(`${API_BASE_URL}/api/v1/auth/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        setError(data.detail || data.error || "Invalid login credentials.")
      } else {
        localStorage.setItem("access_token", data.access)
        localStorage.setItem("refresh_token", data.refresh)
        // Check profile completeness
        const profileRes = await fetch(`${API_BASE_URL}/api/v1/auth/profile/`, {
          headers: { Authorization: `Bearer ${data.access}` }
        })
        const profile = await profileRes.json()
        if (profile.profile_complete) {
          router.push("/dashboard")
        } else {
          router.push("/profile-setup")
        }
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
        <h2 className="text-3xl font-bold font-syne mb-1 text-center text-primary">Welcome Back</h2>
        <p className="text-sm text-muted-foreground text-center mb-6 font-inter">
          Log in to continue to BioDose.
        </p>

        {isRegistered && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/50 text-green-500 rounded-md text-sm text-center">
            Sign up successful! Please log in to access the app.
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 text-red-500 rounded-md text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-center mb-6 bg-secondary p-1 rounded-full w-full max-w-[200px] mx-auto">
          <button
            type="button"
            onClick={() => { setLoginMethod("email"); setFormData({...formData, identifier: ""}); setError(""); }}
            className={`flex-1 text-sm py-1.5 rounded-full transition-colors ${loginMethod === "email" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => { setLoginMethod("username"); setFormData({...formData, identifier: ""}); setError(""); }}
            className={`flex-1 text-sm py-1.5 rounded-full transition-colors ${loginMethod === "username" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Username
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 font-inter">
          <div className="space-y-2">
            <Label htmlFor="identifier">
              {loginMethod === "email" ? "Email Address" : "Username"}
            </Label>
            <Input 
              id="identifier" 
              type={loginMethod === "email" ? "email" : "text"} 
              required
              placeholder={loginMethod === "email" ? "you@example.com" : "johndoe"}
              value={formData.identifier}
              onChange={(e) => setFormData({...formData, identifier: e.target.value})}
              className="bg-background"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="password">Password</Label>
              <Link href="#" className="text-xs text-primary hover:underline">Forgot password?</Link>
            </div>
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
          </div>

          <motion.div whileTap={{ scale: 0.95 }} className="pt-4">
            <Button type="submit" className="w-full rounded-full" disabled={loading}>
              {loading ? "Logging in..." : "Log In"}
            </Button>
          </motion.div>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link href="/auth/signup" className="text-primary hover:underline font-medium">
            Sign Up
          </Link>
        </div>
      </motion.div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <LoginForm />
    </Suspense>
  )
}
