// Template IDs for the DARs uploaded to the FiveNorth devnet participant.
// Canton JSON API v2 expects the first identifier segment to be a package name,
// not a package hash, while the module and entity names must match the DAR.
export const TEMPLATE_IDS = {
  registry: '#registry-token:RegistryToken.Registry:Registry',
  registryHolding: '#registry-token:RegistryToken.Holding:RegistryHolding',
  registryAllocation: '#registry-token:RegistryToken.Allocation:RegistryAllocation',
  darkPool: '#dark-pool:DarkPool:DarkPool',
  fillAuthority: '#dark-pool:DarkPool:FillAuthority',
  order: '#dark-pool:DarkPool:Order',
} as const
