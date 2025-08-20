<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { Progress } from '~/components/ui/progress'
import { api } from '~/lib/api'
import { useTimer, useStopwatch } from '~/composables/useTimer'
import { useStudySessions } from '~/composables/useStudySessions'
import type { FlashcardSet, StudyMode, CardResponse } from '~/lib/schemas'

definePageMeta({
  middleware: 'auth'
})

// Get the flashcard set ID from route query
const route = useRoute()
const setId = computed(() => route.query.setId as string)
const mode = computed(() => (route.query.mode as StudyMode) || 'normal')

// Reactive state
const flashcardSet = ref<FlashcardSet | null>(null)
const currentCardIndex = ref(0)
const showAnswer = ref(false)
const loading = ref(true)
const error = ref('')
const sessionComplete = ref(false)
const sessionResults = ref<CardResponse[]>([])

// MCQ state for exam mode
const currentMCQ = ref<{
  question: string
  options: string[]
  correctIndex: number
  explanation: string
  fallback?: boolean
} | null>(null)
const selectedOption = ref<number | null>(null)
const mcqAnswered = ref(false)
const loadingMCQ = ref(false)

// Study session management
const { createSession, completeSession, updateSessionProgress } = useStudySessions()
const sessionId = ref<string>('')

// Timer for exam mode (60 seconds per card)
const examTimer = useTimer(60)
const studyStopwatch = useStopwatch()

// Computed properties
const currentCard = computed(() => {
  if (!flashcardSet.value?.flashcards || currentCardIndex.value >= flashcardSet.value.flashcards.length) {
    return null
  }
  return flashcardSet.value.flashcards[currentCardIndex.value]
})

const progress = computed(() => {
  if (!flashcardSet.value?.flashcards?.length) return 0
  return Math.round((currentCardIndex.value / flashcardSet.value.flashcards.length) * 100)
})

const cardsRemaining = computed(() => {
  if (!flashcardSet.value?.flashcards?.length) return 0
  return flashcardSet.value.flashcards.length - currentCardIndex.value
})

const isExamMode = computed(() => mode.value === 'exam')

const correctAnswers = computed(() => 
  sessionResults.value.filter(r => r.correct).length
)

const accuracy = computed(() => {
  if (sessionResults.value.length === 0) return 0
  return Math.round((correctAnswers.value / sessionResults.value.length) * 100)
})

// Methods
const loadFlashcardSet = async () => {
  if (!setId.value) {
    error.value = 'No flashcard set specified'
    loading.value = false
    return
  }

  try {
    loading.value = true
    error.value = ''

    const result = await api.getFlashcardSet(setId.value)
    if (result.success && result.data) {
      flashcardSet.value = result.data
      
      // Start a new study session
      sessionId.value = await createSession(setId.value, mode.value)
      
      // For exam mode, generate MCQ for first card
      if (isExamMode.value && currentCard.value) {
        await generateMCQForCurrentCard()
      }
      
      // Start timing
      if (isExamMode.value) {
        startExamTimer()
      } else {
        studyStopwatch.start()
      }
    } else {
      error.value = result.error || 'Failed to load flashcard set'
    }
  } catch (err: any) {
    console.error('Error loading flashcard set:', err)
    error.value = err.message || 'Failed to load flashcard set'
  } finally {
    loading.value = false
  }
}

