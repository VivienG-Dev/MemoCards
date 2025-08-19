export const useAuth = () => {
  const nuxtApp = useNuxtApp()
  
  // Create reactive refs for session state
  const session = ref(null)
  const user = ref(null)
  const isAuthenticated = ref(false)
  const isPending = ref(true)
  const error = ref(null)
  
  // Get auth client safely
  const getAuthClient = () => {
    return nuxtApp.$authClient
  }
  
  // Initialize session state
  const initializeAuth = async () => {
    try {
      console.log('Initializing auth state...')
      isPending.value = true
      
      const authClient = getAuthClient()
      if (!authClient) {
        console.error('Auth client not available')
        session.value = null
        user.value = null
        isAuthenticated.value = false
        return
      }
      
      // Get current session
      const sessionData = await authClient.getSession()
      console.log('Session data:', sessionData)
      
      if (sessionData && sessionData.data) {
        session.value = sessionData.data
        user.value = sessionData.data.user
        isAuthenticated.value = !!sessionData.data.user
      } else {
        session.value = null
        user.value = null
        isAuthenticated.value = false
      }
    } catch (err) {
      console.error('Error initializing auth:', err)
      error.value = err.message
      session.value = null
      user.value = null
      isAuthenticated.value = false
    } finally {
      isPending.value = false
    }
  }
  
  // Initialize if on client side and not already initialized
  if (import.meta.client && isPending.value) {
    nextTick(() => initializeAuth())
  }
  
  const login = async (email, password) => {
    try {
      console.log('Attempting login with:', email)
      isPending.value = true
      error.value = null
      
      const authClient = getAuthClient()
      if (!authClient) {
        throw new Error('Auth client not available')
      }
      
      const result = await authClient.signIn.email({
        email,
        password,
      })
      
      console.log('Login result:', result)
      
      if (result.error) {
        throw new Error(result.error.message)
      }
      
      // Refresh session after successful login
      await initializeAuth()
      
      return result
    } catch (err) {
      console.error('Login error:', err)
      error.value = err.message
      throw err
    } finally {
      isPending.value = false
    }
  }
  
  const register = async (name, email, password) => {
    try {
      console.log('Attempting registration with:', email)
      isPending.value = true
      error.value = null
      
      const authClient = getAuthClient()
      if (!authClient) {
        throw new Error('Auth client not available')
      }
      
      const result = await authClient.signUp.email({
        name,
        email,
        password,
      })
      
      console.log('Registration result:', result)
      
      if (result.error) {
        throw new Error(result.error.message)
      }
      
      // Refresh session after successful registration
      await initializeAuth()
      
      return result
    } catch (err) {
      console.error('Register error:', err)
      error.value = err.message
      throw err
    } finally {
      isPending.value = false
    }
  }
  
  const logout = async () => {
    try {
      isPending.value = true
      
      const authClient = getAuthClient()
      if (!authClient) {
        throw new Error('Auth client not available')
      }
      
      await authClient.signOut()
      
      // Clear session state
      session.value = null
      user.value = null
      isAuthenticated.value = false
      
      await navigateTo('/login')
    } catch (err) {
      console.error('Logout error:', err)
      throw err
    } finally {
      isPending.value = false
    }
  }
  
  const refreshSession = async () => {
    await initializeAuth()
  }
  
  return {
    user: readonly(user),
    session: readonly(session),
    isAuthenticated: readonly(isAuthenticated),
    isPending: readonly(isPending),
    error: readonly(error),
    login,
    register,
    logout,
    refreshSession,
  }
}