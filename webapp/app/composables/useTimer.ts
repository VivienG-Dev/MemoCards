import { ref, computed, onUnmounted } from 'vue'

/**
 * Composable for countdown timer functionality
 * Used in exam mode for per-question timing
 */
export function useTimer(initialSeconds: number = 60) {
  const timeLeft = ref(initialSeconds)
  const isRunning = ref(false)
  const isPaused = ref(false)
  let intervalId: NodeJS.Timeout | null = null
  
  // Computed properties
  const progress = computed(() => {
    return ((initialSeconds - timeLeft.value) / initialSeconds) * 100
  })
  
  const formattedTime = computed(() => {
    const minutes = Math.floor(timeLeft.value / 60)
    const seconds = timeLeft.value % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  })
  
  const isExpired = computed(() => timeLeft.value <= 0)
  
  const isWarning = computed(() => timeLeft.value <= 10) // Last 10 seconds
  
  const isCritical = computed(() => timeLeft.value <= 5) // Last 5 seconds
  
  // Methods
  const start = (onTick?: (timeLeft: number) => void, onComplete?: () => void) => {
    if (isRunning.value) return
    
    isRunning.value = true
    isPaused.value = false
    
    intervalId = setInterval(() => {
      if (timeLeft.value > 0) {
        timeLeft.value--
        onTick?.(timeLeft.value)
        
        if (timeLeft.value === 0) {
          stop()
          onComplete?.()
        }
      }
    }, 1000)
  }
  
  const stop = () => {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
    isRunning.value = false
    isPaused.value = false
  }
  
  const pause = () => {
    if (isRunning.value && !isPaused.value) {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
      isPaused.value = true
      isRunning.value = false
    }
  }
  
  const resume = (onTick?: (timeLeft: number) => void, onComplete?: () => void) => {
    if (isPaused.value) {
      isPaused.value = false
      start(onTick, onComplete)
    }
  }
  
  const reset = (newTime?: number) => {
    stop()
    timeLeft.value = newTime || initialSeconds
  }
  
  const addTime = (seconds: number) => {
    timeLeft.value = Math.max(0, timeLeft.value + seconds)
  }
  
  // Cleanup on unmount
  onUnmounted(() => {
    stop()
  })
  
  return {
    // Reactive state
    timeLeft: readonly(timeLeft),
    isRunning: readonly(isRunning),
    isPaused: readonly(isPaused),
    progress: readonly(progress),
    formattedTime: readonly(formattedTime),
    isExpired: readonly(isExpired),
    isWarning: readonly(isWarning),
    isCritical: readonly(isCritical),
    
    // Methods
    start,
    stop,
    pause,
    resume,
    reset,
    addTime
  }
}

/**
 * Simple stopwatch for measuring study time
 */
export function useStopwatch() {
  const elapsed = ref(0)
  const isRunning = ref(false)
  const startTime = ref<Date | null>(null)
  let intervalId: NodeJS.Timeout | null = null
  
  const formattedTime = computed(() => {
    const hours = Math.floor(elapsed.value / 3600)
    const minutes = Math.floor((elapsed.value % 3600) / 60)
    const seconds = elapsed.value % 60
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  })
  
  const start = () => {
    if (isRunning.value) return
    
    startTime.value = new Date()
    isRunning.value = true
    
    intervalId = setInterval(() => {
      elapsed.value++
    }, 1000)
  }
  
  const stop = () => {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
    isRunning.value = false
  }
  
  const reset = () => {
    stop()
    elapsed.value = 0
    startTime.value = null
  }
  
  const getElapsedTime = (): number => {
    if (startTime.value) {
      return Math.floor((new Date().getTime() - startTime.value.getTime()) / 1000)
    }
    return elapsed.value
  }
  
  // Cleanup on unmount
  onUnmounted(() => {
    stop()
  })
  
  return {
    elapsed: readonly(elapsed),
    isRunning: readonly(isRunning),
    formattedTime: readonly(formattedTime),
    startTime: readonly(startTime),
    
    start,
    stop,
    reset,
    getElapsedTime
  }
}