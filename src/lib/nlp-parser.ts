/**
 * Parser de linguagem natural para interpretação de eventos
 */

export interface ParsedEvent {
  title: string
  description: string
  date: Date
  category?: string
  priority?: 'high' | 'medium' | 'low'
  location?: string
  participants?: string[]
}

export const CATEGORY_EMOJIS: Record<string, string> = {
  saúde: '🏥',
  trabalho: '💼',
  pessoal: '👤',
  estudo: '📚',
  fitness: '💪',
  compras: '🛒',
  geral: '📌',
}

export const CATEGORY_COLORS: Record<string, string> = {
  saúde: 'from-red-500/20 to-red-600/20 border-red-500/50',
  trabalho: 'from-blue-500/20 to-blue-600/20 border-blue-500/50',
  pessoal: 'from-purple-500/20 to-purple-600/20 border-purple-500/50',
  estudo: 'from-green-500/20 to-green-600/20 border-green-500/50',
  fitness: 'from-orange-500/20 to-orange-600/20 border-orange-500/50',
  compras: 'from-yellow-500/20 to-yellow-600/20 border-yellow-500/50',
  geral: 'from-slate-500/20 to-slate-600/20 border-slate-500/50',
}

/**
 * Parseia linguagem natural e extrai informações de evento
 */
export function parseNaturalLanguage(input: string): ParsedEvent | null {
  const now = new Date()
  const text = input.toLowerCase()

  // Extrair título (primeira parte antes de indicadores temporais)
  let title = input.split(/\s+(em|às|as|na|no|para|amanhã|hoje|depois)\s+/i)[0].trim()
  title = title.charAt(0).toUpperCase() + title.slice(1)

  // Detectar data e hora
  let date: Date | null = null

  // Hoje
  if (text.includes('hoje')) {
    date = new Date(now)
    const hour = extractHour(text)
    if (hour !== null) {
      date.setHours(hour, 0, 0, 0)
    }
  }
  // Amanhã
  else if (text.includes('amanhã')) {
    date = new Date(now)
    date.setDate(date.getDate() + 1)
    const hour = extractHour(text)
    if (hour !== null) {
      date.setHours(hour, 0, 0, 0)
    }
  }
  // Dias da semana
  else {
    const weekDays = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
    for (let i = 0; i < weekDays.length; i++) {
      if (text.includes(weekDays[i])) {
        const targetDay = i
        const currentDay = now.getDay()
        let daysToAdd = targetDay - currentDay
        if (daysToAdd <= 0) daysToAdd += 7

        date = new Date(now)
        date.setDate(date.getDate() + daysToAdd)
        const hour = extractHour(text)
        if (hour !== null) {
          date.setHours(hour, 0, 0, 0)
        }
        break
      }
    }
  }

  // Tempo relativo
  if (!date) {
    const hoursMatch = text.match(/em\s+(\d+)\s+horas?/)
    if (hoursMatch) {
      date = new Date(now)
      date.setHours(date.getHours() + parseInt(hoursMatch[1]))
    }

    const minutesMatch = text.match(/em\s+(\d+)\s+minutos?/)
    if (minutesMatch) {
      date = new Date(now)
      date.setMinutes(date.getMinutes() + parseInt(minutesMatch[1]))
    }
  }

  // Se ainda não tem data, tentar extrair hora e agendar para hoje ou amanhã
  if (!date) {
    const hour = extractHour(text)
    if (hour !== null) {
      date = new Date(now)
      date.setHours(hour, 0, 0, 0)
      if (date.getTime() < now.getTime()) {
        date.setDate(date.getDate() + 1)
      }
    }
  }

  if (!date) {
    return null
  }

  // Detectar categoria
  const category = detectCategory(text)

  // Detectar prioridade
  const priority = detectPriority(text)

  // Detectar localização
  const location = extractLocation(input)

  // Detectar participantes
  const participants = extractParticipants(input)

  return {
    title,
    description: input,
    date,
    category,
    priority,
    location,
    participants,
  }
}

function extractHour(text: string): number | null {
  const patterns = [
    /(?:às|as)\s+(\d{1,2})(?:h|:00)?/,
    /(\d{1,2})(?:h|:00)/,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const hour = parseInt(match[1])
      if (hour >= 0 && hour <= 23) {
        return hour
      }
    }
  }

  return null
}

function detectCategory(text: string): string {
  const categories: Record<string, string[]> = {
    saúde: ['médico', 'dentista', 'consulta', 'exame', 'hospital', 'clínica'],
    trabalho: ['reunião', 'meeting', 'trabalho', 'projeto', 'apresentação'],
    pessoal: ['aniversário', 'festa', 'encontro', 'jantar', 'almoço'],
    estudo: ['aula', 'prova', 'estudo', 'curso', 'faculdade'],
    fitness: ['academia', 'treino', 'exercício', 'corrida', 'yoga'],
    compras: ['comprar', 'mercado', 'shopping', 'loja'],
  }

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return category
    }
  }

  return 'geral'
}

function detectPriority(text: string): 'high' | 'medium' | 'low' {
  const highPriority = ['urgente', 'importante', 'crítico', 'emergência']
  const lowPriority = ['talvez', 'se possível', 'quando der']

  if (highPriority.some(keyword => text.includes(keyword))) {
    return 'high'
  }

  if (lowPriority.some(keyword => text.includes(keyword))) {
    return 'low'
  }

  return 'medium'
}

