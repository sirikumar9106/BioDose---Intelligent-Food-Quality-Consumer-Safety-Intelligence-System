"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"

export function SessionGuard() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const checkSession = () => {
      const sessionStart = localStorage.getItem("session_start_time")
      const accessToken = localStorage.getItem("access_token")

      if (accessToken && sessionStart) {
        const twelveHours = 12 * 60 * 60 * 1000 // 12 hours in milliseconds
        const elapsed = Date.now() - Number(sessionStart)

        if (elapsed > twelveHours) {
          localStorage.removeItem("access_token")
          localStorage.removeItem("refresh_token")
          localStorage.removeItem("session_start_time")
          
          if (!pathname.startsWith("/auth")) {
            router.push("/auth/login")
          }
        }
      }
    }

    checkSession()
  }, [pathname, router])

  return null
}
