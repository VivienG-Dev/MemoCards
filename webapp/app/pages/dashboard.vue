<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { api } from "@/lib/api";
import type { FlashcardSet, StudySummary } from "@/lib/schemas";

definePageMeta({
  middleware: "auth",
});

const { user, logout } = useAuth();

const flashcardSets = ref<FlashcardSet[]>([]);
const summaries = ref<StudySummary[]>([]);
const loading = ref(true);
const error = ref("");

// const { getRecentSessions, getTodaysStudyTime, getWeeklyProgress } = useStudySessions()

// const recentSessions = ref<any[]>([])
// const todaysStudyTime = ref(0)
// const weeklyProgress = ref<any[]>([])

const stats = computed(() => {
  const totalSets = flashcardSets.value.length;
  const totalCards = flashcardSets.value.reduce(
    (sum, set) => sum + (set.flashcards?.length || 0),
    0
  );
  const totalSummaries = summaries.value.length;
  const totalKeyPoints = summaries.value.reduce(
    (sum, summary) => sum + (summary.keyPoints?.length || 0),
    0
  );
  
  // TODO: Implement real analytics
  const studiedToday = 0;

  return {
    totalSets,
    totalCards,
    totalSummaries,
    totalKeyPoints,
    studiedToday,
  };
});

// const loadAnalytics = async () => {
//   try {
//     recentSessions.value = await getRecentSessions(5)
//     todaysStudyTime.value = await getTodaysStudyTime()
//     weeklyProgress.value = await getWeeklyProgress()
//   } catch (err) {
//     console.error('Error loading analytics:', err)
//   }
// }

const loadFlashcardSets = async () => {
  try {
    console.log('Loading flashcard sets...');
    const response = await api.getFlashcardSets();
    console.log('Flashcard sets response:', response);
    flashcardSets.value = response || [];
  } catch (err: any) {
    console.error("Error loading flashcard sets:", err);
    error.value = err.message || "Failed to load flashcard sets. Please try again.";
  }
};

const loadSummaries = async () => {
  try {
    console.log('Loading summaries...');
    const response = await api.getStudySummaries();
    console.log('Summaries response:', response);
    
    if (response.success && response.data) {
      summaries.value = response.data;
    }
  } catch (err: any) {
    console.error("Error loading summaries:", err);
    // Don't set error here since summaries are optional
  }
};

const loadDashboardData = async () => {
  try {
    loading.value = true;
    error.value = "";

    await Promise.all([
      loadFlashcardSets(),
      loadSummaries()
    ]);
  } catch (err: any) {
    console.error("Error loading dashboard data:", err);
    error.value = err.message || "Failed to load dashboard data. Please try again.";
  } finally {
    loading.value = false;
  }
};

const handleLogout = async () => {
  try {
    await logout();
  } catch (err) {
    console.error("Logout error:", err);
  }
};

// const formatRelativeTime = (dateString: string) => {
//   const date = new Date(dateString)
//   const now = new Date()
//   const diffMs = now.getTime() - date.getTime()
//   const diffMins = Math.floor(diffMs / (1000 * 60))
//   const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
//   const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
//   if (diffMins < 1) return 'Just now'
//   if (diffMins < 60) return `${diffMins}m ago`
//   if (diffHours < 24) return `${diffHours}h ago`
//   if (diffDays < 7) return `${diffDays}d ago`
  
//   return date.toLocaleDateString()
// };

