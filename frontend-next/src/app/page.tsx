"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { InteractiveBackground } from "@/components/interactive-background"

export default function LandingPage() {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    // Stage 0: Logo entering (0s to 1.2s)
    // Stage 1: "BioDose" letters entering (1.2s to 2.4s)
    // Stage 2: Description & Buttons entering (2.4s onwards)
    
    const t1 = setTimeout(() => setStage(1), 1200)
    const t2 = setTimeout(() => setStage(2), 2400)
    
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  const brandLetters = Array.from("BioDose")

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen text-foreground overflow-hidden px-4 py-6">
      {/* Dynamic Background Ripples and Orbs */}
      <InteractiveBackground />

      <div className="relative flex flex-col items-center justify-center z-10 w-full max-w-md mx-auto gap-6 md:gap-8 text-center">
        {/* LOGO */}
        <div className="relative flex items-center justify-center">
          {/* Pulsing Aura */}
          <div className="absolute inset-0 rounded-full bg-teal-500/20 blur-[45px] animate-pulse" />
          
          <motion.div
            key="logo"
            initial={{ opacity: 0, rotateY: 180, scale: 0.5 }}
            animate={{ opacity: 1, rotateY: 0, scale: 1 }}
            transition={{ duration: 1.2, type: "spring", stiffness: 90, damping: 15 }}
            className="relative flex items-center justify-center"
          >
            {/* Logo container: transparent bg, no card background fill */}
            <div className="relative w-32 h-32 md:w-40 md:h-40 rounded-3xl overflow-hidden">
              <Image 
                src="/logo.png" 
                alt="BioDose Logo" 
                fill 
                className="object-contain"
                priority
              />
              
              {/* Dynamic Scanning Laser line sweep */}
              <motion.div
                className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-teal-400 to-transparent shadow-[0_0_12px_#2dd4bf] z-10"
                animate={{ top: ["0%", "100%", "0%"] }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
            </div>
          </motion.div>
        </div>

        {/* BRAND NAME WITH STAGGERED CHARACTER SPRING BOUNCE */}
        <AnimatePresence>
          {stage >= 1 && (
            <div className="flex flex-col items-center justify-center w-full select-none">
              <h1 className="text-5xl md:text-6xl font-bold tracking-tight font-syne pb-2 flex justify-center overflow-hidden">
                {brandLetters.map((char, index) => (
                  <motion.span
                    key={index}
                    initial={{ opacity: 0, y: 50, rotate: index % 2 === 0 ? 10 : -10 }}
                    animate={{ opacity: 1, y: 0, rotate: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 160,
                      damping: 12,
                      delay: index * 0.06
                    }}
                    className="inline-block bg-clip-text text-transparent bg-gradient-to-r from-teal-400 via-emerald-500 to-cyan-500 hover:scale-125 hover:rotate-6 transition-transform cursor-default"
                  >
                    {char}
                  </motion.span>
                ))}
              </h1>

              {/* Subtitle fading in */}
              <motion.p
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="mt-3 text-muted-foreground text-sm md:text-base font-inter max-w-sm"
              >
                Intelligent food safety and personalized nutrition.
              </motion.p>
            </div>
          )}
        </AnimatePresence>

        {/* CALL TO ACTION BUTTONS */}
        <AnimatePresence>
          {stage >= 2 && (
            <motion.div
              key="cta"
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, type: "spring", stiffness: 100 }}
              className="flex flex-row gap-4 w-full max-w-xs justify-center mt-2"
            >
              <Link href="/auth/login" className="w-1/2">
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="w-full rounded-full border-border bg-card/50 backdrop-blur-sm hover:bg-muted/50 transition-all font-semibold text-sm h-11"
                >
                  Log In
                </Button>
              </Link>
              <Link href="/auth/signup" className="w-1/2">
                <Button 
                  size="lg" 
                  className="w-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white font-semibold shadow-lg shadow-teal-500/20 text-sm border-0 h-11"
                >
                  Sign Up
                </Button>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