function extractLocation(text: string): string | undefined {
  const locationPattern = /(?:em|no|na)\s+([A-ZÀ-Ú][a-zà-ú\s]+)/
  const match = text.match(locationPattern)
  return match ? match[1].trim() : undefined
}

function extractParticipants(text: string): string[] | undefined {
  const participantPattern = /com\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+e\s+[A-ZÀ-Ú][a-zà-ú]+)*)/
  const match = text.match(participantPattern)
  
  if (match) {
    return match[1].split(/\s+e\s+/).map(p => p.trim())
  }
  
  return undefined
}

/**
 * Detecta conflitos de horário entre eventos
 */
export function detectConflicts(newDate: Date, existingEvents: any[]): any | null {
  const newTime = newDate.getTime()
  const oneHour = 60 * 60 * 1000

  return existingEvents.find(event => {
    const eventTime = new Date(event.event_date).getTime()
    return Math.abs(newTime - eventTime) < oneHour
  }) || null
}

/**
 * Calcula nível de urgência baseado na data
 */
export function getUrgencyLevel(date: Date): 'urgent' | 'soon' | 'distant' {
  const now = Date.now()
  const eventTime = date.getTime()
  const diff = eventTime - now

  const oneHour = 60 * 60 * 1000
  const oneDay = 24 * oneHour

  if (diff < oneHour) return 'urgent'
  if (diff < oneDay) return 'soon'
  return 'distant'
}

/**
 * Calcula tempo até o evento
 */
export function getTimeUntil(date: Date): string {
  const now = Date.now()
  const eventTime = date.getTime()
  const diff = eventTime - now

  if (diff < 0) return 'Evento passado'

  const minutes = Math.floor(diff / (60 * 1000))
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `Em ${days} dia${days > 1 ? 's' : ''}`
  if (hours > 0) return `Em ${hours} hora${hours > 1 ? 's' : ''}`
  if (minutes > 0) return `Em ${minutes} minuto${minutes > 1 ? 's' : ''}`
  return 'Agora!'
}

/**
 * Verifica se é uma pergunta histórica
 */
export function isHistoricalQuery(input: string): boolean {
  const text = input.toLowerCase()
  const historicalKeywords = [
    'quando foi',
    'última vez',
    'já fui',
    'já tive',
    'histórico',
    'passado',
  ]

  return historicalKeywords.some(keyword => text.includes(keyword))
}

/**
 * Extrai termo de busca de pergunta histórica
 */
export function extractSearchTerm(input: string): string {
  const text = input.toLowerCase()
  
  // Remover palavras-chave de pergunta
  let searchTerm = text
    .replace(/quando foi|última vez|já fui|já tive|ao?|no?|na?/g, '')
    .replace(/\?/g, '')
    .trim()

  return searchTerm
}

/**
 * Busca eventos passados
 */
export function searchPastEvents(searchTerm: string, events: any[]): any[] {
  const now = Date.now()
  
  return events
    .filter(event => {
      const eventDate = new Date(event.event_date).getTime()
      const matchesSearch = event.title.toLowerCase().includes(searchTerm.toLowerCase())
      return matchesSearch && eventDate < now
    })
    .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
}

/**
 * Gera sugestões inteligentes baseadas em padrões
 */
export function generateSmartSuggestions(events: any[]): string[] {
  const suggestions: string[] = []
  const now = Date.now()

  // Eventos urgentes
  const urgentEvents = events.filter(e => {
    const diff = new Date(e.event_date).getTime() - now
    return diff > 0 && diff < 60 * 60 * 1000
  })

  if (urgentEvents.length > 0) {
    suggestions.push(`⚠️ Você tem ${urgentEvents.length} evento(s) na próxima hora!`)
  }

  // Eventos hoje
  const todayEvents = events.filter(e => {
    const eventDate = new Date(e.event_date)
    const today = new Date()
    return eventDate.toDateString() === today.toDateString()
  })

  if (todayEvents.length > 0) {
    suggestions.push(`📅 ${todayEvents.length} evento(s) agendado(s) para hoje`)
  }

  return suggestions
}

/**
 * Analisa padrões temporais dos eventos
 */
export function analyzeTemporalPatterns(events: any[]): {
  busiestDay: string
  busiestHour: number
  mostCommonCategory: string
} {
  const dayCount: Record<number, number> = {}
  const hourCount: Record<number, number> = {}
  const categoryCount: Record<string, number> = {}

  events.forEach(event => {
    const date = new Date(event.event_date)
    const day = date.getDay()
    const hour = date.getHours()
    const category = event.category || 'geral'

    dayCount[day] = (dayCount[day] || 0) + 1
    hourCount[hour] = (hourCount[hour] || 0) + 1
    categoryCount[category] = (categoryCount[category] || 0) + 1
  })

  const weekDays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
  const busiestDayNum = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 0
  const busiestDay = weekDays[parseInt(busiestDayNum.toString())]

  const busiestHour = Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 0

  const mostCommonCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'geral'

  return {
    busiestDay,
    busiestHour: parseInt(busiestHour.toString()),
    mostCommonCategory,
  }
}

/**
 * Detecta comandos especiais
 */
export function detectSpecialCommand(input: string): { type: string; data?: any } {
  const text = input.toLowerCase()

  if (text.includes('estatística') || text.includes('análise') || text.includes('padrões')) {
    return { type: 'stats' }
  }

  if (text.includes('ajuda') || text.includes('help') || text.includes('como usar')) {
    return { type: 'help' }
  }

  return { type: 'none' }
}
