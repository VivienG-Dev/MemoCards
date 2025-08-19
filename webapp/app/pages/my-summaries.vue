<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '~/components/ui/dialog'
import SummaryViewer from '~/components/SummaryViewer.vue'
import { api } from '~/lib/api'
import type { StudySummary } from '~/lib/schemas'

definePageMeta({
  middleware: 'auth'
})

// Reactive state
const router = useRouter()
const summaries = ref<StudySummary[]>([])
const isLoading = ref(true)
const searchQuery = ref<string>('')
const selectedSummary = ref<StudySummary | null>(null)
const showViewDialog = ref(false)
const showDeleteDialog = ref(false)
const summaryToDelete = ref<StudySummary | null>(null)
const isDeleting = ref(false)
const error = ref<string>('')
const success = ref<string>('')

// Computed
const filteredSummaries = computed(() => {
  if (!searchQuery.value.trim()) {
    return summaries.value
  }
  
  const query = searchQuery.value.toLowerCase()
  return summaries.value.filter(summary => 
    summary.title.toLowerCase().includes(query) ||
    summary.originalText.toLowerCase().includes(query) ||
    summary.summary.toLowerCase().includes(query)
  )
})

const sortedSummaries = computed(() => {
  return [...filteredSummaries.value].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
})

// Methods
const loadSummaries = async () => {
  isLoading.value = true
  error.value = ''
  
  try {
    const result = await api.getStudySummaries()
    
    if (result.success && result.data) {
      summaries.value = result.data
    } else {
      throw new Error(result.error || 'Failed to load summaries')
    }
  } catch (err) {
    console.error('Failed to load summaries:', err)
    error.value = err instanceof Error ? err.message : 'Failed to load summaries'
  } finally {
    isLoading.value = false
  }
}

const viewSummary = (summary: StudySummary) => {
  selectedSummary.value = summary
  showViewDialog.value = true
}

const editSummary = (summary: StudySummary) => {
  // Navigate to edit page (could be the same as create page with edit mode)
  router.push(`/summary-create?edit=${summary.id}`)
}

const confirmDelete = (summary: StudySummary) => {
  summaryToDelete.value = summary
  showDeleteDialog.value = true
}

const deleteSummary = async () => {
  if (!summaryToDelete.value) return
  
  isDeleting.value = true
  error.value = ''
  
  try {
    const result = await api.deleteStudySummary(summaryToDelete.value.id)
    
    if (result.success) {
      summaries.value = summaries.value.filter(s => s.id !== summaryToDelete.value!.id)
      success.value = `Summary "${summaryToDelete.value.title}" deleted successfully`
      showDeleteDialog.value = false
      summaryToDelete.value = null
    } else {
      throw new Error(result.error || 'Failed to delete summary')
    }
  } catch (err) {
    console.error('Failed to delete summary:', err)
    error.value = err instanceof Error ? err.message : 'Failed to delete summary'
  } finally {
    isDeleting.value = false
  }
}

