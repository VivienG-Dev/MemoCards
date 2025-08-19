<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { createWorker, type Worker } from 'tesseract.js'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { 
  cleanOcrText, 
  detectLanguage, 
  getProcessingLanguage, 
  validateTextForGeneration,
  SAMPLE_TEXT,
  formatTextPreview
} from '~/lib/textUtils'
import { api } from '~/lib/api'
import type { 
  LanguageOption, 
  GeneratedCard, 
  FlashcardGeneration,
  KeyPoint,
  CreateStudySummaryRequest 
} from '~/lib/schemas'

definePageMeta({
  middleware: 'auth'
})

// Generation mode options
type GenerationMode = 'flashcards' | 'summary' | 'both'

// Reactive state
const selectedImage = ref<File | null>(null)
const imagePreviewUrl = ref<string>('')
const extractedText = ref<string>('')
const editableText = ref<string>('')
const isProcessing = ref(false)
const isGenerating = ref(false)
const processingProgress = ref(0)
const selectedLanguage = ref<LanguageOption>('auto')
const generationMode = ref<GenerationMode>('flashcards')

// Generated content
const generatedCards = ref<GeneratedCard[]>([])
const generatedSummary = ref<string>('')
const keyPoints = ref<KeyPoint[]>([])

// Form state for saving
const setTitle = ref<string>('')
const setDescription = ref<string>('')
const summaryTitle = ref<string>('')
const isSaving = ref(false)
const error = ref<string>('')
const success = ref<string>('')

// Computed
const hasText = computed(() => editableText.value.trim().length > 0)
const textValidation = computed(() => validateTextForGeneration(editableText.value))
const canGenerate = computed(() => hasText.value && textValidation.value.valid && !isGenerating.value)
const canSaveFlashcards = computed(() => 
  setTitle.value.trim().length > 0 && 
  generatedCards.value.length > 0 && 
  !isSaving.value
)
const canSaveSummary = computed(() => 
  summaryTitle.value.trim().length > 0 && 
  generatedSummary.value.length > 0 && 
  !isSaving.value
)
const hasGeneratedContent = computed(() => 
  generatedCards.value.length > 0 || generatedSummary.value.length > 0
)

// Language options
const languageOptions: { value: LanguageOption; label: string; flag: string }[] = [
  { value: 'auto', label: 'Auto Detect', flag: '🌐' },
  { value: 'English', label: 'English', flag: '🇺🇸' },
  { value: 'French', label: 'Français', flag: '🇫🇷' }
]

// Generation mode options
const generationModeOptions: { value: GenerationMode; label: string; icon: string; description: string }[] = [
  { 
    value: 'flashcards', 
    label: 'Flashcards Only', 
    icon: '🃏', 
    description: 'Generate study flashcards for memorization' 
  },
  { 
    value: 'summary', 
    label: 'Summary Only', 
    icon: '📝', 
    description: 'Create highlighted summary with key points' 
  },
  { 
    value: 'both', 
    label: 'Both', 
    icon: '🎯', 
    description: 'Generate both flashcards and summary' 
  }
]

// File upload handling
const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (file && file.type.startsWith('image/')) {
    selectedImage.value = file
    
    // Create preview URL
    if (imagePreviewUrl.value) {
      URL.revokeObjectURL(imagePreviewUrl.value)
    }
    imagePreviewUrl.value = URL.createObjectURL(file)
    
    // Start OCR processing
    processOCR(file)
  } else {
    error.value = 'Please select a valid image file'
  }
}

// Drag and drop handling
const isDragging = ref(false)

const handleDragOver = (event: DragEvent) => {
  event.preventDefault()
  isDragging.value = true
}

const handleDragLeave = () => {
  isDragging.value = false
}

const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  isDragging.value = false
  
  const files = event.dataTransfer?.files
  const file = files?.[0]
  
  if (file && file.type.startsWith('image/')) {
    selectedImage.value = file
    
    if (imagePreviewUrl.value) {
      URL.revokeObjectURL(imagePreviewUrl.value)
    }
    imagePreviewUrl.value = URL.createObjectURL(file)
    
    processOCR(file)
  } else {
    error.value = 'Please drop a valid image file'
  }
}