onMounted(() => {
  loadDashboardData();
  // loadAnalytics();
});
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <div class="flex items-center space-x-4">
            <div
              class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span class="text-white font-bold text-sm">F</span>
            </div>
            <h1 class="text-xl font-semibold text-gray-900">Dashboard</h1>
          </div>

          <div class="flex items-center space-x-4">
            <span class="text-sm text-gray-500">
              Welcome back, {{ user?.name || user?.email?.split("@")[0] }}!
            </span>
            <Button variant="outline" size="sm" @click="handleLogout">
              <svg
                class="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="text-center">
          <svg
            class="animate-spin h-8 w-8 text-blue-600 mx-auto mb-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24">
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"></circle>
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p class="text-gray-600">Loading your flashcard sets...</p>
        </div>
      </div>

      <!-- Stats Cards -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent class="p-6">
            <div class="flex items-center">
              <div class="p-2 bg-blue-100 rounded-lg">
                <svg
                  class="w-6 h-6 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-600">Study Sets</p>
                <p class="text-2xl font-bold text-gray-900">
                  {{ stats.totalSets }}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="p-6">
            <div class="flex items-center">
              <div class="p-2 bg-green-100 rounded-lg">
                <svg
                  class="w-6 h-6 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-600">Total Cards</p>
                <p class="text-2xl font-bold text-gray-900">
                  {{ stats.totalCards }}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="p-6">
            <div class="flex items-center">
              <div class="p-2 bg-orange-100 rounded-lg">
                <svg
                  class="w-6 h-6 text-orange-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-600">Study Summaries</p>
                <p class="text-2xl font-bold text-gray-900">
                  {{ stats.totalSummaries }}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="p-6">
            <div class="flex items-center">
              <div class="p-2 bg-purple-100 rounded-lg">
                <svg
                  class="w-6 h-6 text-purple-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-600">Studied Today</p>
                <p class="text-2xl font-bold text-gray-900">
                  {{ stats.studiedToday }} cards
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Recent Study Sessions -->
      <!-- <div v-if="!loading && recentSessions.length > 0" class="mb-8">
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center justify-between">
              <span>Recent Study Sessions</span>
              <Badge variant="outline">Last 5</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            Recent sessions functionality temporarily disabled for debugging
          </CardContent>
        </Card>
      </div> -->

      <!-- Error State -->
      <div
        v-if="error"
        class="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
        <div class="flex">
          <svg
            class="w-5 h-5 text-red-400 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="text-sm text-red-700">{{ error }}</p>
        </div>
      </div>

      <!-- Flashcard Sets -->
      <div class="bg-white shadow rounded-lg">
        <div class="px-6 py-4 border-b border-gray-200">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-medium text-gray-900">
              Your Flashcard Sets
            </h2>
            <div class="flex flex-wrap gap-2">
              <Button as-child>
                <NuxtLink to="/ocr">
                  <svg
                    class="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 4v16m8-8H4" />
                  </svg>
                  Create New Set
                </NuxtLink>
              </Button>

              <Button as-child variant="outline">
                <NuxtLink to="/summary-create">
                  <svg
                    class="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Create Summary
                </NuxtLink>
              </Button>
              
              <Button as-child variant="outline">
                <NuxtLink to="/my-cards">
                  <svg
                    class="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  My Cards
                </NuxtLink>
              </Button>

              <Button as-child variant="outline">
                <NuxtLink to="/my-summaries">
                  <svg
                    class="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                  </svg>
                  My Summaries
                </NuxtLink>
              </Button>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div
          v-if="!loading && flashcardSets.length === 0"
          class="text-center py-12">
          <svg
            class="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900">
            No flashcard sets
          </h3>
          <p class="mt-1 text-sm text-gray-500">
            Get started by creating flashcard sets or study summaries.
          </p>
          <div class="mt-6 flex justify-center space-x-4">
            <Button as-child>
              <NuxtLink to="/ocr">
                <svg
                  class="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 4v16m8-8H4" />
                </svg>
                Create Flashcards
              </NuxtLink>
            </Button>
            
            <Button as-child variant="outline">
              <NuxtLink to="/summary-create">
                <svg
                  class="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Create Summary
              </NuxtLink>
            </Button>
          </div>
        </div>

        <!-- Flashcard Sets List -->
        <div v-else class="divide-y divide-gray-200">
          <div
            v-for="set in flashcardSets"
            :key="set.id"
            class="px-6 py-4 hover:bg-gray-50 transition-colors">
            <div class="flex items-center justify-between">
              <div class="flex-1 min-w-0">
                <h3 class="text-sm font-medium text-gray-900 truncate">
                  {{ set.title }}
                </h3>
                <p class="text-sm text-gray-500 mt-1">
                  {{ set.flashcards?.length || 0 }} cards •
                  {{ set.language || "English" }}
                </p>
                <p
                  v-if="set.description"
                  class="text-sm text-gray-400 mt-1 italic">
                  {{ set.description }}
                </p>
              </div>

              <div class="flex items-center space-x-2 ml-4">
                <Badge variant="secondary">
                  {{ set.flashcards?.length || 0 }} cards
                </Badge>
                <Button as-child size="sm" variant="outline">
                  <NuxtLink :to="`/study-session?setId=${set.id}&mode=normal`">Study</NuxtLink>
                </Button>
                <Button as-child size="sm">
                  <NuxtLink :to="`/study-session?setId=${set.id}&mode=exam`">Exam</NuxtLink>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
