import { createContext, type ReactNode, useContext, useEffect, useRef } from 'react'
import { HttpDarkPoolClient } from '@/darkpool/client/HttpDarkPoolClient'
import { MockDarkPoolClient } from '@/darkpool/client/MockDarkPoolClient'
import { startSimEngine } from '@/darkpool/client/simEngine'
import type { DarkPoolClient } from '@/darkpool/types'

const DarkPoolContext = createContext<DarkPoolClient | null>(null)

// Uses the live backend only when explicitly configured; otherwise keeps offline mock mode.
const shouldUseHttpClient = (): boolean => {
  const value = import.meta.env.VITE_DARK_POOL_API
  return typeof value === 'string' && value.trim() !== ''
}

export const DarkPoolProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const ref = useRef<DarkPoolClient>()
  // Pass a truthy seed so the mock uses real wall-clock timestamps in the app
  // (tests pass 0 for a deterministic incrementing clock).
  if (!ref.current)
    ref.current = shouldUseHttpClient() ? new HttpDarkPoolClient() : new MockDarkPoolClient(1)
  useEffect(() => {
    const client = ref.current
    if (client instanceof MockDarkPoolClient) {
      return startSimEngine(client)
    }
    return () => {
      if (client instanceof HttpDarkPoolClient) {
        client.close()
      }
    }
  }, [])
  return <DarkPoolContext.Provider value={ref.current}>{children}</DarkPoolContext.Provider>
}

export const useDarkPoolClient = (): DarkPoolClient => {
  const client = useContext(DarkPoolContext)
  if (!client) throw new Error('useDarkPoolClient must be used within DarkPoolProvider')
  return client
}
