export default defineNuxtRouteMiddleware((to) => {
  console.log('Auth middleware triggered for:', to.path)
  
  // Skip middleware on server side to avoid hydration issues
  if (import.meta.server) {
    console.log('Auth middleware - skipping on server side')
    return
  }
  
  const { isAuthenticated, isPending } = useAuth()

  console.log('Auth middleware - isPending:', isPending.value, 'isAuthenticated:', isAuthenticated.value)

  // Wait for auth state to load
  if (isPending.value) {
    console.log('Auth middleware - still pending, waiting...')
    return
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated.value) {
    console.log('Auth middleware - not authenticated, redirecting to login')
    return navigateTo('/login')
  }
  
  console.log('Auth middleware - authenticated, allowing access')
})