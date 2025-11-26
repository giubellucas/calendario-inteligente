'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase, type Event } from '@/lib/supabase'
import { extractEventFromMessage } from '@/lib/openai'
import { 
  parseNaturalLanguage, 
  detectConflicts, 
  getUrgencyLevel, 
  getTimeUntil,
  isHistoricalQuery,
  extractSearchTerm,
  searchPastEvents,
  generateSmartSuggestions,
  analyzeTemporalPatterns,
  detectSpecialCommand,
  CATEGORY_EMOJIS,
  CATEGORY_COLORS
} from '@/lib/nlp-parser'
import { 
  requestNotificationPermission, 
  sendNotification, 
  scheduleNotification,
  requestWakeLock 
} from '@/lib/notifications'
import { 
  Send, 
  Clock, 
  AlertCircle, 
  Trash2, 
  Mic, 
  MicOff, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  List, 
  TrendingUp, 
  Sparkles,
  Edit2,
  Check,
  X,
  Search,
  Filter,
  Grid3x3,
  Plus,
  Loader2
} from 'lucide-react'
import { toast } from 'sonner'

type ViewMode = 'timeline' | 'calendar'

export default function RememberMe() {
  const [events, setEvents] = useState<Event[]>([])
  const [input, setInput] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [loading, setLoading] = useState(false)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>('timeline')
  const [chatHistory, setChatHistory] = useState<Array<{type: 'user' | 'system', message: string}>>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showStats, setShowStats] = useState(false)
  const [editingEvent, setEditingEvent] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [draggedEvent, setDraggedEvent] = useState<Event | null>(null)
  const [showEventModal, setShowEventModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [newEventTitle, setNewEventTitle] = useState('')
  const [newEventTime, setNewEventTime] = useState('09:00')
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadEvents()
    requestNotificationPermission()
    
    // Atualizar contadores a cada minuto
    const interval = setInterval(() => {
      setEvents(prev => [...prev])
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  // Gerar sugestões inteligentes quando eventos mudarem
  useEffect(() => {
    if (events.length > 0) {
      const smartSuggestions = generateSmartSuggestions(events)
      setSuggestions(smartSuggestions)
    }
  }, [events])

  // Auto-scroll do chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  async function loadEvents() {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: true })

      if (error) {
        console.error('Erro ao carregar eventos:', error)
        toast.error('Erro ao carregar eventos')
        return
      }

      if (data) {
        setEvents(data)
        // Agendar notificações para eventos futuros
        data.forEach(event => {
          if (!event.notified) {
            scheduleNotification(event.id, event.title, new Date(event.event_date))
          }
        })
      }
    } catch (err) {
      console.error('Erro ao carregar eventos:', err)
      toast.error('Erro ao conectar com o banco de dados')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return

    setLoading(true)
    
    // Adicionar mensagem do usuário ao histórico
    setChatHistory(prev => [...prev, { type: 'user', message: input }])

    // 🤖 SEMPRE USAR OPENAI PARA PROCESSAR TODAS AS MENSAGENS
    try {
      const extractedData = await extractEventFromMessage(input)
      
      if (!extractedData) {
        const errorMsg = '❌ Não consegui processar a mensagem. Verifique sua API key da OpenAI.'
        setChatHistory(prev => [...prev, { type: 'system', message: errorMsg }])
        toast.error('Erro ao processar mensagem')
        setLoading(false)
        setInput('')
        return
      }

      // Processar baseado na intenção detectada pela IA
      const intent = extractedData.intent

      // COMANDO: Estatísticas
      if (intent === 'comando' && (input.toLowerCase().includes('estatística') || input.toLowerCase().includes('análise'))) {
        const stats = analyzeTemporalPatterns(events)
        const statsMsg = `📊 **Análise de Padrões:**\n\n• Dia mais ocupado: ${stats.busiestDay}\n• Horário mais comum: ${stats.busiestHour}h\n• Categoria mais frequente: ${CATEGORY_EMOJIS[stats.mostCommonCategory]} ${stats.mostCommonCategory}\n• Total de eventos: ${events.length}`
        setChatHistory(prev => [...prev, { type: 'system', message: statsMsg }])
        setShowStats(true)
        setInput('')
        setLoading(false)
        return
      }

      // COMANDO: Ajuda
      if (intent === 'comando' && input.toLowerCase().includes('ajuda')) {
        const helpMsg = `💡 **Como usar o RememberMe:**\n\n📝 Criar eventos:\n• "Dentista amanhã às 14h"\n• "Reunião sexta às 10h"\n• "Academia em 2 horas"\n\n🔍 Buscar histórico:\n• "Quando foi a última vez que fui ao dentista?"\n• "Já fui ao médico?"\n\n📊 Ver estatísticas:\n• "Mostrar estatísticas"\n• "Análise de padrões"\n\n🎤 Use o microfone para falar naturalmente!`
        setChatHistory(prev => [...prev, { type: 'system', message: helpMsg }])
        setInput('')
        setLoading(false)
        return
      }

      // PERGUNTA: Buscar histórico
      if (intent === 'fazer_pergunta' || isHistoricalQuery(input)) {
        const searchTerm = extractSearchTerm(input)
        const pastEvents = searchPastEvents(searchTerm, events)
        
        if (pastEvents.length > 0) {
          const lastEvent = pastEvents[0]
          const eventDate = new Date(lastEvent.event_date)
          const responseMsg = `📅 A última vez que você teve "${lastEvent.title}" foi em ${eventDate.toLocaleString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}.`
          
          setChatHistory(prev => [...prev, { type: 'system', message: responseMsg }])
          toast.success('Encontrei no histórico!')
        } else {
          const notFoundMsg = `🔍 Não encontrei eventos passados relacionados a "${searchTerm}".`
          setChatHistory(prev => [...prev, { type: 'system', message: notFoundMsg }])
          toast.info('Nenhum evento encontrado')
        }
        
        setInput('')
        setLoading(false)
        return
      }

      // CONVERSA: Responder de forma amigável
      if (intent === 'conversa') {
        const sentiment = extractedData.sentiment || 'neutro'
        let responseMsg = ''
        
        if (sentiment === 'positivo') {
          responseMsg = `😊 ${extractedData.title}! Como posso ajudar você hoje? Você pode criar eventos, fazer perguntas sobre seu histórico ou pedir estatísticas.`
        } else if (sentiment === 'negativo') {
          responseMsg = `😔 Entendo. Estou aqui para ajudar! Posso organizar seus compromissos e lembretes para facilitar seu dia.`
        } else {
          responseMsg = `👋 ${extractedData.title}! Estou pronto para ajudar. Você pode me dizer sobre eventos, fazer perguntas ou pedir análises.`
        }
        
        setChatHistory(prev => [...prev, { type: 'system', message: responseMsg }])
        toast.info('Mensagem processada')
        setInput('')
        setLoading(false)
        return
      }

      // CRIAR EVENTO: Se tem data ou é intenção de criar evento/lembrete/tarefa
      if (extractedData.date || intent === 'criar_evento' || intent === 'lembrete' || intent === 'tarefa') {
        // Se não tem data, criar para "hoje" como lembrete
        const eventDate = extractedData.date || new Date()

        // Verificar conflitos
        const conflictingEvent = events.find(event => {
          const eventTime = new Date(event.event_date).getTime()
          const newTime = eventDate.getTime()
          const oneHour = 60 * 60 * 1000
          return Math.abs(newTime - eventTime) < oneHour
        })

        if (conflictingEvent) {
          const warningMsg = `⚠️ Atenção: Você já tem "${conflictingEvent.title}" próximo a este horário (${new Date(conflictingEvent.event_date).toLocaleString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
          })})!`
          setChatHistory(prev => [...prev, { type: 'system', message: warningMsg }])
          toast.warning('Conflito de horário detectado!')
        }

        const newEvent = {
          title: extractedData.title,
          description: extractedData.description || '',
          event_date: eventDate.toISOString(),
          notified: false,
          urgency: getUrgencyLevel(eventDate),
          user_id: 'anonymous'
        }

        const { data, error } = await supabase
          .from('events')
          .insert([newEvent])
          .select()
          .single()

        if (error) {
          const errorMsg = '❌ Erro ao criar evento. Tente novamente.'
          setChatHistory(prev => [...prev, { type: 'system', message: errorMsg }])
          toast.error('Erro ao criar evento')
          console.error(error)
        } else {
          const categoryEmoji = CATEGORY_EMOJIS[extractedData.category || 'geral']
          const priorityEmoji = extractedData.priority === 'high' ? '🔴' : extractedData.priority === 'low' ? '🟢' : '🟡'
          
          let successMsg = `✅ Evento "${extractedData.title}" criado para ${eventDate.toLocaleString('pt-BR', { 
            day: '2-digit', 
            month: 'short',
            weekday: 'short',
            hour: '2-digit', 
            minute: '2-digit' 
          })}!`
          
          if (extractedData.category) {
            successMsg += `\n\n${categoryEmoji} Categoria: ${extractedData.category}`
          }
          
          if (extractedData.priority) {
            successMsg += `\n${priorityEmoji} Prioridade: ${extractedData.priority}`
          }
          
          if (extractedData.location) {
            successMsg += `\n📍 Local: ${extractedData.location}`
          }
          
          if (extractedData.participants && extractedData.participants.length > 0) {
            successMsg += `\n👥 Com: ${extractedData.participants.join(', ')}`
          }

          if (extractedData.entities && extractedData.entities.length > 0) {
            successMsg += `\n🏷️ Entidades: ${extractedData.entities.join(', ')}`
          }

          if (extractedData.keywords && extractedData.keywords.length > 0) {
            successMsg += `\n🔑 Palavras-chave: ${extractedData.keywords.join(', ')}`
          }
          
          setChatHistory(prev => [...prev, { type: 'system', message: successMsg }])
          toast.success('Evento criado com IA!')
          setEvents(prev => [...prev, data].sort((a, b) => 
            new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
          ))
          scheduleNotification(data.id, data.title, new Date(data.event_date))
          
          // Ativar Wake Lock para eventos urgentes (< 1 hora)
          const urgency = getUrgencyLevel(eventDate)
          if (urgency === 'urgent') {
            await requestWakeLock()
          }
          
          setInput('')
        }
      } else {
        // Mensagem genérica processada mas sem ação específica
        let responseMsg = `✅ Mensagem processada!\n\n📝 Título: ${extractedData.title}`
        
        if (extractedData.category) {
          responseMsg += `\n📂 Categoria: ${extractedData.category}`
        }
        
        if (extractedData.sentiment) {
          responseMsg += `\n😊 Sentimento: ${extractedData.sentiment}`
        }
        
        if (extractedData.intent) {
          responseMsg += `\n🎯 Intenção: ${extractedData.intent}`
        }

        if (extractedData.entities && extractedData.entities.length > 0) {
          responseMsg += `\n🏷️ Entidades: ${extractedData.entities.join(', ')}`
        }

        if (extractedData.keywords && extractedData.keywords.length > 0) {
          responseMsg += `\n🔑 Palavras-chave: ${extractedData.keywords.join(', ')}`
        }
        
        responseMsg += `\n\n💡 Dica: Para criar um evento, mencione uma data/hora. Para buscar histórico, pergunte "quando foi..."`
        
        setChatHistory(prev => [...prev, { type: 'system', message: responseMsg }])
        toast.info('Mensagem analisada pela IA')
        setInput('')
      }
    } catch (error) {
      console.error('Erro ao processar com OpenAI:', error)
      const errorMsg = '❌ Erro ao processar mensagem. Verifique sua API key da OpenAI.'
      setChatHistory(prev => [...prev, { type: 'system', message: errorMsg }])
      toast.error('Erro ao processar com IA')
    }

    setLoading(false)
  }

  async function deleteEvent(id: string) {
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id)

    if (error) {
      toast.error('Erro ao deletar evento')
    } else {
      setEvents(prev => prev.filter(e => e.id !== id))
      toast.success('Evento removido')
    }
  }

  async function updateEvent(id: string, newTitle: string) {
    const { error } = await supabase
      .from('events')
      .update({ title: newTitle })
      .eq('id', id)

    if (error) {
      toast.error('Erro ao atualizar evento')
    } else {
      setEvents(prev => prev.map(e => e.id === id ? { ...e, title: newTitle } : e))
      toast.success('Evento atualizado!')
      setEditingEvent(null)
    }
  }

  async function handleDragDrop(eventId: string, newDate: Date) {
    const { error } = await supabase
      .from('events')
      .update({ event_date: newDate.toISOString() })
      .eq('id', eventId)

    if (error) {
      toast.error('Erro ao mover evento')
    } else {
      setEvents(prev => prev.map(e => 
        e.id === eventId ? { ...e, event_date: newDate.toISOString() } : e
      ))
      toast.success('Evento movido!')
    }
  }

  async function createEventFromCalendar() {
    if (!selectedDate || !newEventTitle.trim()) {
      toast.error('Preencha o título do evento')
      return
    }

    const [hours, minutes] = newEventTime.split(':').map(Number)
    const eventDate = new Date(selectedDate)
    eventDate.setHours(hours, minutes, 0, 0)

    const newEvent = {
      title: newEventTitle,
      description: '',
      event_date: eventDate.toISOString(),
      notified: false,
      urgency: getUrgencyLevel(eventDate),
      user_id: 'anonymous'
    }

    const { data, error } = await supabase
      .from('events')
      .insert([newEvent])
      .select()
      .single()

    if (error) {
      toast.error('Erro ao criar evento')
      console.error(error)
    } else {
      toast.success('Evento criado!')
      setEvents(prev => [...prev, data].sort((a, b) => 
        new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
      ))
      scheduleNotification(data.id, data.title, new Date(data.event_date))
      
      // Resetar modal
      setShowEventModal(false)
      setNewEventTitle('')
      setNewEventTime('09:00')
      setSelectedDate(null)
    }
  }

  function startVoiceInput() {
    if (!('webkitSpeechRecognition' in window)) {
      toast.error('Seu navegador não suporta reconhecimento de voz')
      return
    }

    const recognition = new (window as any).webkitSpeechRecognition()
    recognition.lang = 'pt-BR'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onstart = () => {
      setIsListening(true)
      toast.info('🎤 Escutando...')
    }

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setInput(transcript)
      setIsListening(false)
      toast.success('Texto capturado!')
    }

    recognition.onerror = () => {
      setIsListening(false)
      toast.error('Erro no reconhecimento de voz')
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.start()
  }

  // Funções do calendário
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()
    
    return { daysInMonth, startingDayOfWeek }
  }

  const getEventsForDay = (day: number) => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const dayDate = new Date(year, month, day)
    
    return events.filter(event => {
      const eventDate = new Date(event.event_date)
      return eventDate.getDate() === day &&
             eventDate.getMonth() === month &&
             eventDate.getFullYear() === year
    })
  }

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))
  }

  // Filtrar eventos
  const filteredEvents = events.filter(event => {
    const matchesSearch = event.title.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = filterCategory === 'all' || event.urgency === filterCategory
    const matchesPriority = filterPriority === 'all' || event.urgency === filterPriority
    return matchesSearch && matchesCategory && matchesPriority
  })

  const sortedEvents = [...filteredEvents].sort((a, b) => {
    const dateA = new Date(a.event_date).getTime()
    const dateB = new Date(b.event_date).getTime()
    const now = Date.now()
    
    return Math.abs(dateA - now) - Math.abs(dateB - now)
  })

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentDate)
  const monthName = currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">RememberMe</h1>
                <p className="text-sm text-slate-400">Fale naturalmente, a IA entende TUDO</p>
              </div>
            </div>

            {/* Search & Filters */}
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <div className="relative flex-1 lg:flex-initial">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar eventos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full lg:w-64 pl-10 pr-4 py-2 bg-slate-800 rounded-lg border border-slate-700 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 text-sm"
                />
              </div>

              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-3 py-2 bg-slate-800 rounded-lg border border-slate-700 focus:border-purple-500 focus:outline-none text-sm"
              >
                <option value="all">Todas categorias</option>
                <option value="urgent">Urgente</option>
                <option value="soon">Em breve</option>
                <option value="distant">Distante</option>
              </select>
            </div>

            {/* View Toggle */}
            <div className="flex gap-2 bg-slate-800 p-1 rounded-lg w-full lg:w-auto overflow-x-auto">
              <button
                onClick={() => setViewMode('timeline')}
                className={`px-3 py-2 rounded-md transition-all flex items-center gap-2 whitespace-nowrap text-sm ${
                  viewMode === 'timeline' 
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500' 
                    : 'hover:bg-slate-700'
                }`}
              >
                <List className="w-4 h-4" />
                Timeline
              </button>
              
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-3 py-2 rounded-md transition-all flex items-center gap-2 whitespace-nowrap text-sm ${
                  viewMode === 'calendar'
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500' 
                    : 'hover:bg-slate-700'
                }`}
              >
                <Grid3x3 className="w-4 h-4" />
                Calendário
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Split Screen */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Side - Timeline/Calendar */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="max-w-4xl mx-auto">
            {/* Sugestões Inteligentes */}
            {suggestions.length > 0 && (
              <div className="mb-6 p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  <h3 className="font-semibold text-purple-300">Sugestões Inteligentes</h3>
                </div>
                <div className="space-y-2">
                  {suggestions.map((suggestion, idx) => (
                    <p key={idx} className="text-sm text-slate-300">• {suggestion}</p>
                  ))}
                </div>
              </div>
            )}

            {viewMode === 'timeline' ? (
              /* Timeline View */
              <div className="space-y-4">
                {sortedEvents.length === 0 ? (
                  <div className="text-center py-20">
                    <Clock className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                    <h2 className="text-xl font-semibold text-slate-400 mb-2">
                      Nenhum evento ainda
                    </h2>
                    <p className="text-slate-500">
                      Digite qualquer coisa - a IA vai entender!
                    </p>
                  </div>
                ) : (
                  sortedEvents.map((event) => {
                    const eventDate = new Date(event.event_date)
                    const urgency = getUrgencyLevel(eventDate)
                    const timeUntil = getTimeUntil(eventDate)
                    const isPast = eventDate.getTime() < Date.now()
                    const categoryEmoji = CATEGORY_EMOJIS[event.urgency || 'geral']
                    const categoryColor = CATEGORY_COLORS[event.urgency || 'geral']

                    const urgencyBadge = {
                      urgent: 'bg-red-500/20 text-red-300 border-red-500/50',
                      soon: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
                      distant: 'bg-green-500/20 text-green-300 border-green-500/50'
                    }

                    return (
                      <div
                        key={event.id}
                        draggable
                        onDragStart={() => setDraggedEvent(event)}
                        className={`relative p-6 rounded-2xl border backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] cursor-move ${
                          isPast 
                            ? 'bg-slate-800/30 border-slate-700/50 opacity-60' 
                            : `bg-gradient-to-br ${categoryColor}`
                        }`}
                      >
                        {/* Urgency Badge */}
                        {!isPast && (
                          <div className={`absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-semibold border ${urgencyBadge[urgency]}`}>
                            {urgency === 'urgent' && '🔴 Urgente'}
                            {urgency === 'soon' && '🟡 Em breve'}
                            {urgency === 'distant' && '🟢 Distante'}
                          </div>
                        )}

                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            {editingEvent === event.id ? (
                              <div className="flex gap-2 mb-2">
                                <input
                                  type="text"
                                  value={editTitle}
                                  onChange={(e) => setEditTitle(e.target.value)}
                                  className="flex-1 px-3 py-2 bg-slate-800 rounded-lg border border-slate-700 focus:border-purple-500 focus:outline-none text-sm"
                                  autoFocus
                                />
                                <button
                                  onClick={() => updateEvent(event.id, editTitle)}
                                  className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setEditingEvent(null)}
                                  className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <h3 className="text-xl font-bold mb-2">{event.title}</h3>
                            )}
                            <div className="flex flex-col gap-2 text-sm text-slate-300">
                              <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {eventDate.toLocaleString('pt-BR', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                              {!isPast && (
                                <span className="flex items-center gap-1 font-semibold">
                                  <AlertCircle className="w-4 h-4" />
                                  {timeUntil}
                                </span>
                              )}
                              {isPast && (
                                <span className="text-slate-500">Evento passado</span>
                              )}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            {!editingEvent && (
                              <button
                                onClick={() => {
                                  setEditingEvent(event.id)
                                  setEditTitle(event.title)
                                }}
                                className="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-colors"
                              >
                                <Edit2 className="w-5 h-5" />
                              </button>
                            )}
                            <button
                              onClick={() => deleteEvent(event.id)}
                              className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            ) : (
              /* Calendar View */
              <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-4 lg:p-6">
                {/* Calendar Header */}
                <div className="flex items-center justify-between mb-6">
                  <button
                    onClick={previousMonth}
                    className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <h2 className="text-xl lg:text-2xl font-bold capitalize">{monthName}</h2>
                  <button
                    onClick={nextMonth}
                    className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>

                {/* Week Days */}
                <div className="grid grid-cols-7 gap-1 lg:gap-2 mb-2">
                  {weekDays.map(day => (
                    <div key={day} className="text-center text-xs lg:text-sm font-semibold text-slate-400 py-2">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-1 lg:gap-2">
                  {/* Empty cells before first day */}
                  {Array.from({ length: startingDayOfWeek }).map((_, i) => (
                    <div key={`empty-${i}`} className="aspect-square" />
                  ))}

                  {/* Days */}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1
                    const dayEvents = getEventsForDay(day)
                    const isToday = new Date().getDate() === day &&
                                    new Date().getMonth() === currentDate.getMonth() &&
                                    new Date().getFullYear() === currentDate.getFullYear()

                    return (
                      <div
                        key={day}
                        onClick={() => {
                          const clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
                          setSelectedDate(clickedDate)
                          setShowEventModal(true)
                        }}
                        className={`aspect-square p-1 lg:p-2 rounded-lg border transition-all hover:scale-105 cursor-pointer ${
                          isToday 
                            ? 'bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500/50' 
                            : 'bg-slate-800/30 border-slate-700/50'
                        } ${dayEvents.length > 0 ? 'ring-2 ring-blue-500/50' : ''}`}
                      >
                        <div className="text-xs lg:text-sm font-semibold mb-1">{day}</div>
                        <div className="space-y-1">
                          {dayEvents.slice(0, 2).map(event => {
                            const eventDate = new Date(event.event_date)
                            const urgency = getUrgencyLevel(eventDate)
                            const dotColor = {
                              urgent: 'bg-red-500',
                              soon: 'bg-yellow-500',
                              distant: 'bg-green-500'
                            }

                            return (
                              <div
                                key={event.id}
                                className="text-[10px] lg:text-xs truncate flex items-center gap-1"
                                title={event.title}
                              >
                                <div className={`w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full ${dotColor[urgency]}`} />
                                <span className="truncate">{event.title}</span>
                              </div>
                            )
                          })}
                          {dayEvents.length > 2 && (
                            <div className="text-[10px] lg:text-xs text-slate-400">
                              +{dayEvents.length - 2}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side - Chat Interface (Fixed Height) */}
        <div className="w-full lg:w-96 h-[400px] lg:h-auto border-t lg:border-t-0 lg:border-l border-slate-800 bg-slate-950/50 flex flex-col">
          {/* Chat Header */}
          <div className="p-4 border-b border-slate-800 flex-shrink-0">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Chat com IA
            </h3>
            <p className="text-xs text-slate-400">Fale QUALQUER COISA - a IA entende tudo!</p>
          </div>

          {/* Chat History - Scrollable */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatHistory.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p className="text-sm mb-2">💬 Comece a conversar</p>
                <p className="text-xs">A IA processa QUALQUER mensagem:</p>
                <div className="mt-2 space-y-1 text-xs">
                  <p>• "Dentista amanhã às 14h"</p>
                  <p>• "Oi, tudo bem?"</p>
                  <p>• "Lembrar de comprar leite"</p>
                  <p>• "Quando foi a última vez que fui ao médico?"</p>
                  <p>• "Mostrar estatísticas"</p>
                </div>
              </div>
            ) : (
              <>
                {chatHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg ${
                      msg.type === 'user'
                        ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 ml-4'
                        : 'bg-slate-800/50 mr-4'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-line">{msg.message}</p>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </>
            )}
          </div>

          {/* Chat Input - Fixed at Bottom */}
          <div className="p-4 border-t border-slate-800 flex-shrink-0">
            <form onSubmit={handleSubmit}>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={startVoiceInput}
                  disabled={isListening}
                  className={`p-3 rounded-xl transition-all flex-shrink-0 ${
                    isListening 
                      ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                      : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Digite QUALQUER coisa..."
                  className="flex-1 px-4 py-3 bg-slate-800 rounded-xl border border-slate-700 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all text-sm"
                  disabled={loading}
                />
                
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="p-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex-shrink-0"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>

      {/* Modal para criar evento */}
      {showEventModal && selectedDate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">Novo Evento</h3>
              <button
                onClick={() => {
                  setShowEventModal(false)
                  setNewEventTitle('')
                  setNewEventTime('09:00')
                  setSelectedDate(null)
                }}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2 text-slate-300">
                  Data
                </label>
                <div className="px-4 py-3 bg-slate-800 rounded-lg border border-slate-700">
                  {selectedDate.toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2 text-slate-300">
                  Título do Evento
                </label>
                <input
                  type="text"
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  placeholder="Ex: Reunião com cliente"
                  className="w-full px-4 py-3 bg-slate-800 rounded-lg border border-slate-700 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2 text-slate-300">
                  Horário
                </label>
                <input
                  type="time"
                  value={newEventTime}
                  onChange={(e) => setNewEventTime(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-800 rounded-lg border border-slate-700 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowEventModal(false)
                    setNewEventTitle('')
                    setNewEventTime('09:00')
                    setSelectedDate(null)
                  }}
                  className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={createEventFromCalendar}
                  disabled={!newEventTitle.trim()}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                >
                  Criar Evento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
