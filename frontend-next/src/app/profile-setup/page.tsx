"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { CalendarDays, Stethoscope, ChevronRight } from "lucide-react"

import { API_BASE_URL as API_URL } from "@/lib/api"


interface Condition {
  id: string
  name: string
}

export default function ProfileSetupPage() {
  const router = useRouter()
  const [dob, setDob] = useState("")
  const [conditions, setConditions] = useState<string[]>([])
  const [availableConditions, setAvailableConditions] = useState<Condition[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [step, setStep] = useState<"dob" | "conditions">("dob")
  const [calculatedAge, setCalculatedAge] = useState<number | null>(null)

  useEffect(() => {
    const token = localStorage.getItem("access_token")
    if (!token) {
      router.push("/auth/login")
      return
    }
    // Fetch conditions
    fetch(`${API_URL}/api/v1/auth/profile/setup/`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.conditions) setAvailableConditions(data.conditions)
        // If profile already complete, redirect
        if (data.current_profile?.profile_complete) router.push("/dashboard")
      })
      .catch(() => setError("Failed to load conditions. Please reload."))
  }, [router])

  const handleDobNext = () => {
    if (!dob) { setError("Please enter your date of birth."); return }
    const today = new Date()
    const birth = new Date(dob)
    if (birth >= today) { setError("Date of birth must be in the past."); return }
    const age = today.getFullYear() - birth.getFullYear() -
      ((today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) ? 1 : 0)
    if (age < 1 || age > 130) { setError("Please enter a valid date of birth."); return }
    setCalculatedAge(age)
    setError("")
    setStep("conditions")
  }

  const toggleCondition = (id: string) => {
    setConditions(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  const handleSave = async () => {
    setLoading(true)
    setError("")
    const token = localStorage.getItem("access_token")
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/profile/setup/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ date_of_birth: dob, health_conditions: conditions })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || data.detail || "Failed to save profile.")
      } else {
        router.push("/dashboard")
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <div className="w-full max-w-2xl">
        {/* Progress */}
        <div className="flex items-center gap-4 mb-8">
          <div className={`flex items-center gap-2 text-sm font-medium ${step === "dob" ? "text-primary" : "text-green-500"}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${step === "dob" ? "border-primary text-primary" : "border-green-500 bg-green-500 text-white"}`}>
              {step === "conditions" ? "✓" : "1"}
            </div>
            Date of Birth
          </div>
          <div className="flex-1 h-px bg-border" />
          <div className={`flex items-center gap-2 text-sm font-medium ${step === "conditions" ? "text-primary" : "text-muted-foreground"}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${step === "conditions" ? "border-primary text-primary" : "border-muted-foreground text-muted-foreground"}`}>2</div>
            Health Conditions
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-500 rounded-xl text-sm">
            {error}
          </div>
        )}

        {step === "dob" && (
          <motion.div
            key="dob"
            initial={{ opacity: 0, rotateY: 90 }}
            animate={{ opacity: 1, rotateY: 0 }}
            transition={{ duration: 0.5, type: "spring", stiffness: 100 }}
            className="p-8 rounded-2xl border border-border bg-card shadow-xl"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-xl bg-primary/10">
                <CalendarDays className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold font-syne">When were you born?</h2>
                <p className="text-sm text-muted-foreground">Your age helps us personalise risk assessments. This cannot be changed later.</p>
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor="dob" className="text-base">Date of Birth</Label>
              <Input
                id="dob"
                type="date"
                value={dob}
                onChange={e => setDob(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
                className="bg-background text-lg p-6"
              />
              {dob && calculatedAge === null && (() => {
                const today = new Date(); const birth = new Date(dob)
                const age = today.getFullYear() - birth.getFullYear() -
                  ((today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) ? 1 : 0)
                return age > 0 ? (
                  <p className="text-teal-500 text-sm font-medium">Calculated age: <span className="font-bold">{age} years old</span></p>
                ) : null
              })()}
            </div>

            <motion.div whileTap={{ scale: 0.95 }} className="mt-6">
              <Button onClick={handleDobNext} className="w-full rounded-full" size="lg">
                Continue <ChevronRight className="ml-2 w-4 h-4" />
              </Button>
            </motion.div>
          </motion.div>
        )}

        {step === "conditions" && (
          <motion.div
            key="conditions"
            initial={{ opacity: 0, rotateY: 90 }}
            animate={{ opacity: 1, rotateY: 0 }}
            transition={{ duration: 0.5, type: "spring", stiffness: 100 }}
            className="p-8 rounded-2xl border border-border bg-card shadow-xl"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-xl bg-primary/10">
                <Stethoscope className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold font-syne">Select your health conditions</h2>
                <p className="text-sm text-muted-foreground">Select all that apply. You can update these later. You must select at least one or click "None of these apply" to proceed.</p>
              </div>
            </div>

            {calculatedAge !== null && (
              <p className="mb-6 text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-2 inline-block">
                Age detected: <span className="font-bold text-primary">{calculatedAge} years old</span>
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[380px] overflow-y-auto pr-1 mb-6">
              {availableConditions.map(c => (
                <button
                  key={c.id}
                  onClick={() => toggleCondition(c.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left text-sm transition-all ${
                    conditions.includes(c.id)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background hover:border-primary/40 hover:bg-muted/30"
                  }`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex-shrink-0 transition-all ${
                    conditions.includes(c.id) ? "border-primary bg-primary" : "border-muted-foreground"
                  }`}>
                    {conditions.includes(c.id) && <span className="text-background text-[10px] flex items-center justify-center h-full">✓</span>}
                  </div>
                  {c.name}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("dob")} className="rounded-full">Back</Button>
              <motion.div whileTap={{ scale: 0.95 }} className="flex-1">
                <Button onClick={handleSave} className="w-full rounded-full" disabled={loading} size="lg">
                  {loading ? "Saving..." : conditions.length === 0 ? "None of these apply →" : `Save ${conditions.length} condition${conditions.length > 1 ? "s" : ""} & Continue →`}
                </Button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
