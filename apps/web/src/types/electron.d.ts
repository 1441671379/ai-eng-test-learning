interface Window {
  electron?: {
    isElectron?: boolean
    platform?: string
    openDevTools?: () => Promise<null>
  }
}
