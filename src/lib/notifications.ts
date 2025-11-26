/**
 * Sistema de notificações e wake lock
 */

/**
 * Solicita permissão para notificações
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('Notificações não suportadas neste navegador')
    return false
  }

  if (Notification.permission === 'granted') {
    return true
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  }

  return false
}

/**
 * Envia notificação imediata
 */
export function sendNotification(title: string, body?: string): void {
  if (Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
    })
  }
}

/**
 * Agenda notificação para um evento
 */
export function scheduleNotification(
  eventId: string,
  title: string,
  eventDate: Date
): void {
  const now = Date.now()
  const eventTime = eventDate.getTime()
  const diff = eventTime - now

  // Notificar 15 minutos antes
  const notificationTime = diff - 15 * 60 * 1000

  if (notificationTime > 0) {
    setTimeout(() => {
      sendNotification('Lembrete: ' + title, `Evento em 15 minutos`)
    }, notificationTime)
  }

  // Notificar no momento do evento
  if (diff > 0) {
    setTimeout(() => {
      sendNotification('Evento agora: ' + title)
    }, diff)
  }
}

/**
 * Solicita wake lock para manter tela ativa
 */
export async function requestWakeLock(): Promise<void> {
  if ('wakeLock' in navigator) {
    try {
      await (navigator as any).wakeLock.request('screen')
      console.log('Wake lock ativado')
    } catch (err) {
      console.error('Erro ao ativar wake lock:', err)
    }
  }
}