// Generate MCQ options for the current card using pre-generated data
const generateMCQForCurrentCard = async () => {
  if (!currentCard.value) return

  try {
    loadingMCQ.value = true
    
    // Use pre-generated MCQ options if available
    if (currentCard.value.mcqOptions && currentCard.value.mcqOptions.length >= 3) {
      console.log(`✅ Using pre-generated MCQ options for card ${currentCard.value.id}: ${currentCard.value.mcqOptions.length} options`)
      
      // Handle both formats: 3 options (distractors only) or 4 options (distractors + correct)
      let allOptions
      if (currentCard.value.mcqOptions.length === 3) {
        // Old format: 3 distractors, add correct answer
        console.log('📝 Old format: Adding correct answer to 3 distractors')
        allOptions = [...currentCard.value.mcqOptions, currentCard.value.answer]
      } else {
        // New format: 4 options already include correct answer
        console.log('🆕 New format: Using all 4 pre-generated options')
        allOptions = [...currentCard.value.mcqOptions]
      }
      
      const shuffled = allOptions.sort(() => Math.random() - 0.5)
      const correctIndex = shuffled.indexOf(currentCard.value.answer)

      currentMCQ.value = {
        question: currentCard.value.question,
        options: shuffled,
        correctIndex,
        explanation: `The correct answer is: ${currentCard.value.answer}`,
        fallback: !currentCard.value.mcqGenerated // Mark as fallback if MCQ wasn't properly generated
      }
    } else {
      // Fallback: create simple options if no pre-generated data
      console.warn('No pre-generated MCQ options found for card:', currentCard.value.id)
      currentMCQ.value = {
        question: currentCard.value.question,
        options: [
          currentCard.value.answer,
          'Alternative A',
          'Alternative B',
          'Alternative C'
        ].sort(() => Math.random() - 0.5),
        correctIndex: 0,
        explanation: `The correct answer is: ${currentCard.value.answer}`,
        fallback: true
      }
      // Update correct index after shuffle
      currentMCQ.value.correctIndex = currentMCQ.value.options.indexOf(currentCard.value.answer)
    }
  } catch (error) {
    console.error('Error setting up MCQ:', error)
    // Final fallback
    currentMCQ.value = {
      question: currentCard.value.question,
      options: [
        currentCard.value.answer,
        'Option A', 
        'Option B',
        'Option C'
      ].sort(() => Math.random() - 0.5),
      correctIndex: 0,
      explanation: `The correct answer is: ${currentCard.value.answer}`,
      fallback: true
    }
    currentMCQ.value.correctIndex = currentMCQ.value.options.indexOf(currentCard.value.answer)
  } finally {
    loadingMCQ.value = false
  }
}

const startExamTimer = () => {
  examTimer.start(
    (timeLeft) => {
      // Warning at 10 seconds
      if (timeLeft === 10) {
        console.log('10 seconds remaining!')
      }
    },
    () => {
      // Time up - automatically mark as incorrect and move to next
      if (isExamMode.value) {
        if (!mcqAnswered.value) {
          // No MCQ option selected - mark as incorrect
          selectedOption.value = null
          mcqAnswered.value = true
          handleMCQAnswer(false)
        }
      } else {
        handleAnswer(false)
      }
    }
  )
}

const showCardAnswer = () => {
  showAnswer.value = true
  
  if (isExamMode.value) {
    examTimer.pause()
  }
}

// Handle MCQ option selection
const selectMCQOption = (optionIndex: number) => {
  if (mcqAnswered.value) return
  
  selectedOption.value = optionIndex
  mcqAnswered.value = true
  
  if (isExamMode.value) {
    examTimer.pause()
  }
  
  // Auto-proceed after 2 seconds to show result
  setTimeout(() => {
    const correct = selectedOption.value === currentMCQ.value?.correctIndex
    handleMCQAnswer(correct)
  }, 2000)
}

const handleMCQAnswer = async (correct: boolean) => {
  if (!currentCard.value) return

  // Record the response
  const response: CardResponse = {
    cardId: currentCard.value.id,
    response: selectedOption.value !== null ? `option_${selectedOption.value}` : 'no_answer',
    correct,
    timeSpent: isExamMode.value ? (60 - examTimer.timeLeft.value) : 0,
    points: correct ? 1 : 0,
  }
  
  sessionResults.value.push(response)

  // Update session progress
  if (sessionId.value) {
    await updateSessionProgress(sessionId.value, response)
  }

  // Move to next card or complete session
  if (currentCardIndex.value < flashcardSet.value!.flashcards!.length - 1) {
    currentCardIndex.value++
    showAnswer.value = false
    
    // Reset MCQ state
    selectedOption.value = null
    mcqAnswered.value = false
    currentMCQ.value = null
    
    if (isExamMode.value) {
      examTimer.reset(60)
      await generateMCQForCurrentCard()
      startExamTimer()
    }
  } else {
    // Session complete
    await completeStudySession()
  }
}

const handleAnswer = async (correct: boolean) => {
  if (!currentCard.value) return

  // Record the response
  const response: CardResponse = {
    cardId: currentCard.value.id,
    response: correct ? 'correct' : 'incorrect',
    correct,
    timeSpent: isExamMode.value ? (60 - examTimer.timeLeft.value) : 0,
    points: correct ? 1 : 0,
  }
  
  sessionResults.value.push(response)

  // Update session progress
  if (sessionId.value) {
    await updateSessionProgress(sessionId.value, response)
  }

  // Move to next card or complete session
  if (currentCardIndex.value < flashcardSet.value!.flashcards!.length - 1) {
    currentCardIndex.value++
    showAnswer.value = false
    
    if (isExamMode.value) {
      examTimer.reset(60)
      startExamTimer()
    }
  } else {
    // Session complete
    await completeStudySession()
  }
}