const generateFlashcards = async (summary: StudySummary) => {
  try {
    // Navigate to OCR page with pre-filled text to generate flashcards
    router.push({
      path: '/ocr',
      query: {
        text: summary.originalText,
        mode: 'flashcards',
        title: `${summary.title} - Flashcards`
      }
    })
  } catch (err) {
    console.error('Failed to navigate to flashcard generation:', err)
    error.value = 'Failed to generate flashcards'
  }
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const getKeyPointStats = (summary: StudySummary) => {
  const stats = {
    high: summary.keyPoints.filter(p => p.importance === 'high').length,
    medium: summary.keyPoints.filter(p => p.importance === 'medium').length,
    low: summary.keyPoints.filter(p => p.importance === 'low').length,
    total: summary.keyPoints.length
  }
  return stats
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

// Load summaries on mount
onMounted(() => {
  loadSummaries()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 py-8">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-900 mb-2">
          My Study Summaries
        </h1>
        <p class="text-gray-600">
          Manage your AI-generated study notes and highlighted summaries
        </p>
      </div>

      <!-- Actions Bar -->
      <div class="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
        <!-- Search -->
        <div class="flex-1 max-w-md">
          <Input
            v-model="searchQuery"
            placeholder="Search summaries..."
            class="w-full"
          />
        </div>
        
        <!-- Create New Button -->
        <Button @click="router.push('/summary-create')" class="whitespace-nowrap">
          📝 Create New Summary
        </Button>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="text-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p class="text-gray-600">Loading your summaries...</p>
      </div>

      <!-- Empty State -->
      <Card v-else-if="summaries.length === 0" class="text-center py-12">
        <CardContent>
          <div class="text-6xl mb-4">📚</div>
          <h3 class="text-lg font-medium text-gray-900 mb-2">No summaries yet</h3>
          <p class="text-gray-600 mb-6">
            Create your first AI-powered study summary to get started
          </p>
          <div class="space-x-4">
            <Button @click="router.push('/summary-create')">
              📝 Create Summary
            </Button>
            <Button @click="router.push('/ocr')" variant="outline">
              📷 Extract from Image
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- Summaries Grid -->
      <div v-else-if="sortedSummaries.length > 0" class="grid gap-6">
        <Card 
          v-for="summary in sortedSummaries" 
          :key="summary.id"
          class="hover:shadow-lg transition-shadow cursor-pointer"
          @click="viewSummary(summary)"
        >
          <CardHeader>
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <CardTitle class="text-lg">{{ summary.title }}</CardTitle>
                <CardDescription class="mt-1">
                  Created {{ formatDate(summary.createdAt) }} • {{ summary.language }}
                </CardDescription>
              </div>
              
              <div class="flex items-center space-x-2" @click.stop>
                <Button @click="generateFlashcards(summary)" variant="outline" size="sm" v-if="!summary.flashcardSetId">
                  🃏 Cards
                </Button>
                <Button @click="editSummary(summary)" variant="outline" size="sm">
                  ✏️ Edit
                </Button>
                <Button @click="confirmDelete(summary)" variant="outline" size="sm">
                  🗑️
                </Button>
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            <!-- Summary Preview -->
            <div class="mb-4">
              <p class="text-gray-700 text-sm line-clamp-3">
                {{ summary.summary }}
              </p>
            </div>

            <!-- Key Points Stats -->
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <Badge v-if="getKeyPointStats(summary).high > 0" class="bg-red-100 text-red-800">
                  🔥 {{ getKeyPointStats(summary).high }}
                </Badge>
                <Badge v-if="getKeyPointStats(summary).medium > 0" class="bg-yellow-100 text-yellow-800">
                  ⭐ {{ getKeyPointStats(summary).medium }}
                </Badge>
                <Badge v-if="getKeyPointStats(summary).low > 0" class="bg-blue-100 text-blue-800">
                  💡 {{ getKeyPointStats(summary).low }}
                </Badge>
              </div>
              
              <div class="text-sm text-gray-500">
                {{ getKeyPointStats(summary).total }} key points
              </div>
            </div>

            <!-- Linked Flashcard Set -->
            <div v-if="summary.flashcardSetId" class="mt-3">
              <Badge variant="outline" class="bg-green-50 text-green-700">
                🃏 Has flashcards
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- No Search Results -->
      <Card v-else class="text-center py-12">
        <CardContent>
          <div class="text-4xl mb-4">🔍</div>
          <h3 class="text-lg font-medium text-gray-900 mb-2">No summaries found</h3>
          <p class="text-gray-600">
            Try adjusting your search terms or create a new summary
          </p>
        </CardContent>
      </Card>

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

    <!-- View Summary Dialog -->
    <Dialog v-model:open="showViewDialog">
      <DialogContent class="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>View Summary</DialogTitle>
          <DialogDescription>
            Review your AI-generated study summary with highlighted key points
          </DialogDescription>
        </DialogHeader>
        
        <SummaryViewer 
          v-if="selectedSummary" 
          :summary="selectedSummary"
          @edit="editSummary"
          @delete="confirmDelete"
          @generate-flashcards="generateFlashcards"
        />
        
        <DialogFooter>
          <Button @click="showViewDialog = false" variant="outline">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete Confirmation Dialog -->
    <Dialog v-model:open="showDeleteDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Summary</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{{ summaryToDelete?.title }}"? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        
        <DialogFooter>
          <Button @click="showDeleteDialog = false" variant="outline" :disabled="isDeleting">
            Cancel
          </Button>
          <Button @click="deleteSummary" variant="destructive" :disabled="isDeleting">
            <span v-if="isDeleting" class="flex items-center">
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Deleting...
            </span>
            <span v-else>Delete</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>