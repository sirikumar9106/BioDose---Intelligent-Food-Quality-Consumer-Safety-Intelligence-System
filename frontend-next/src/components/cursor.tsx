"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Navigation } from "lucide-react"

export function CustomCursor() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [isHovering, setIsHovering] = useState(false)

  useEffect(() => {
    const updateMousePosition = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }

    const handleMouseOver = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("button, a, input, [role='button']")) {
        setIsHovering(true)
      } else {
        setIsHovering(false)
      }
    }

    window.addEventListener("mousemove", updateMousePosition)
    window.addEventListener("mouseover", handleMouseOver)

    // Hide default cursor
    document.body.style.cursor = "none"

    return () => {
      window.removeEventListener("mousemove", updateMousePosition)
      window.removeEventListener("mouseover", handleMouseOver)
      document.body.style.cursor = "auto"
    }
  }, [])

  return (
    <>
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9999] hidden md:block text-primary"
        style={{ willChange: "transform" }}
        animate={{
          x: mousePosition.x,
          y: mousePosition.y,
          scale: isHovering ? 1.4 : 1,
        }}
        transition={{ type: "spring", stiffness: 500, damping: 30, mass: 0.3 }}
      >
        {/* rotate -45deg so the icon tip points top-left = actual click point */}
        <Navigation
          className="w-6 h-6 fill-primary -rotate-45 block"
          strokeWidth={1.5}
          style={{ transform: "rotate(-45deg)" }}
        />
      </motion.div>
    </>
  )
}
