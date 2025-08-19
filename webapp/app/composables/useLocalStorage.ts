import { ref, watch, type Ref } from 'vue'
import type { ZodSchema } from 'zod'

/**
 * Generic localStorage composable with Zod validation
 * Provides type-safe localStorage access with reactive refs
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  schema?: ZodSchema<T>
): [Ref<T>, (value: T) => void, () => void] {
  
  const storedValue = ref<T>(defaultValue)
  
  // Initialize from localStorage on client side
  if (import.meta.client && typeof window !== 'undefined' && window.localStorage) {
    try {
      const item = window.localStorage.getItem(key)
      if (item !== null) {
        const parsed = JSON.parse(item)
        
        // Validate with schema if provided
        if (schema) {
          const result = schema.safeParse(parsed)
          if (result.success) {
            storedValue.value = result.data
          } else {
            console.warn(`Invalid data in localStorage for key "${key}":`, result.error)
            storedValue.value = defaultValue
          }
        } else {
          storedValue.value = parsed
        }
      }
    } catch (error) {
      console.error(`Error reading from localStorage for key "${key}":`, error)
      storedValue.value = defaultValue
    }
  }
  
  // Save to localStorage
  const setValue = (value: T) => {
    try {
      storedValue.value = value
      if (import.meta.client && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, JSON.stringify(value))
      }
    } catch (error) {
      console.error(`Error writing to localStorage for key "${key}":`, error)
    }
  }
  
  // Remove from localStorage
  const removeValue = () => {
    try {
      storedValue.value = defaultValue
      if (import.meta.client && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key)
      }
    } catch (error) {
      console.error(`Error removing from localStorage for key "${key}":`, error)
    }
  }
  
  // Watch for changes and sync to localStorage
  if (import.meta.client && typeof window !== 'undefined' && window.localStorage) {
    watch(storedValue, (newValue) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(newValue))
      } catch (error) {
        console.error(`Error syncing to localStorage for key "${key}":`, error)
      }
    }, { deep: true })
  }
  
  return [storedValue, setValue, removeValue]
}

/**
 * Simple localStorage utilities without reactivity
 */
export const localStorage = {
  get<T>(key: string, defaultValue: T, schema?: ZodSchema<T>): T {
    if (!import.meta.client || typeof window === 'undefined' || !window.localStorage) return defaultValue
    
    try {
      const item = window.localStorage.getItem(key)
      if (item === null) return defaultValue
      
      const parsed = JSON.parse(item)
      
      if (schema) {
        const result = schema.safeParse(parsed)
        return result.success ? result.data : defaultValue
      }
      
      return parsed
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error)
      return defaultValue
    }
  },
  
  set<T>(key: string, value: T): boolean {
    if (!import.meta.client || typeof window === 'undefined' || !window.localStorage) return false
    
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch (error) {
      console.error(`Error writing localStorage key "${key}":`, error)
      return false
    }
  },
  
  remove(key: string): boolean {
    if (!import.meta.client || typeof window === 'undefined' || !window.localStorage) return false
    
    try {
      window.localStorage.removeItem(key)
      return true
    } catch (error) {
      console.error(`Error removing localStorage key "${key}":`, error)
      return false
    }
  },
  
  clear(): boolean {
    if (!import.meta.client || typeof window === 'undefined' || !window.localStorage) return false
    
    try {
      window.localStorage.clear()
      return true
    } catch (error) {
      console.error('Error clearing localStorage:', error)
      return false
    }
  },
  
  has(key: string): boolean {
    if (!import.meta.client || typeof window === 'undefined' || !window.localStorage) return false
    return window.localStorage.getItem(key) !== null
  }
}