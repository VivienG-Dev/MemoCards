<script setup lang="ts">
import { ref } from "vue";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "~/components/ui/card";

definePageMeta({
  middleware: "guest",
});

const { register, isAuthenticated } = useAuth();
const router = useRouter();

const name = ref("");
const email = ref("");
const password = ref("");
const loading = ref(false);
const error = ref("");

const handleSignup = async () => {
  if (!name.value || !email.value || !password.value) {
    error.value = "Please fill in all fields";
    return;
  }

  if (password.value.length < 6) {
    error.value = "Password must be at least 6 characters long";
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    await register(name.value, email.value, password.value);

    // Wait a bit for session to be established
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check if user is now authenticated
    if (isAuthenticated.value) {
      console.log("Registration successful, redirecting to dashboard");
      await navigateTo("/dashboard");
    } else {
      console.log(
        "Registration succeeded but user not authenticated, waiting..."
      );
      // Wait for auth state to update
      const checkAuth = () => {
        if (isAuthenticated.value) {
          navigateTo("/dashboard");
        } else {
          setTimeout(checkAuth, 100);
        }
      };
      checkAuth();
    }
  } catch (err: any) {
    error.value = err.message || "An unexpected error occurred";
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div
    class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
    <Card class="w-full max-w-md">
      <CardHeader class="text-center">
        <div
          class="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mx-auto mb-4">
          <span class="text-white font-bold text-lg">F</span>
        </div>
        <CardTitle class="text-2xl font-bold">Create Account</CardTitle>
        <CardDescription>
          Sign up to start creating flashcards
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form @submit.prevent="handleSignup" class="space-y-4">
          <div class="space-y-2">
            <label for="name" class="text-sm font-medium text-gray-700">
              Full Name
            </label>
            <Input
              id="name"
              v-model="name"
              type="text"
              placeholder="Enter your full name"
              required
              autocomplete="name" />
          </div>

          <div class="space-y-2">
            <label for="email" class="text-sm font-medium text-gray-700">
              Email
            </label>
            <Input
              id="email"
              v-model="email"
              type="email"
              placeholder="Enter your email"
              required
              autocomplete="email" />
          </div>

          <div class="space-y-2">
            <label for="password" class="text-sm font-medium text-gray-700">
              Password
            </label>
            <Input
              id="password"
              v-model="password"
              type="password"
              placeholder="Create a password"
              required
              autocomplete="new-password" />
          </div>

          <Button type="submit" class="w-full" :disabled="loading">
            <span v-if="loading" class="flex items-center">
              <svg
                class="animate-spin -ml-1 mr-3 h-4 w-4 text-white"
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
              Creating account...
            </span>
            <span v-else>Create Account</span>
          </Button>

          <div
            v-if="error"
            class="p-3 text-sm text-red-600 bg-red-50 rounded-md">
            {{ error }}
          </div>
        </form>

        <div class="mt-6 text-center">
          <p class="text-sm text-gray-600">
            Already have an account?
            <NuxtLink
              to="/login"
              class="font-medium text-blue-600 hover:text-blue-500">
              Sign in
            </NuxtLink>
          </p>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
