<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import type { StudySummary, KeyPoint } from '~/lib/schemas'

interface Props {
  summary: StudySummary
  showActions?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showActions: true
})

const emit = defineEmits<{
  edit: [summary: StudySummary]
  delete: [summary: StudySummary]
  generateFlashcards: [summary: StudySummary]
}>()

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

// Create highlighted text by replacing key points in the original text
const highlightedOriginalText = computed(() => {
  let text = props.summary.originalText
  
  // Sort key points by start position (descending) to avoid index shifting
  const sortedKeyPoints = [...props.summary.keyPoints].sort((a, b) => b.startPos - a.startPos)
  
  // Replace each key point with highlighted version
  sortedKeyPoints.forEach(point => {
    const beforeText = text.substring(0, point.startPos)
    const keyText = text.substring(point.startPos, point.endPos)
    const afterText = text.substring(point.endPos)
    
    const colorClass = getKeyPointColor(point.category)
    const highlightedText = `<mark class="px-1 rounded ${colorClass}" title="${point.category} - ${point.importance} importance">${keyText}</mark>`
    
    text = beforeText + highlightedText + afterText
  })
  
  return text.replace(/\n/g, '<br>')
})

// Format creation date
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Group key points by importance
const groupedKeyPoints = computed(() => {
  const groups = {
    high: props.summary.keyPoints.filter(p => p.importance === 'high'),
    medium: props.summary.keyPoints.filter(p => p.importance === 'medium'),
    low: props.summary.keyPoints.filter(p => p.importance === 'low')
  }
  return groups
})
</script>

<template>
  <div class="space-y-6">
    <!-- Summary Header -->
    <Card>
      <CardHeader>
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <CardTitle class="text-2xl">{{ summary.title }}</CardTitle>
            <CardDescription class="mt-2">
              Created {{ formatDate(summary.createdAt) }} • {{ summary.language }}
            </CardDescription>
          </div>
          
          <!-- Action Buttons -->
          <div v-if="showActions" class="flex space-x-2">
            <Button 
              @click="emit('generateFlashcards', summary)" 
              variant="outline" 
              size="sm"
              v-if="!summary.flashcardSetId"
            >
              🃏 Generate Cards
            </Button>
            <Button @click="emit('edit', summary)" variant="outline" size="sm">
              ✏️ Edit
            </Button>
            <Button @click="emit('delete', summary)" variant="outline" size="sm">
              🗑️ Delete
            </Button>
          </div>
        </div>
      </CardHeader>
    </Card>

    <!-- AI Generated Summary -->
    <Card>
      <CardHeader>
        <CardTitle>AI Summary</CardTitle>
        <CardDescription>
          Organized overview of your study material
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="prose prose-sm max-w-none">
          <div v-html="summary.summary.replace(/\n/g, '<br>')" 
               class="text-gray-900 leading-relaxed whitespace-pre-wrap" />
        </div>
      </CardContent>
    </Card>

    <!-- Key Points by Importance -->
    <Card v-if="summary.keyPoints.length > 0">
      <CardHeader>
        <CardTitle>Key Points ({{ summary.keyPoints.length }})</CardTitle>
        <CardDescription>
          Important concepts organized by priority
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- High Importance -->
        <div v-if="groupedKeyPoints.high.length > 0">
          <h3 class="text-sm font-semibold text-red-700 mb-2 flex items-center">
            🔥 High Priority ({{ groupedKeyPoints.high.length }})
          </h3>
          <div class="space-y-2">
            <div 
              v-for="(point, index) in groupedKeyPoints.high" 
              :key="index"
              :class="getKeyPointColor(point.category)"
              class="px-3 py-2 rounded-lg border text-sm flex items-center justify-between"
            >
              <span class="flex items-center space-x-2">
                <span>🔥</span>
                <span class="font-medium">{{ point.text }}</span>
              </span>
              <Badge variant="outline" class="text-xs">{{ point.category }}</Badge>
            </div>
          </div>
        </div>

        <!-- Medium Importance -->
        <div v-if="groupedKeyPoints.medium.length > 0">
          <h3 class="text-sm font-semibold text-yellow-700 mb-2 flex items-center">
            ⭐ Medium Priority ({{ groupedKeyPoints.medium.length }})
          </h3>
          <div class="space-y-2">
            <div 
              v-for="(point, index) in groupedKeyPoints.medium" 
              :key="index"
              :class="getKeyPointColor(point.category)"
              class="px-3 py-2 rounded-lg border text-sm flex items-center justify-between"
            >
              <span class="flex items-center space-x-2">
                <span>⭐</span>
                <span class="font-medium">{{ point.text }}</span>
              </span>
              <Badge variant="outline" class="text-xs">{{ point.category }}</Badge>
            </div>
          </div>
        </div>

        <!-- Low Importance -->
        <div v-if="groupedKeyPoints.low.length > 0">
          <h3 class="text-sm font-semibold text-blue-700 mb-2 flex items-center">
            💡 Additional Notes ({{ groupedKeyPoints.low.length }})
          </h3>
          <div class="space-y-2">
            <div 
              v-for="(point, index) in groupedKeyPoints.low" 
              :key="index"
              :class="getKeyPointColor(point.category)"
              class="px-3 py-2 rounded-lg border text-sm flex items-center justify-between"
            >
              <span class="flex items-center space-x-2">
                <span>💡</span>
                <span class="font-medium">{{ point.text }}</span>
              </span>
              <Badge variant="outline" class="text-xs">{{ point.category }}</Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Original Text with Highlighting -->
    <Card>
      <CardHeader>
        <CardTitle>Original Text with Highlights</CardTitle>
        <CardDescription>
          Your source material with key points highlighted
        </CardDescription>
      </CardHeader>
      <CardContent>
        <!-- Legend -->
        <div class="mb-4 p-3 bg-gray-50 rounded-lg">
          <h4 class="text-sm font-semibold text-gray-700 mb-2">Color Legend:</h4>
          <div class="flex flex-wrap gap-2 text-xs">
            <span class="px-2 py-1 rounded bg-yellow-100 text-yellow-800 border border-yellow-300">
              Definition
            </span>
            <span class="px-2 py-1 rounded bg-green-100 text-green-800 border border-green-300">
              Fact
            </span>
            <span class="px-2 py-1 rounded bg-blue-100 text-blue-800 border border-blue-300">
              Concept
            </span>
            <span class="px-2 py-1 rounded bg-orange-100 text-orange-800 border border-orange-300">
              Example
            </span>
            <span class="px-2 py-1 rounded bg-red-100 text-red-800 border border-red-300">
              Warning
            </span>
          </div>
        </div>

        <!-- Highlighted Text -->
        <div class="prose prose-sm max-w-none">
          <div 
            v-html="highlightedOriginalText" 
            class="text-gray-900 leading-relaxed whitespace-pre-wrap text-justify"
          />
        </div>
      </CardContent>
    </Card>

    <!-- Linked Flashcard Set -->
    <Card v-if="summary.flashcardSetId && summary.flashcardSet">
      <CardHeader>
        <CardTitle>Generated Flashcards</CardTitle>
        <CardDescription>
          Flashcards created from this summary
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div>
            <h3 class="font-medium text-blue-900">{{ summary.flashcardSet.title }}</h3>
            <p class="text-sm text-blue-700">
              {{ summary.flashcardSet.flashcards?.length || 0 }} cards available
            </p>
          </div>
          <Button @click="$router.push(`/study-session?setId=${summary.flashcardSetId}`)" size="sm">
            📚 Study Cards
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<style scoped>
/* Custom styles for highlighted text */
:deep(mark) {
  background: transparent;
}
</style>