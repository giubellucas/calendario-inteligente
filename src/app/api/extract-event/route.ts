import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export interface ExtractedEventData {
  title: string
  date: Date
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

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Mensagem inválida' },
        { status: 400 }
      )
    }

    // Validar se a chave da API está configurada
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY não está configurada')
      return NextResponse.json(
        { error: 'Configuração da API ausente. Configure a chave da OpenAI.' },
        { status: 500 }
      )
    }

    let completion
    try {
      completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Você é um assistente avançado de processamento de linguagem natural que analisa QUALQUER tipo de mensagem e extrai informações estruturadas.

**SUA MISSÃO:** Analisar a mensagem do usuário e extrair o máximo de informações possível, independentemente do tipo de mensagem.

**TIPOS DE MENSAGENS QUE VOCÊ DEVE PROCESSAR:**
1. **Eventos e Compromissos:** "Dentista amanhã às 14h", "Reunião sexta"
2. **Lembretes Gerais:** "Lembrar de comprar pão", "Não esquecer de ligar para mãe"
3. **Tarefas:** "Fazer relatório", "Estudar para prova"
4. **Perguntas:** "Quando foi a última vez que fui ao dentista?"
5. **Comandos:** "Mostrar estatísticas", "Listar eventos"
6. **Conversas Casuais:** "Oi, tudo bem?", "Obrigado"
7. **Qualquer outra mensagem:** Interprete e extraia informações relevantes

**INFORMAÇÕES A EXTRAIR (quando aplicável):**
- **title:** Título/resumo da mensagem (SEMPRE obrigatório - crie um título descritivo)
- **date:** Data/hora mencionada (formato ISO) - se não houver, use null
- **description:** Descrição detalhada ou contexto adicional
- **category:** Categoria inferida (trabalho, pessoal, saúde, estudo, lazer, compras, social, etc.)
- **priority:** Prioridade inferida (high, medium, low) baseada no contexto
- **location:** Local mencionado
- **participants:** Pessoas mencionadas
- **entities:** Entidades nomeadas (pessoas, lugares, organizações)
- **intent:** Intenção do usuário (criar_evento, fazer_pergunta, lembrete, tarefa, conversa, comando)
- **sentiment:** Sentimento da mensagem (positivo, negativo, neutro)
- **keywords:** Palavras-chave importantes extraídas

**REGRAS IMPORTANTES:**
1. **SEMPRE crie um título descritivo**, mesmo que a mensagem não seja sobre um evento
2. Se houver data/hora mencionada, extraia no formato ISO
3. Se não houver data, deixe como null (não invente datas)
4. Infira categoria, prioridade e sentimento baseado no contexto
5. Extraia TODAS as entidades nomeadas (pessoas, lugares, etc.)
6. Identifique a intenção principal do usuário
7. Seja flexível - processe QUALQUER tipo de mensagem

**EXEMPLOS DE PROCESSAMENTO:**

Mensagem: "Dentista amanhã às 14h"
→ title: "Dentista", date: [amanhã 14h], category: "saúde", intent: "criar_evento", priority: "medium"

Mensagem: "Lembrar de comprar leite"
→ title: "Comprar leite", date: null, category: "compras", intent: "lembrete", priority: "low"

Mensagem: "Quando foi a última vez que fui ao médico?"
→ title: "Consulta sobre histórico médico", date: null, category: "saúde", intent: "fazer_pergunta"

Mensagem: "Oi, tudo bem?"
→ title: "Saudação", date: null, category: "social", intent: "conversa", sentiment: "positivo"

Mensagem: "Fazer relatório urgente para o João até sexta"
→ title: "Fazer relatório para João", date: [sexta], category: "trabalho", intent: "tarefa", priority: "high", participants: ["João"]

**Data/hora atual de referência:** ${new Date().toISOString()}

**IMPORTANTE:** Responda APENAS com um objeto JSON válido, sem texto adicional. SEMPRE inclua pelo menos o campo "title".`
          },
          {
            role: 'user',
            content: message
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4
      })
    } catch (apiError: any) {
      console.error('Erro na chamada da API OpenAI:', apiError)
      
      // Tratamento específico de erros da OpenAI
      if (apiError.status === 401) {
        return NextResponse.json(
          { error: 'Chave da API inválida. Verifique sua OPENAI_API_KEY.' },
          { status: 500 }
        )
      }
      
      if (apiError.status === 429) {
        return NextResponse.json(
          { error: 'Limite de requisições excedido. Tente novamente em alguns instantes.' },
          { status: 429 }
        )
      }
      
      return NextResponse.json(
        { error: `Erro na API da OpenAI: ${apiError.message || 'Erro desconhecido'}` },
        { status: 500 }
      )
    }

    const result = completion.choices[0]?.message?.content
    if (!result) {
      console.error('Nenhuma resposta da IA')
      return NextResponse.json(
        { error: 'Nenhuma resposta da IA' },
        { status: 500 }
      )
    }

    let parsed
    try {
      parsed = JSON.parse(result)
    } catch (parseError) {
      console.error('Erro ao fazer parse da resposta da IA:', parseError)
      console.error('Resposta recebida:', result)
      return NextResponse.json(
        { error: 'Resposta da IA em formato inválido' },
        { status: 500 }
      )
    }
    
    // Validar se tem pelo menos o título
    if (!parsed.title) {
      console.error('Resposta da IA sem título:', parsed)
      return NextResponse.json(
        { error: 'Não foi possível processar a mensagem' },
        { status: 400 }
      )
    }

    // Converter data string para Date object (se existir)
    let eventDate = null
    if (parsed.date) {
      eventDate = new Date(parsed.date)
      if (isNaN(eventDate.getTime())) {
        eventDate = null // Se data inválida, deixa como null
      }
    }

    const extractedData: ExtractedEventData = {
      title: parsed.title,
      date: eventDate,
      description: parsed.description,
      category: parsed.category,
      priority: parsed.priority,
      location: parsed.location,
      participants: parsed.participants,
      entities: parsed.entities,
      intent: parsed.intent,
      sentiment: parsed.sentiment,
      keywords: parsed.keywords
    }

    return NextResponse.json(extractedData)
  } catch (error: any) {
    console.error('Erro ao processar mensagem:', error)
    return NextResponse.json(
      { error: `Erro ao processar: ${error.message || 'Erro desconhecido'}` },
      { status: 500 }
    )
  }
}
