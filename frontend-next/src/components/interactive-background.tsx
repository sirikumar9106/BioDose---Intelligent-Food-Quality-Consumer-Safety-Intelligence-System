"use client"

import { useTheme } from "next-themes"
import { useEffect, useRef, useState } from "react"

export function InteractiveBackground() {
  const { resolvedTheme } = useTheme()
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

    // Dot grid settings
    const spacing = 22 // Spacing between dots (increased density)
    
    let time = 0
    const render = () => {
      time += 0.012
      
      // Clear canvas
      ctx.clearRect(0, 0, width, height)

      const isDark = resolvedTheme === "dark"
      // Teal-400 for dark mode, Teal-600 for light mode
      const colorPrefix = isDark ? "45, 212, 191" : "13, 148, 136"

      const cols = Math.ceil(width / spacing) + 1
      const rows = Math.ceil(height / spacing) + 1

      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const x = c * spacing
          const y = r * spacing

          // Calculate 3D wave height using combined sine/cosine waves
          const dx = x - width / 2
          const dy = y - height / 2
          const dist = Math.sqrt(dx * dx + dy * dy)
          
          // Concentric circular ripples + diagonal grid wave
          const waveAngle = dist * 0.004 - time * 1.8
          const wave1 = Math.sin(c * 0.12 + time) * 6
          const wave2 = Math.cos(r * 0.12 + time * 0.8) * 6
          const wave3 = Math.sin(waveAngle) * 8
          
          const offset = wave1 + wave2 + wave3
          const normalized = (offset + 20) / 40 // Range 0 to 1
          
          // Density visual mapping: size & opacity variation
          const size = 1.0 + normalized * 1.5 // 1.0px to 2.5px
          const opacity = isDark 
            ? 0.036 + normalized * 0.144 // Faint particles in dark mode (+20% intensity)
            : 0.06 + normalized * 0.18 // Stronger contrast for light mode (+20% intensity)

          // Fluid drift offset
          const finalX = x + Math.sin(r * 0.15 + time) * 4
          const finalY = y + offset

          ctx.beginPath()
          ctx.arc(finalX, finalY, size, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${colorPrefix}, ${opacity})`
          ctx.fill()
        }
      }

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener("resize", handleResize)
      cancelAnimationFrame(animationFrameId)
    }
  }, [mounted, resolvedTheme])

  if (!mounted) return null

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 -z-10 w-full h-full pointer-events-none bg-background transition-colors duration-500"
    />
  )
}