// OCR processing with Tesseract.js
const processOCR = async (imageFile: File) => {
  isProcessing.value = true
  processingProgress.value = 0
  error.value = ''
  
  let worker: Worker | null = null
  
  try {
    console.log('Starting OCR processing for image:', imageFile.name)
    
    worker = await createWorker()
    
    // Set up progress tracking
    await worker.setParameters({
      tessedit_char_whitelist: '',
      tessedit_pageseg_mode: '1'
    })
    
    // Process image
    const { data } = await worker.recognize(imageFile, {
      logger: (progress) => {
        processingProgress.value = Math.round(progress.progress * 100)
        console.log('OCR Progress:', progress)
      }
    })
    
    if (!data.text || data.text.trim().length < 10) {
      throw new Error('Very little text was detected. Please try an image with more text content.')
    }
    
    const cleanedText = cleanOcrText(data.text)
    extractedText.value = cleanedText
    editableText.value = cleanedText
    
    console.log(`OCR processing successful, extracted ${cleanedText.length} characters`)
    console.log('Confidence:', data.confidence)
    
  } catch (err) {
    console.error('OCR processing failed:', err)
    error.value = err instanceof Error ? err.message : 'Failed to extract text from image'
  } finally {
    if (worker) {
      await worker.terminate()
    }
    isProcessing.value = false
    processingProgress.value = 0
  }
}

// Use sample text
const useSampleText = () => {
  const cleanedText = cleanOcrText(SAMPLE_TEXT)
  extractedText.value = cleanedText
  editableText.value = cleanedText
  selectedImage.value = null
  if (imagePreviewUrl.value) {
    URL.revokeObjectURL(imagePreviewUrl.value)
    imagePreviewUrl.value = ''
  }
}

// Show direct text input
const showDirectTextInput = () => {
  // Clear any existing image
  selectedImage.value = null
  if (imagePreviewUrl.value) {
    URL.revokeObjectURL(imagePreviewUrl.value)
    imagePreviewUrl.value = ''
  }
  
  // Set empty text to show the text input area
  extractedText.value = 'Direct text input'
  editableText.value = ''
  
  // Focus on the text area after a short delay
  nextTick(() => {
    const textArea = document.querySelector('textarea')
    if (textArea) {
      textArea.focus()
    }
  })
}

// Generate content based on selected mode
const generateContent = async () => {
  if (!canGenerate.value) return
  
  isGenerating.value = true
  error.value = ''
  
  try {
    const langToUse = getProcessingLanguage(selectedLanguage.value, editableText.value)
    console.log(`Generating ${generationMode.value} in ${langToUse} (selected: ${selectedLanguage.value})`)
    
    // Generate flashcards if needed
    if (generationMode.value === 'flashcards' || generationMode.value === 'both') {
      const flashcardsResult = await api.generateFromOCR({
        text: editableText.value,
        finalCount: 12,
        lang: langToUse
      })
      
      if (flashcardsResult.success && flashcardsResult.data?.cards) {
        generatedCards.value = flashcardsResult.data.cards
      } else {
        throw new Error(flashcardsResult.error || 'Failed to generate flashcards')
      }
    }
    
    // Generate summary if needed
    if (generationMode.value === 'summary' || generationMode.value === 'both') {
      const summaryResult = await api.generateSummary({
        text: editableText.value,
        language: langToUse
      })
      
      if (summaryResult.success && summaryResult.data) {
        generatedSummary.value = summaryResult.data.summary
        keyPoints.value = summaryResult.data.keyPoints
      } else {
        throw new Error(summaryResult.error || 'Failed to generate summary')
      }
    }
    
    // Set success message based on what was generated
    if (generationMode.value === 'both') {
      success.value = `Generated ${generatedCards.value.length} flashcards and summary with ${keyPoints.value.length} key points!`
    } else if (generationMode.value === 'flashcards') {
      success.value = `Generated ${generatedCards.value.length} flashcards successfully!`
    } else {
      success.value = `Generated summary with ${keyPoints.value.length} key points successfully!`
    }
    
  } catch (err) {
    console.error('Content generation failed:', err)
    error.value = err instanceof Error ? err.message : 'Failed to generate content'
  } finally {
    isGenerating.value = false
  }
}

// Save flashcard set
const saveFlashcardSet = async () => {
  if (!canSaveFlashcards.value) return
  
  isSaving.value = true
  error.value = ''
  
  try {
    const detectedLanguage = getProcessingLanguage(selectedLanguage.value, editableText.value)
    
    // Convert GeneratedCard format to backend format
    const flashcards = generatedCards.value.map(card => ({
      question: card.q,
      answer: card.a,
      topic: card.topic || 'General'
    }))
    
    const result = await api.createFlashcardSet({
      title: setTitle.value.trim(),
      description: setDescription.value.trim() || undefined,
      language: detectedLanguage,
      flashcards
    })
    
    if (result.success) {
      success.value = `Saved "${setTitle.value}" with ${generatedCards.value.length} flashcards successfully!`
      
      // Reset flashcard form only
      setTitle.value = ''
      setDescription.value = ''
    } else {
      throw new Error(result.error || 'Failed to save flashcard set')
    }
    
  } catch (err) {
    console.error('Save flashcard set failed:', err)
    error.value = err instanceof Error ? err.message : 'Failed to save flashcard set'
  } finally {
    isSaving.value = false
  }
}