const completeStudySession = async () => {
  sessionComplete.value = true
  
  if (isExamMode.value) {
    examTimer.stop()
  } else {
    studyStopwatch.stop()
  }

  if (sessionId.value) {
    await completeSession(sessionId.value, {
      totalCards: flashcardSet.value!.flashcards!.length,
      correctAnswers: correctAnswers.value,
      totalTime: isExamMode.value ? 
        flashcardSet.value!.flashcards!.length * 60 : 
        studyStopwatch.getElapsedTime(),
      mode: mode.value
    })
  }
}

const restartSession = async () => {
  currentCardIndex.value = 0
  showAnswer.value = false
  sessionComplete.value = false
  sessionResults.value = []
  
  // Reset MCQ state
  selectedOption.value = null
  mcqAnswered.value = false
  currentMCQ.value = null
  
  if (isExamMode.value) {
    examTimer.reset(60)
    if (currentCard.value) {
      await generateMCQForCurrentCard()
    }
    startExamTimer()
  } else {
    studyStopwatch.reset()
    studyStopwatch.start()
  }
}

const exitSession = () => {
  if (isExamMode.value) {
    examTimer.stop()
  } else {
    studyStopwatch.stop()
  }
  
  navigateTo('/my-cards')
}

// Lifecycle
onMounted(() => {
  loadFlashcardSet()
})

