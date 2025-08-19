<script setup lang="ts">
import { Button } from "~/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "~/components/ui/card";

definePageMeta({
  middleware: "guest",
});
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    <!-- Navigation -->
    <nav class="flex items-center justify-between p-6 max-w-7xl mx-auto">
      <div class="flex items-center space-x-2">
        <div
          class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <span class="text-white font-bold text-sm">F</span>
        </div>
        <span class="text-xl font-bold text-gray-900">FlashCards</span>
      </div>

      <div class="flex items-center space-x-4">
        <NuxtLink
          to="/login"
          class="text-gray-600 hover:text-gray-900 font-medium transition-colors">
          Sign In
        </NuxtLink>
        <Button as-child>
          <NuxtLink to="/signup"> Get Started </NuxtLink>
        </Button>
      </div>
    </nav>

    <!-- Hero Section -->
    <main class="max-w-7xl mx-auto px-6 py-16">
      <div class="text-center max-w-3xl mx-auto">
        <h1 class="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
          Study Smarter with
          <span class="text-blue-600">AI-Powered</span>
          Flashcards
        </h1>

        <p class="text-xl text-gray-600 mb-8 leading-relaxed">
          Transform your notes into effective flashcards using OCR and AI. Study
          efficiently with personalized review sessions and track your progress.
        </p>

        <div class="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <Button size="lg" as-child>
            <NuxtLink to="/signup" class="px-8"> Start Learning Free </NuxtLink>
          </Button>
          <Button variant="outline" size="lg" as-child>
            <NuxtLink to="/login" class="px-8"> Sign In </NuxtLink>
          </Button>
        </div>
      </div>

      <!-- Features Grid -->
      <div class="grid md:grid-cols-3 gap-8 mt-20">
        <Card class="p-6 text-center">
          <div
            class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
            <svg
              class="w-6 h-6 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <CardHeader>
            <CardTitle>OCR Recognition</CardTitle>
            <CardDescription>
              Snap photos of your notes and instantly extract text with advanced
              OCR technology
            </CardDescription>
          </CardHeader>
        </Card>

        <Card class="p-6 text-center">
          <div
            class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
            <svg
              class="w-6 h-6 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <CardHeader>
            <CardTitle>AI Generation</CardTitle>
            <CardDescription>
              Let AI create effective flashcards and multiple choice questions
              from your content
            </CardDescription>
          </CardHeader>
        </Card>

        <Card class="p-6 text-center">
          <div
            class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
            <svg
              class="w-6 h-6 text-purple-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <CardHeader>
            <CardTitle>Smart Studying</CardTitle>
            <CardDescription>
              Track your progress with normal and exam modes, plus detailed
              analytics
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <!-- CTA Section -->
      <div class="text-center mt-20 bg-white rounded-2xl p-8 shadow-lg">
        <h2 class="text-3xl font-bold text-gray-900 mb-4">
          Ready to Transform Your Learning?
        </h2>
        <p class="text-gray-600 mb-6">
          Join thousands of students who are studying more effectively with
          AI-powered flashcards.
        </p>
        <Button size="lg" as-child>
          <NuxtLink to="/signup" class="px-8"> Get Started Now </NuxtLink>
        </Button>
      </div>
    </main>
  </div>
</template>
