export default defineNuxtRouteMiddleware((to) => {
  console.log('Guest middleware triggered for:', to.path)
  
  // Skip middleware on server side to avoid hydration issues
  if (import.meta.server) {
    console.log('Guest middleware - skipping on server side')
    return
  }
  
  const { isAuthenticated, isPending } = useAuth()

  console.log('Guest middleware - isPending:', isPending.value, 'isAuthenticated:', isAuthenticated.value)

  // Wait for auth state to load
  if (isPending.value) {
    console.log('Guest middleware - still pending, waiting...')
    return
  }

  // Redirect to dashboard if already authenticated
  if (isAuthenticated.value) {
    console.log('Guest middleware - already authenticated, redirecting to dashboard')
    return navigateTo('/dashboard')
  }
  
  console.log('Guest middleware - not authenticated, allowing access')
})