import { defineHandler } from 'nitro'

export default defineHandler(() => {
  return { api: 'works!' }
})
