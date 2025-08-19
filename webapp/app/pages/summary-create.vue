<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { api } from '~/lib/api'
import type { CreateStudySummaryRequest, KeyPoint } from '~/lib/schemas'

definePageMeta({
  middleware: 'auth'
})

// Reactive state
const router = useRouter()
const originalText = ref<string>('')
const title = ref<string>('')
const language = ref<'English' | 'French'>('English')
const isGenerating = ref(false)
const isSaving = ref(false)
const error = ref<string>('')
const success = ref<string>('')

// Generated summary data
const generatedSummary = ref<string>('')
const keyPoints = ref<KeyPoint[]>([])
const hasGenerated = ref(false)

// Computed
const textLength = computed(() => originalText.value.length)
const canGenerate = computed(() => 
  originalText.value.trim().length >= 50 && 
  originalText.value.trim().length <= 50000 && 
  !isGenerating.value
)
const canSave = computed(() => 
  hasGenerated.value && 
  title.value.trim().length > 0 && 
  !isSaving.value
)

// Language options
const languageOptions = [
  { value: 'English', label: 'English', flag: '🇺🇸' },
  { value: 'French', label: 'Français', flag: '🇫🇷' }
] as const

// Methods
const generateSummary = async () => {
  if (!canGenerate.value) return
  
  isGenerating.value = true
  error.value = ''
  
  try {
    const result = await api.generateSummary({
      text: originalText.value.trim(),
      language: language.value
    })
    
    if (result.success && result.data) {
      generatedSummary.value = result.data.summary
      keyPoints.value = result.data.keyPoints
      hasGenerated.value = true
      success.value = `Generated summary with ${result.data.keyPoints.length} key points!`
    } else {
      throw new Error(result.error || 'Failed to generate summary')
    }
    
  } catch (err) {
    console.error('Summary generation failed:', err)
    error.value = err instanceof Error ? err.message : 'Failed to generate summary'
  } finally {
    isGenerating.value = false
  }
}

const saveSummary = async () => {
  if (!canSave.value) return
  
  isSaving.value = true
  error.value = ''
  
  try {
    const summaryData: CreateStudySummaryRequest = {
      title: title.value.trim(),
      originalText: originalText.value.trim(),
      language: language.value
    }
    
    const result = await api.createStudySummary(summaryData)
    
    if (result.success && result.data) {
      success.value = `Summary "${title.value}" saved successfully!`
      
      // Redirect to the saved summary after a short delay
      setTimeout(() => {
        router.push(`/my-summaries`)
      }, 2000)
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

const clearForm = () => {
  originalText.value = ''
  title.value = ''
  generatedSummary.value = ''
  keyPoints.value = []
  hasGenerated.value = false
  error.value = ''
  success.value = ''
}

const loadSampleText = () => {
  originalText.value = `Sword Art Online

Kirito se retrouve livré à lui-même après s'être réveillé dans l'Underworld, un mystérieux monde virtuel. Incapable de rejoindre la réalité, il fait la connaissance d'Eugeo, un jeune habitant du village de Rulid rongé par les remords suite à la disparition de son amie d'enfance, Alice. À la recherche de réponses et d'une porte de sortie, les deux garçons se lancent dans une périlleuse quête aux enjeux bien plus importants qu'ils ne pouvaient l'imaginer. Quels secrets les habitants de l'Underworld abritent-ils ? Que cachent les Chevaliers Intègres, gardiens de l'ordre et de la paix dévoués corps et âme au Monde des Hommes ? Et que se trame-t-il donc dans la réalité ? La plus grande épopée de l'épéiste noir n'en est qu'à son commencement.`
  
  language.value = 'French'
  title.value = 'SAO Underworld Summary'
}

// Get color class for key point category
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

// Get importance icon
const getImportanceIcon = (importance: KeyPoint['importance']) => {
  const icons = {
    high: '🔥',
    medium: '⭐',
    low: '💡'
  }
  return icons[importance] || '💡'
}

// Auto-clear messages after some time
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
</script>

<template>
  <div class="min-h-screen bg-gray-50 py-8">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-900 mb-2">
          Create Study Summary
        </h1>
        <p class="text-gray-600">
          Transform your study materials into organized, highlighted summaries with AI
        </p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Left Column - Input -->
        <div class="space-y-6">
          <!-- Text Input -->
          <Card>
            <CardHeader>
              <CardTitle>Study Material</CardTitle>
              <CardDescription>
                Paste your text or notes here (50-50,000 characters)
              </CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              <!-- Sample Text Button -->
              <div class="flex justify-center">
                <Button variant="outline" @click="loadSampleText" size="sm">
                  📝 Load Sample Text
                </Button>
              </div>

              <!-- Text Area -->
              <div class="relative">
                <textarea
                  v-model="originalText"
                  class="w-full h-80 p-4 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Paste your study material here... You can copy from Word documents, PDFs, or any text source."
                />
                <div class="absolute bottom-2 right-2 text-xs text-gray-500">
                  {{ textLength.toLocaleString() }} / 50,000
                </div>
              </div>

              <!-- Language Selector -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Language:</label>
                <div class="flex gap-2">
                  <button
                    v-for="option in languageOptions"
                    :key="option.value"
                    @click="language = option.value"
                    class="flex items-center space-x-2 px-3 py-2 rounded-lg border transition-colors"
                    :class="language === option.value 
                      ? 'border-blue-500 bg-blue-50 text-blue-700' 
                      : 'border-gray-300 hover:border-gray-400'"
                  >
                    <span>{{ option.flag }}</span>
                    <span class="text-sm font-medium">{{ option.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Generate Button -->
              <Button 
                @click="generateSummary" 
                :disabled="!canGenerate"
                class="w-full"
                size="lg"
              >
                <span v-if="isGenerating" class="flex items-center">
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Generating Summary...
                </span>
                <span v-else>🧠 Generate AI Summary</span>
              </Button>

              <!-- Validation Messages -->
              <div v-if="textLength < 50 && textLength > 0" class="text-sm text-yellow-600">
                ⚠️ Text is too short. Need at least 50 characters.
              </div>
              <div v-if="textLength > 50000" class="text-sm text-red-600">
                ❌ Text is too long. Maximum 50,000 characters.
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- Right Column - Output -->
        <div class="space-y-6">
          <!-- Generated Summary -->
          <Card v-if="hasGenerated">
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

              <!-- Save Form -->
              <div class="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 class="font-medium text-blue-900 mb-3">Save This Summary</h3>
                <div class="space-y-3">
                  <Input
                    v-model="title"
                    placeholder="Enter a title for your summary..."
                    class="bg-white"
                  />
                  
                  <Button 
                    @click="saveSummary" 
                    :disabled="!canSave"
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

          <!-- Empty State -->
          <Card v-else class="border-dashed border-2 border-gray-300">
            <CardContent class="py-12 text-center">
              <div class="text-6xl mb-4">🧠</div>
              <h3 class="text-lg font-medium text-gray-900 mb-2">Ready to Generate</h3>
              <p class="text-gray-600">
                Enter your study material on the left and click "Generate AI Summary" to create an organized summary with highlighted key points.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <!-- Action Buttons -->
      <div v-if="hasGenerated" class="flex justify-center mt-8 space-x-4">
        <Button @click="clearForm" variant="outline">
          🗑️ Clear All
        </Button>
        <Button @click="router.push('/my-summaries')" variant="outline">
          📚 View My Summaries
        </Button>
      </div>

      <!-- Messages -->
      <div v-if="error" class="mt-6">
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

      <div v-if="success" class="mt-6">
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