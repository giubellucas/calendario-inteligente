import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Interface Event ajustada para corresponder exatamente à estrutura do banco
export interface Event {
  id: string
  title: string
  description?: string
  event_date: string
  notified: boolean
  urgency?: string
  user_id: string
  created_at?: string
  updated_at?: string
  is_completed?: boolean
}
