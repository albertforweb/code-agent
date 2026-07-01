import { useEffect, useState } from 'react'
import {
  type AccountLimits,
  currentLimits,
  statusListeners,
} from './accountLimits.js'

export function useAccountLimits(): AccountLimits {
  const [limits, setLimits] = useState<AccountLimits>({ ...currentLimits })

  useEffect(() => {
    const listener = (newLimits: AccountLimits) => {
      setLimits({ ...newLimits })
    }
    statusListeners.add(listener)

    return () => {
      statusListeners.delete(listener)
    }
  }, [])

  return limits
}
