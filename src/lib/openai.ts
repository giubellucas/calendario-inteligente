export interface ExtractedEventData {
  title: string
  date: Date | null
  description?: string
  category?: string
  priority?: 'high' | 'medium' | 'low'
  location?: string
  participants?: string[]
  entities?: string[]
  intent?: string
  sentiment?: string
  keywords?: string[]
}

export async function extractEventFromMessage(message: string): Promise<ExtractedEventData | null> {
  try {
    const response = await fetch('/api/extract-event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Erro na API:', errorText)
      return null
    }

    const data = await response.json()
    
    // Converter data string para Date object (se existir)
    if (data.date) {
      data.date = new Date(data.date)
    }

    return data
  } catch (error) {
    console.error('Erro ao extrair dados:', error)
    return null
  }
}
