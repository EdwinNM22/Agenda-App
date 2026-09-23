/** Canal de eventos Realtime (WebRTC datachannel o WebSocket de texto). */
export type RealtimeChannel = {
  readyState: "open" | "connecting" | "closing" | "closed"
  send: (data: string) => void
}

export const channelFromWebSocket = (ws: WebSocket): RealtimeChannel => ({
  get readyState() {
    if (ws.readyState === WebSocket.OPEN) {
      return "open"
    }
    if (ws.readyState === WebSocket.CONNECTING) {
      return "connecting"
    }
    if (ws.readyState === WebSocket.CLOSING) {
      return "closing"
    }
    return "closed"
  },
  send: (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  },
})
