import { ref, computed } from 'vue'
import { useLocalStorage, localStorage } from './useLocalStorage'
import {
  StudySessionSchema,
  DailyProgressSchema,
  StudyAnalyticsSchema,
  type StudySession,
  type DailyProgress,
  type StudyAnalytics,
  type CardResponse
} from '~/lib/schemas'

const STORAGE_KEYS = {
  SESSIONS: 'flashcards-study-sessions',
  DAILY_PROGRESS: 'flashcards-daily-progress',
  ANALYTICS: 'flashcards-analytics'
} as const

/**
 * Composable for managing study sessions and analytics
 */
export function useStudySessions() {
  // Reactive storage for sessions
  const [sessions, setSessions] = useLocalStorage<StudySession[]>(
    STORAGE_KEYS.SESSIONS,
    [],
    StudySessionSchema.array()
  )
  
  // Computed analytics
  const analytics = computed((): StudyAnalytics => {
    const sessionList = sessions.value
    
    if (sessionList.length === 0) {
      return {
        totalSessions: 0,
        totalCards: 0,
        averageScore: 0,
        currentStreak: 0,
        bestStreak: 0,
        studyTime: 0,
        lastStudyDate: undefined
      }
    }
    
    const totalSessions = sessionList.length
    const totalCards = sessionList.reduce((sum, session) => sum + session.totalCards, 0)
    const averageScore = sessionList.reduce((sum, session) => sum + session.percentage, 0) / totalSessions
    const studyTime = sessionList.reduce((sum, session) => {
      const duration = (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 1000 / 60
      return sum + duration
    }, 0)
    
    // Calculate streaks
    const sortedSessions = [...sessionList].sort((a, b) => 
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    )
    
    let currentStreak = 0
    let bestStreak = 0
    let tempStreak = 0
    let lastDate: string | null = null
    
    for (const session of sortedSessions) {
      const sessionDate = new Date(session.startTime).toDateString()
      
      if (lastDate === null) {
        // First session
        tempStreak = 1
        currentStreak = 1
      } else if (sessionDate === lastDate) {
        // Same day, continue streak
        continue
      } else {
        const dayDiff = Math.floor((new Date(lastDate).getTime() - new Date(sessionDate).getTime()) / (1000 * 60 * 60 * 24))
        
        if (dayDiff === 1) {
          // Consecutive day
          tempStreak++
          if (currentStreak === tempStreak - 1) {
            currentStreak++
          }
        } else {
          // Break in streak
          bestStreak = Math.max(bestStreak, tempStreak)
          tempStreak = 1
          if (currentStreak > 1 && dayDiff > 1) {
            currentStreak = 0 // Reset current streak if gap is too big
          }
        }
      }
      
      lastDate = sessionDate
    }
    
    bestStreak = Math.max(bestStreak, tempStreak)
    
    return {
      totalSessions,
      totalCards,
      averageScore,
      currentStreak,
      bestStreak,
      studyTime,
      lastStudyDate: sessionList.length > 0 ? new Date(sortedSessions[0].startTime) : undefined
    }
  })
  
  /**
   * Save a completed study session
   */
  const saveStudySession = async (session: StudySession): Promise<void> => {
    try {
      // Validate session data
      const validatedSession = StudySessionSchema.parse(session)
      
      // Add to sessions list
      const updatedSessions = [...sessions.value, validatedSession]
      setSessions(updatedSessions)
      
      // Update daily progress
      await updateDailyProgress(validatedSession)
      
      console.log('Study session saved successfully:', validatedSession.id)
    } catch (error) {
      console.error('Failed to save study session:', error)
      throw new Error('Failed to save study session')
    }
  }
  
  /**
   * Update daily progress statistics
   */
  const updateDailyProgress = async (session: StudySession): Promise<void> => {
    const today = new Date().toISOString().split('T')[0]
    const dailyProgressList = localStorage.get<DailyProgress[]>(STORAGE_KEYS.DAILY_PROGRESS, [], DailyProgressSchema.array())
    
    const existingProgressIndex = dailyProgressList.findIndex(p => p.date === today)
    const studyTime = Math.floor((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 1000 / 60)
    
    if (existingProgressIndex >= 0) {
      // Update existing progress
      dailyProgressList[existingProgressIndex] = {
        date: today,
        cardsStudied: dailyProgressList[existingProgressIndex].cardsStudied + session.totalCards,
        sessionsCompleted: dailyProgressList[existingProgressIndex].sessionsCompleted + 1,
        totalScore: dailyProgressList[existingProgressIndex].totalScore + session.finalScore,
        studyTime: dailyProgressList[existingProgressIndex].studyTime + studyTime
      }
    } else {
      // Create new progress entry
      dailyProgressList.push({
        date: today,
        cardsStudied: session.totalCards,
        sessionsCompleted: 1,
        totalScore: session.finalScore,
        studyTime
      })
    }
    
    localStorage.set(STORAGE_KEYS.DAILY_PROGRESS, dailyProgressList)
  }
  
  /**
   * Get study sessions for a specific flashcard set
   */
  const getSessionsForSet = (flashcardSetId: string): StudySession[] => {
    return sessions.value.filter(session => session.flashcardSetId === flashcardSetId)
  }
  
  /**
   * Get recent study sessions (last N sessions)
   */
  const getRecentSessions = (limit: number = 10): StudySession[] => {
    return [...sessions.value]
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, limit)
  }
  
  /**
   * Get daily progress data for charts/analytics
   */
  const getDailyProgress = (days: number = 30): DailyProgress[] => {
    const dailyProgressList = localStorage.get<DailyProgress[]>(STORAGE_KEYS.DAILY_PROGRESS, [], DailyProgressSchema.array())
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    
    return dailyProgressList
      .filter(progress => new Date(progress.date) >= cutoffDate)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }
  
  /**
   * Get cards studied today count
   */
  const getCardsStudiedToday = (): number => {
    const today = new Date().toISOString().split('T')[0]
    const dailyProgressList = localStorage.get<DailyProgress[]>(STORAGE_KEYS.DAILY_PROGRESS, [], DailyProgressSchema.array())
    const todayProgress = dailyProgressList.find(p => p.date === today)
    return todayProgress?.cardsStudied || 0
  }
  
  /**
   * Clear all study data (for debugging/reset)
   */
  const clearAllStudyData = (): void => {
    setSessions([])
    localStorage.remove(STORAGE_KEYS.DAILY_PROGRESS)
    localStorage.remove(STORAGE_KEYS.ANALYTICS)
  }
  
  /**
   * Generate a unique session ID
   */
  const generateSessionId = (): string => {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Create a new study session
   */
  const createSession = async (flashcardSetId: string, mode: 'normal' | 'exam'): Promise<string> => {
    const sessionId = generateSessionId()
    
    // Just return the session ID, the actual session will be saved when completed
    return sessionId
  }

  /**
   * Complete a study session with results
   */
  const completeSession = async (sessionId: string, results: {
    totalCards: number
    correctAnswers: number
    totalTime: number
    mode: 'normal' | 'exam'
  }): Promise<void> => {
    const session: StudySession = {
      id: sessionId,
      flashcardSetId: '', // This should be set by the calling code
      setTitle: '', // This should be set by the calling code
      mode: results.mode,
      startTime: new Date(Date.now() - results.totalTime * 1000), // Approximate start time
      endTime: new Date(),
      totalCards: results.totalCards,
      correctAnswers: results.correctAnswers,
      finalScore: results.correctAnswers,
      percentage: Math.round((results.correctAnswers / results.totalCards) * 100),
      completedAt: new Date().toISOString()
    }
    
    await saveStudySession(session)
  }

  /**
   * Update session progress (for real-time tracking)
   */
  const updateSessionProgress = async (sessionId: string, cardResponse: CardResponse): Promise<void> => {
    // For now, just log the progress. In a full implementation, 
    // this could update a temporary session state
    console.log(`Session ${sessionId} progress:`, cardResponse)
  }

  /**
   * Get today's study time in minutes
   */
  const getTodaysStudyTime = async (): Promise<number> => {
    const today = new Date().toISOString().split('T')[0]
    const dailyProgressList = localStorage.get<DailyProgress[]>(STORAGE_KEYS.DAILY_PROGRESS, [], DailyProgressSchema.array())
    const todayProgress = dailyProgressList.find(p => p.date === today)
    return todayProgress?.studyTime || 0
  }

  /**
   * Get weekly progress data
   */
  const getWeeklyProgress = async (): Promise<DailyProgress[]> => {
    return getDailyProgress(7)
  }
  
  return {
    // Reactive data
    sessions: readonly(sessions),
    analytics: readonly(analytics),
    
    // Methods
    saveStudySession,
    updateDailyProgress,
    getSessionsForSet,
    getRecentSessions,
    getDailyProgress,
    getCardsStudiedToday,
    clearAllStudyData,
    generateSessionId,
    createSession,
    completeSession,
    updateSessionProgress,
    getTodaysStudyTime,
    getWeeklyProgress
  }
}