// Save study summary
const saveSummary = async () => {
  if (!canSaveSummary.value) return
  
  isSaving.value = true
  error.value = ''
  
  try {
    const detectedLanguage = getProcessingLanguage(selectedLanguage.value, editableText.value)
    
    const summaryData: CreateStudySummaryRequest = {
      title: summaryTitle.value.trim(),
      originalText: editableText.value.trim(),
      language: detectedLanguage
    }
    
    const result = await api.createStudySummary(summaryData)
    
    if (result.success) {
      success.value = `Saved summary "${summaryTitle.value}" successfully!`
      
      // Reset summary form only
      summaryTitle.value = ''
    } else {
      throw new Error(result.error || 'Failed to save summary')
    }
    
  } catch (err) {
    console.error('Save summary failed:', err)
    error.value = err instanceof Error ? err.message : 'Failed to save summary'
  } finally {
    isSaving.value = false
  }
}

// Clear all generated content and reset form
const clearAll = () => {
  generatedCards.value = []
  generatedSummary.value = ''
  keyPoints.value = []
  setTitle.value = ''
  setDescription.value = ''
  summaryTitle.value = ''
  extractedText.value = ''
  editableText.value = ''
  selectedImage.value = null
  if (imagePreviewUrl.value) {
    URL.revokeObjectURL(imagePreviewUrl.value)
    imagePreviewUrl.value = ''
  }
  error.value = ''
  success.value = ''
}

// Helper functions for key points
const getKeyPointColor = (category: KeyPoint['category']) => {
  const colors = {
    definition: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    fact: 'bg-green-100 text-green-800 border-green-300',
    concept: 'bg-blue-100 text-blue-800 border-blue-300',
    example: 'bg-orange-100 text-orange-800 border-orange-300',
    warning: 'bg-red-100 text-red-800 border-red-300'
  }
  return colors[category] || 'bg-gray-100 text-gray-800 border-gray-300'
}

const getImportanceIcon = (importance: KeyPoint['importance']) => {
  const icons = {
    high: '🔥',
    medium: '⭐',
    low: '💡'
  }
  return icons[importance] || '💡'
}

// Clear messages after some time
const clearMessage = (type: 'error' | 'success') => {
  setTimeout(() => {
    if (type === 'error') error.value = ''
    else success.value = ''
  }, 5000)
}

// Watch for error/success changes to auto-clear
watch(error, (newError) => {
  if (newError) clearMessage('error')
})

watch(success, (newSuccess) => {
  if (newSuccess) clearMessage('success')
})

