/** Envía el saludo inicial de conexión usando el prompt definido en el backend. */
export const sendConnectGreeting = (channel: RTCDataChannel, instruction: string) => {
  channel.send(
    JSON.stringify({
      type: "response.create",
      response: {
        instructions: instruction,
      },
    }),
  )
}
