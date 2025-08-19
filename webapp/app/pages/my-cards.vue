<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog'
import { api } from '~/lib/api'
import type { FlashcardSet, Flashcard } from '~/lib/schemas'

definePageMeta({
  middleware: 'auth'
})

// Reactive state
const flashcardSets = ref<FlashcardSet[]>([])
const loading = ref(true)
const error = ref('')
const searchQuery = ref('')
const selectedSet = ref<FlashcardSet | null>(null)
const editDialogOpen = ref(false)

// Form state for editing
const editForm = ref({
  title: '',
  description: '',
})

// Computed
const filteredSets = computed(() => {
  if (!searchQuery.value.trim()) return flashcardSets.value
  
  const query = searchQuery.value.toLowerCase()
  return flashcardSets.value.filter(set => 
    set.title.toLowerCase().includes(query) ||
    set.description?.toLowerCase().includes(query) ||
    set.language?.toLowerCase().includes(query)
  )
})

const totalCards = computed(() => 
  flashcardSets.value.reduce((sum, set) => sum + (set.flashcards?.length || 0), 0)
)

// Methods
const loadFlashcardSets = async () => {
  try {
    loading.value = true
    error.value = ''
    
    const response = await api.getFlashcardSets()
    flashcardSets.value = response || []
  } catch (err: any) {
    console.error('Error loading flashcard sets:', err)
    error.value = err.message || 'Failed to load flashcard sets'
  } finally {
    loading.value = false
  }
}

const openEditDialog = (set: FlashcardSet) => {
  selectedSet.value = set
  editForm.value = {
    title: set.title,
    description: set.description || ''
  }
  editDialogOpen.value = true
}

const saveSetChanges = async () => {
  if (!selectedSet.value) return
  
  try {
    const updatedSet = await api.updateFlashcardSet(selectedSet.value.id, {
      title: editForm.value.title.trim(),
      description: editForm.value.description.trim() || undefined
    })
    
    // Update the set in our local array
    const index = flashcardSets.value.findIndex(s => s.id === selectedSet.value!.id)
    if (index !== -1) {
      flashcardSets.value[index] = updatedSet
    }
    
    editDialogOpen.value = false
    selectedSet.value = null
  } catch (err: any) {
    console.error('Error updating flashcard set:', err)
    error.value = err.message || 'Failed to update flashcard set'
  }
}

const deleteSet = async (setId: string) => {
  if (!confirm('Are you sure you want to delete this flashcard set? This action cannot be undone.')) {
    return
  }
  
  try {
    await api.deleteFlashcardSet(setId)
    flashcardSets.value = flashcardSets.value.filter(s => s.id !== setId)
  } catch (err: any) {
    console.error('Error deleting flashcard set:', err)
    error.value = err.message || 'Failed to delete flashcard set'
  }
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

onMounted(() => {
  loadFlashcardSets()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <div class="flex items-center space-x-4">
            <div class="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
              <span class="text-white font-bold text-sm">📚</span>
            </div>
            <h1 class="text-xl font-semibold text-gray-900">My Cards</h1>
          </div>
          
          <div class="flex items-center space-x-4">
            <Button as-child variant="default">
              <NuxtLink to="/ocr">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Create New Set
              </NuxtLink>
            </Button>
            
            <Button as-child variant="outline">
              <NuxtLink to="/dashboard">Dashboard</NuxtLink>
            </Button>
          </div>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Stats and Search -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <!-- Stats Cards -->
        <Card>
          <CardContent class="p-6">
            <div class="flex items-center">
              <div class="p-2 bg-blue-100 rounded-lg">
                <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-600">Total Sets</p>
                <p class="text-2xl font-bold text-gray-900">{{ flashcardSets.length }}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="p-6">
            <div class="flex items-center">
              <div class="p-2 bg-green-100 rounded-lg">
                <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-600">Total Cards</p>
                <p class="text-2xl font-bold text-gray-900">{{ totalCards }}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Search -->
        <div class="md:col-span-2">
          <Card>
            <CardContent class="p-6">
              <div class="relative">
                <svg class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" 
                     fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <Input 
                  v-model="searchQuery"
                  placeholder="Search flashcard sets..."
                  class="pl-10"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="text-center">
          <svg class="animate-spin h-8 w-8 text-blue-600 mx-auto mb-4" 
               xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" 
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p class="text-gray-600">Loading your flashcard sets...</p>
        </div>
      </div>

      <!-- Error State -->
      <div v-if="error" class="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
        <div class="flex">
          <svg class="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="text-sm text-red-700">{{ error }}</p>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="!loading && filteredSets.length === 0 && !error" class="text-center py-12">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900">
          {{ searchQuery ? 'No matching sets found' : 'No flashcard sets' }}
        </h3>
        <p class="mt-1 text-sm text-gray-500">
          {{ searchQuery ? 'Try adjusting your search terms.' : 'Get started by creating your first flashcard set.' }}
        </p>
        <div class="mt-6" v-if="!searchQuery">
          <Button as-child>
            <NuxtLink to="/ocr">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              Create Your First Set
            </NuxtLink>
          </Button>
        </div>
      </div>

      <!-- Flashcard Sets Grid -->
      <div v-else-if="!loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card v-for="set in filteredSets" :key="set.id" class="hover:shadow-lg transition-shadow">
          <CardHeader>
            <div class="flex justify-between items-start">
              <div class="flex-1 min-w-0">
                <CardTitle class="text-lg font-semibold text-gray-900 truncate">
                  {{ set.title }}
                </CardTitle>
                <CardDescription v-if="set.description" class="mt-1">
                  {{ set.description }}
                </CardDescription>
              </div>
              
              <div class="flex items-center space-x-1 ml-2">
                <!-- Edit button -->
                <Button variant="ghost" size="sm" @click="openEditDialog(set)">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </Button>
                
                <!-- Delete button -->
                <Button variant="ghost" size="sm" @click="deleteSet(set.id)" class="text-red-600 hover:text-red-700">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </Button>
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            <div class="space-y-3">
              <!-- Set Stats -->
              <div class="flex items-center space-x-4 text-sm text-gray-500">
                <span class="flex items-center">
                  <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {{ set.flashcards?.length || 0 }} cards
                </span>
                
                <span v-if="set.language" class="flex items-center">
                  <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                  {{ set.language }}
                </span>
              </div>
              
              <!-- Creation date -->
              <p class="text-xs text-gray-400">
                Created {{ formatDate(set.createdAt) }}
              </p>
              
              <!-- Action Buttons -->
              <div class="space-y-2 pt-2">
                <div class="flex space-x-2">
                  <Button as-child variant="default" size="sm" class="flex-1">
                    <NuxtLink :to="`/study-session?setId=${set.id}&mode=normal`">
                      <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      Study
                    </NuxtLink>
                  </Button>
                  
                  <Button as-child variant="outline" size="sm" class="flex-1">
                    <NuxtLink :to="`/study-session?setId=${set.id}&mode=exam`">
                      <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Exam
                    </NuxtLink>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>

    <!-- Edit Dialog -->
    <Dialog v-model:open="editDialogOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Flashcard Set</DialogTitle>
        </DialogHeader>
        
        <div class="space-y-4 py-4">
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-700">Title</label>
            <Input v-model="editForm.title" placeholder="Enter set title" />
          </div>
          
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-700">Description</label>
            <Input v-model="editForm.description" placeholder="Enter description (optional)" />
          </div>
        </div>
        
        <div class="flex justify-end space-x-2 pt-4">
          <Button variant="outline" @click="editDialogOpen = false">Cancel</Button>
          <Button @click="saveSetChanges">Save Changes</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>