// Cleanup on unmount
onUnmounted(() => {
  if (imagePreviewUrl.value) {
    URL.revokeObjectURL(imagePreviewUrl.value)
  }
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 py-8">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-900 mb-2">
          Extract Text from Images
        </h1>
        <p class="text-gray-600">
          Upload an image to extract text and generate flashcards, summaries, or both with AI
        </p>
      </div>

      <!-- File Upload Area -->
      <Card class="mb-6">
        <CardHeader>
          <CardTitle>Upload Image</CardTitle>
          <CardDescription>
            Select or drag and drop an image containing text
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div 
            class="border-2 border-dashed rounded-lg p-8 text-center transition-colors"
            :class="isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
            @drop="handleDrop"
          >
            <div class="space-y-4">
              <div class="mx-auto w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              
              <div>
                <label class="cursor-pointer">
                  <span class="text-blue-600 hover:text-blue-500 font-medium">
                    Click to select an image
                  </span>
                  <span class="text-gray-500"> or drag and drop</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    class="hidden" 
                    @change="handleFileSelect"
                  />
                </label>
                <p class="text-sm text-gray-400 mt-1">PNG, JPG, GIF up to 10MB</p>
              </div>
            </div>
          </div>

          <!-- Sample Text and Direct Input Buttons -->
          <div class="mt-4 flex justify-center space-x-4">
            <Button variant="outline" @click="useSampleText">
              📝 Use Sample Text
            </Button>
            <Button variant="outline" @click="showDirectTextInput">
              ✏️ Paste Text Directly
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- Image Preview & OCR Processing -->
      <Card v-if="selectedImage || isProcessing" class="mb-6">
        <CardHeader>
          <CardTitle>Processing Image</CardTitle>
        </CardHeader>
        <CardContent>
          <!-- Image Preview -->
          <div v-if="imagePreviewUrl" class="mb-4">
            <img 
              :src="imagePreviewUrl" 
              :alt="selectedImage?.name || 'Uploaded image'" 
              class="max-h-64 mx-auto rounded-lg shadow-sm"
            />
            <p class="text-sm text-gray-500 text-center mt-2">{{ selectedImage?.name }}</p>
          </div>

          <!-- Processing Progress -->
          <div v-if="isProcessing" class="space-y-4">
            <div class="flex items-center justify-center space-x-2">
              <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span class="text-gray-600">Extracting text...</span>
            </div>
            
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div 
                class="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                :style="{ width: `${processingProgress}%` }"
              ></div>
            </div>
            <p class="text-sm text-gray-500 text-center">{{ processingProgress }}% complete</p>
          </div>
        </CardContent>
      </Card>

      <!-- Extracted Text -->
      <Card v-if="extractedText" class="mb-6">
        <CardHeader>
          <div class="flex items-center justify-between">
            <div>
              <CardTitle>Extracted Text</CardTitle>
              <CardDescription>
                Edit the text if needed before generating flashcards
              </CardDescription>
            </div>
            <Badge>{{ extractedText.length }} characters</Badge>
          </div>
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- Text Editor -->
          <textarea
            v-model="editableText"
            class="w-full h-40 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            :placeholder="extractedText === 'Direct text input' ? 'Paste your text here... You can copy from Word documents, PDFs, websites, or any text source.' : 'Edit the extracted text if needed...'"
          />

          <!-- Language Selector -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Language:</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in languageOptions"
                :key="option.value"
                @click="selectedLanguage = option.value"
                class="flex items-center space-x-2 px-3 py-2 rounded-lg border transition-colors"
                :class="selectedLanguage === option.value 
                  ? 'border-blue-500 bg-blue-50 text-blue-700' 
                  : 'border-gray-300 hover:border-gray-400'"
              >
                <span>{{ option.flag }}</span>
                <span class="text-sm font-medium">{{ option.label }}</span>
              </button>
            </div>
          </div>

          <!-- Generation Mode Selector -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">What to generate:</label>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                v-for="mode in generationModeOptions"
                :key="mode.value"
                @click="generationMode = mode.value"
                class="flex flex-col items-center p-4 rounded-lg border transition-colors text-center"
                :class="generationMode === mode.value 
                  ? 'border-blue-500 bg-blue-50 text-blue-700' 
                  : 'border-gray-300 hover:border-gray-400'"
              >
                <span class="text-2xl mb-2">{{ mode.icon }}</span>
                <span class="text-sm font-medium mb-1">{{ mode.label }}</span>
                <span class="text-xs text-gray-500">{{ mode.description }}</span>
              </button>
            </div>
          </div>

          <!-- Validation Message -->
          <div v-if="!textValidation.valid" class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p class="text-sm text-yellow-800">{{ textValidation.message }}</p>
          </div>

          <!-- Generate Button -->
          <Button 
            @click="generateContent" 
            :disabled="!canGenerate"
            class="w-full"
            size="lg"
          >
            <span v-if="isGenerating" class="flex items-center">
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Generating {{ generationMode === 'both' ? 'Content' : generationMode === 'flashcards' ? 'Flashcards' : 'Summary' }}...
            </span>
            <span v-else>
              {{ generationModeOptions.find(m => m.value === generationMode)?.icon }} 
              Generate {{ generationMode === 'both' ? 'Both' : generationMode === 'flashcards' ? 'Flashcards' : 'Summary' }}
            </span>
          </Button>
        </CardContent>
      </Card>

      <!-- Generated Content -->
      <div v-if="hasGeneratedContent" class="space-y-6">
        
        <!-- Generated Summary -->
        <Card v-if="generatedSummary">
          <CardHeader>
            <CardTitle>Generated Summary</CardTitle>
            <CardDescription>
              AI-organized study notes with highlighted key points
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-6">
            <!-- Summary Text -->
            <div class="prose prose-sm max-w-none">
              <div v-html="generatedSummary.replace(/\n/g, '<br>')" 
                   class="text-gray-900 leading-relaxed whitespace-pre-wrap" />
            </div>

            <!-- Key Points -->
            <div v-if="keyPoints.length > 0">
              <h3 class="text-lg font-semibold text-gray-900 mb-3">
                Key Points ({{ keyPoints.length }})
              </h3>
              <div class="space-y-2">
                <div 
                  v-for="(point, index) in keyPoints" 
                  :key="index"
                  :class="getKeyPointColor(point.category)"
                  class="px-3 py-2 rounded-lg border text-sm flex items-center justify-between"
                >
                  <span class="flex items-center space-x-2">
                    <span>{{ getImportanceIcon(point.importance) }}</span>
                    <span class="font-medium">{{ point.text }}</span>
                  </span>
                  <div class="flex items-center space-x-1">
                    <Badge variant="outline" class="text-xs">{{ point.category }}</Badge>
                    <Badge variant="outline" class="text-xs">{{ point.importance }}</Badge>
                  </div>
                </div>
              </div>
            </div>

            <!-- Save Summary Form -->
            <div class="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h3 class="font-medium text-blue-900 mb-3">Save This Summary</h3>
              <div class="space-y-3">
                <Input
                  v-model="summaryTitle"
                  placeholder="Enter a title for your summary..."
                  class="bg-white"
                />
                
                <Button 
                  @click="saveSummary" 
                  :disabled="!canSaveSummary"
                  class="w-full"
                >
                  <span v-if="isSaving" class="flex items-center">
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </span>
                  <span v-else>💾 Save Summary</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Generated Cards -->
        <Card v-if="generatedCards.length > 0">
          <CardHeader>
            <CardTitle>Generated Flashcards ({{ generatedCards.length }})</CardTitle>
            <CardDescription>
              Review and save your flashcards
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-6">
            <!-- Save Form -->
            <div class="bg-gray-50 p-4 rounded-lg space-y-4">
              <h3 class="font-medium text-gray-900">Save These Cards</h3>
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    Title *
                  </label>
                  <Input
                    v-model="setTitle"
                    placeholder="Enter a title for your flashcard set"
                    required
                  />
                </div>
                
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <Input
                    v-model="setDescription"
                    placeholder="Add a description (optional)"
                  />
                </div>
              </div>
              
              <Button 
                @click="saveFlashcardSet" 
                :disabled="!canSaveFlashcards"
                class="w-full"
              >
                <span v-if="isSaving" class="flex items-center">
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </span>
                <span v-else>💾 Save Flashcard Set</span>
              </Button>
            </div>

            <!-- Cards Display -->
            <div class="grid gap-4">
              <Card 
                v-for="(card, index) in generatedCards" 
                :key="index"
                class="p-4"
              >
                <div class="flex items-start justify-between mb-3">
                  <Badge variant="secondary">#{{ index + 1 }}</Badge>
                  <div class="flex space-x-2">
                    <Badge v-if="card.topic" variant="outline">{{ card.topic }}</Badge>
                    <Badge 
                      v-if="card.difficulty" 
                      :class="{
                        'bg-green-100 text-green-800': card.difficulty === 'easy',
                        'bg-yellow-100 text-yellow-800': card.difficulty === 'medium', 
                        'bg-red-100 text-red-800': card.difficulty === 'hard'
                      }"
                    >
                      {{ card.difficulty }}
                    </Badge>
                  </div>
                </div>
                
                <div class="space-y-3">
                  <div>
                    <p class="text-sm font-medium text-blue-700 mb-1">Question:</p>
                    <p class="text-gray-900">{{ card.q }}</p>
                  </div>
                  
                  <div class="pt-3 border-t border-gray-200">
                    <p class="text-sm font-medium text-green-700 mb-1">Answer:</p>
                    <p class="text-gray-900">{{ card.a }}</p>
                  </div>
                </div>
              </Card>
            </div>
          </CardContent>
        </Card>

        <!-- Action Buttons -->
        <div class="flex justify-center space-x-4">
          <Button @click="clearAll" variant="outline">
            🗑️ Clear All
          </Button>
          <Button @click="$router.push('/my-cards')" variant="outline" v-if="generatedCards.length > 0">
            🃏 View My Cards
          </Button>
          <Button @click="$router.push('/my-summaries')" variant="outline" v-if="generatedSummary">
            📚 View My Summaries
          </Button>
        </div>
      </div>

      <!-- Messages -->
      <div v-if="error" class="mb-6">
        <div class="bg-red-50 border border-red-200 rounded-lg p-4">
          <div class="flex">
            <svg class="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="text-sm text-red-700">{{ error }}</p>
          </div>
        </div>
      </div>

      <div v-if="success" class="mb-6">
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <div class="flex">
            <svg class="w-5 h-5 text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="text-sm text-green-700">{{ success }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>