onUnmounted(() => {
  if (isExamMode.value) {
    examTimer.stop()
  } else {
    studyStopwatch.stop()
  }
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center min-h-screen">
      <div class="text-center">
        <svg class="animate-spin h-12 w-12 text-blue-600 mx-auto mb-4" 
             xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" 
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-gray-600 text-lg">Loading flashcards...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex items-center justify-center min-h-screen">
      <div class="text-center max-w-md mx-auto px-4">
        <svg class="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2 class="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h2>
        <p class="text-gray-600 mb-6">{{ error }}</p>
        <Button @click="exitSession">Go Back</Button>
      </div>
    </div>

    <!-- Session Complete -->
    <div v-else-if="sessionComplete" class="flex items-center justify-center min-h-screen">
      <div class="max-w-md mx-auto px-4">
        <Card class="text-center">
          <CardHeader>
            <div class="w-16 h-16 bg-green-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <CardTitle class="text-2xl">Session Complete!</CardTitle>
          </CardHeader>
          
          <CardContent class="space-y-4">
            <!-- Results Summary -->
            <div class="grid grid-cols-2 gap-4 py-4">
              <div class="text-center">
                <div class="text-2xl font-bold text-blue-600">{{ correctAnswers }}</div>
                <div class="text-sm text-gray-500">Correct</div>
              </div>
              <div class="text-center">
                <div class="text-2xl font-bold text-gray-900">{{ accuracy }}%</div>
                <div class="text-sm text-gray-500">Accuracy</div>
              </div>
            </div>

            <!-- Mode-specific stats -->
            <div class="bg-gray-50 rounded-lg p-4">
              <div v-if="isExamMode" class="text-center">
                <div class="text-lg font-semibold text-gray-900">Exam Mode</div>
                <div class="text-sm text-gray-600 mt-1">
                  {{ flashcardSet?.flashcards?.length || 0 }} cards • 60s each
                </div>
              </div>
              <div v-else class="text-center">
                <div class="text-lg font-semibold text-gray-900">Study Mode</div>
                <div class="text-sm text-gray-600 mt-1">
                  Time: {{ studyStopwatch.formattedTime }}
                </div>
              </div>
            </div>

            <!-- Action buttons -->
            <div class="flex space-x-3 pt-4">
              <Button @click="restartSession" variant="outline" class="flex-1">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Study Again
              </Button>
              <Button @click="exitSession" class="flex-1">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2v0a2 2 0 012-2h6l2 2h6a2 2 0 012 2v1M3 7l0 0M3 7l0 0" />
                </svg>
                My Cards
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Active Study Session -->
    <div v-else-if="currentCard && flashcardSet" class="max-w-4xl mx-auto px-4 py-8">
      <!-- Header with progress and controls -->
      <div class="mb-8">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center space-x-4">
            <Button @click="exitSession" variant="ghost" size="sm">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M15 19l-7-7 7-7" />
              </svg>
              Exit
            </Button>
            
            <div>
              <h1 class="text-2xl font-bold text-gray-900">{{ flashcardSet.title }}</h1>
              <p class="text-sm text-gray-600">
                {{ isExamMode ? 'Exam Mode' : 'Study Mode' }} • 
                {{ currentCardIndex + 1 }} of {{ flashcardSet.flashcards?.length }}
              </p>
            </div>
          </div>

          <!-- Mode indicator and timer -->
          <div class="flex items-center space-x-4">
            <Badge :class="isExamMode ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'">
              {{ isExamMode ? 'EXAM' : 'STUDY' }}
            </Badge>
            
            <div v-if="isExamMode" class="text-right">
              <div class="text-2xl font-bold" 
                   :class="examTimer.isCritical ? 'text-red-600' : examTimer.isWarning ? 'text-yellow-600' : 'text-gray-900'">
                {{ examTimer.formattedTime }}
              </div>
              <div class="text-xs text-gray-500">Time Left</div>
            </div>
            
            <div v-else class="text-right">
              <div class="text-lg font-semibold text-gray-900">{{ studyStopwatch.formattedTime }}</div>
              <div class="text-xs text-gray-500">Study Time</div>
            </div>
          </div>
        </div>

        <!-- Progress bar -->
        <div class="space-y-2">
          <div class="flex justify-between text-sm text-gray-600">
            <span>Progress</span>
            <span>{{ cardsRemaining }} cards remaining</span>
          </div>
          <Progress :value="progress" class="h-2" />
        </div>
      </div>

      <!-- Exam Mode - MCQ Interface -->
      <div v-if="isExamMode && currentMCQ && !loadingMCQ" class="flex justify-center">
        <Card class="w-full max-w-3xl">
          <CardHeader class="text-center pb-6">
            <div class="flex justify-between items-center mb-4">
              <Badge variant="outline">{{ currentCard.topic || 'General' }}</Badge>
              <Badge class="bg-red-100 text-red-800">Multiple Choice</Badge>
            </div>
          </CardHeader>
          
          <CardContent class="space-y-8">
            <!-- Question -->
            <div class="text-center space-y-4">
              <h3 class="text-sm font-medium text-blue-600 uppercase tracking-wide">Question</h3>
              <p class="text-2xl font-semibold text-gray-900 leading-relaxed">
                {{ currentMCQ.question }}
              </p>
            </div>

            <!-- MCQ Options -->
            <div class="space-y-3">
              <div v-for="(option, index) in currentMCQ.options" 
                   :key="index"
                   class="relative">
                <button 
                  @click="selectMCQOption(index)"
                  :disabled="mcqAnswered"
                  :class="{
                    'bg-blue-50 border-blue-300 text-blue-900': selectedOption === index && !mcqAnswered,
                    'bg-green-100 border-green-400 text-green-900': mcqAnswered && index === currentMCQ.correctIndex,
                    'bg-red-100 border-red-400 text-red-900': mcqAnswered && selectedOption === index && index !== currentMCQ.correctIndex,
                    'bg-gray-100 border-gray-300 text-gray-500': mcqAnswered && selectedOption !== index && index !== currentMCQ.correctIndex,
                    'hover:bg-blue-50 hover:border-blue-300': !mcqAnswered
                  }"
                  class="w-full p-4 text-left border-2 border-gray-200 rounded-lg transition-all duration-200 flex items-center space-x-4 disabled:cursor-not-allowed">
                  
                  <div :class="{
                    'bg-blue-600 text-white': selectedOption === index && !mcqAnswered,
                    'bg-green-600 text-white': mcqAnswered && index === currentMCQ.correctIndex,
                    'bg-red-600 text-white': mcqAnswered && selectedOption === index && index !== currentMCQ.correctIndex,
                    'bg-gray-400 text-white': mcqAnswered && selectedOption !== index && index !== currentMCQ.correctIndex
                  }"
                       class="w-8 h-8 rounded-full bg-gray-300 text-gray-700 flex items-center justify-center font-semibold flex-shrink-0">
                    {{ String.fromCharCode(65 + index) }}
                  </div>
                  
                  <span class="text-lg">{{ option }}</span>
                  
                  <!-- Correct/Incorrect icons -->
                  <div class="ml-auto flex-shrink-0">
                    <svg v-if="mcqAnswered && index === currentMCQ.correctIndex" 
                         class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <svg v-else-if="mcqAnswered && selectedOption === index && index !== currentMCQ.correctIndex" 
                         class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                </button>
              </div>
            </div>

            <!-- Result explanation (shown after selection) -->
            <div v-if="mcqAnswered && currentMCQ.explanation" 
                 class="mt-8 p-4 bg-gray-50 rounded-lg border-l-4 border-blue-500">
              <h4 class="font-semibold text-gray-900 mb-2">Explanation:</h4>
              <p class="text-gray-700">{{ currentMCQ.explanation }}</p>
              <div v-if="currentMCQ.fallback" class="mt-2 text-sm text-amber-600">
                ⚠️ AI-generated options unavailable - using fallback
              </div>
            </div>

            <!-- Instructions -->
            <div v-if="!mcqAnswered" class="text-center text-gray-500 text-sm">
              Select the best answer from the options above
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Loading MCQ -->
      <div v-else-if="isExamMode && loadingMCQ" class="flex justify-center">
        <Card class="w-full max-w-3xl min-h-[400px] flex items-center justify-center">
          <div class="text-center space-y-4">
            <svg class="animate-spin h-8 w-8 text-blue-600 mx-auto" 
                 xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" 
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p class="text-gray-600">Generating answer choices...</p>
          </div>
        </Card>
      </div>

      <!-- Study Mode - Regular Flashcard Interface -->
      <div v-else-if="!isExamMode" class="flex justify-center">
        <Card class="w-full max-w-2xl min-h-[400px] cursor-pointer transition-transform hover:scale-[1.02]" 
              @click="!showAnswer && showCardAnswer()">
          <CardHeader class="text-center pb-2">
            <div class="flex justify-between items-center mb-4">
              <Badge variant="outline">{{ currentCard.topic || 'General' }}</Badge>
              <Badge v-if="currentCard.difficulty" 
                     :class="{
                       'bg-green-100 text-green-800': currentCard.difficulty === 'easy',
                       'bg-yellow-100 text-yellow-800': currentCard.difficulty === 'medium',
                       'bg-red-100 text-red-800': currentCard.difficulty === 'hard'
                     }">
                {{ currentCard.difficulty }}
              </Badge>
            </div>
          </CardHeader>
          
          <CardContent class="flex flex-col justify-center items-center text-center space-y-6 py-8">
            <!-- Question -->
            <div class="space-y-4">
              <h3 class="text-sm font-medium text-blue-600 uppercase tracking-wide">Question</h3>
              <p class="text-2xl font-semibold text-gray-900 leading-relaxed">
                {{ currentCard.question }}
              </p>
            </div>

            <!-- Answer (shown when revealed) -->
            <div v-if="showAnswer" class="space-y-4 pt-8 border-t border-gray-200 w-full">
              <h3 class="text-sm font-medium text-green-600 uppercase tracking-wide">Answer</h3>
              <p class="text-xl text-gray-900 leading-relaxed">
                {{ currentCard.answer }}
              </p>
            </div>

            <!-- Prompt to reveal answer -->
            <div v-if="!showAnswer" class="pt-8 border-t border-gray-200 w-full">
              <p class="text-gray-500 text-sm">Click anywhere to reveal answer</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Answer buttons for Study Mode (shown after revealing answer) -->
      <div v-if="!isExamMode && showAnswer" class="flex justify-center mt-8">
        <div class="flex space-x-4">
          <Button @click="handleAnswer(false)" variant="outline" size="lg" 
                  class="border-red-300 text-red-700 hover:bg-red-50">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Incorrect
          </Button>
          
          <Button @click="handleAnswer(true)" size="lg"
                  class="bg-green-600 hover:bg-green-700">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            Correct
          </Button>
        </div>
      </div>

      <!-- Exam mode timer warning -->
      <div v-if="isExamMode && examTimer.isWarning && !mcqAnswered" 
           class="fixed bottom-4 right-4 bg-yellow-500 text-white px-6 py-3 rounded-lg shadow-lg animate-pulse">
        <div class="flex items-center space-x-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="font-semibold">{{ examTimer.formattedTime }} remaining!</span>
        </div>
      </div>
    </div>
  </div>
</template>