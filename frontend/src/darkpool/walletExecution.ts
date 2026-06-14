type JsonRecord = Record<string, unknown>

// Narrows unknown wallet responses before reading nested execution metadata.
const asRecord = (value: unknown): JsonRecord | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined

// Extracts the ledger offset Carpincho returns after prepareExecuteAndWait.
export const completionOffsetOf = (value: unknown): number | undefined => {
  const root = asRecord(value)
  const tx = asRecord(root?.tx)
  const payload = asRecord(tx?.payload)
  const completionOffset = payload?.completionOffset
  return typeof completionOffset === 'number' ? completionOffset : undefined
}
